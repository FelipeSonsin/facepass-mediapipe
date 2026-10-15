// Ciclo único de análise dos quadros da câmera.
//
// - Um só ciclo para o app inteiro: a aba visível registra seu <video> e um "consumidor".
// - O vídeo é exibido pelo navegador na taxa nativa; a análise roda a no máximo
//   PROCESSING.analysisFps e o SFace roda num worker, uma inferência por vez.
// - Cada análise é feita sobre UM quadro copiado para um canvas: os pontos do MediaPipe
//   e os pixels enviados ao SFace vêm desse mesmo quadro.
// - Toda troca de câmera, de aba, de consumidor ou de cadastros abre uma nova sessão;
//   resultados de sessões anteriores são descartados.
import { useSyncExternalStore } from 'react'
import { PROCESSING } from '../config/recognition'
import { SfaceEmbedder } from '../sface/sfaceClient'
import type { VisionModels } from './faceLandmarker'
import { sfaceKeypoints, type NormalizedLandmark } from './keypoints'
import { assessQuality, meanLuma, type QualityReport } from './quality'

export interface FrameAnalysis {
  session: number
  frameId: number
  frameTime: number
  faceCount: number
  landmarks: NormalizedLandmark[] | null
  quality: QualityReport | null
  /** true quando há um único rosto em boas condições e o SFace está livre. */
  canEmbed: boolean
}

export interface FrameEmbedding {
  session: number
  frameId: number
  frameTime: number
  embedding: Float32Array
  pose: QualityReport['pose']
}

export interface AnalysisConsumer {
  onSession(session: number): void
  /** Retorne true para gerar o embedding deste quadro (só vale se analysis.canEmbed). */
  onAnalysis(analysis: FrameAnalysis): boolean
  onEmbedding(result: FrameEmbedding): void
  onError(message: string): void
}

export interface ModelState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  delegate: string | null
}

/** Estado leve para a moldura e as mensagens da câmera (atualizado a cada análise). */
export interface FrameState {
  faceCount: number
  issue: QualityReport['issue'] | 'no-face' | 'unreadable' | null
  active: boolean
}

const IDLE_FRAME: FrameState = { faceCount: 0, issue: null, active: false }

type Listener = () => void

class FrameAnalyzer {
  private models: { vision: VisionModels; embedder: SfaceEmbedder } | null = null
  private loading: Promise<void> | null = null
  private modelState: ModelState = { status: 'idle', error: null, delegate: null }
  private frame: FrameState = IDLE_FRAME
  private modelListeners = new Set<Listener>()
  private frameListeners = new Set<Listener>()

  private video: HTMLVideoElement | null = null
  private consumer: AnalysisConsumer | null = null
  private session = 0
  private frameId = 0
  private lastAnalysis = 0
  private lastMediaTime = -1
  private running = false
  private rvfcHandle = 0
  private rafHandle = 0
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null

  // ---- estado observável ----
  subscribeModels = (l: Listener) => {
    this.modelListeners.add(l)
    return () => this.modelListeners.delete(l)
  }
  getModels = () => this.modelState
  subscribeFrame = (l: Listener) => {
    this.frameListeners.add(l)
    return () => this.frameListeners.delete(l)
  }
  getFrame = () => this.frame

  private setModels(patch: Partial<ModelState>) {
    this.modelState = { ...this.modelState, ...patch }
    this.modelListeners.forEach((l) => l())
  }
  private setFrame(next: FrameState) {
    const f = this.frame
    if (f.faceCount === next.faceCount && f.issue === next.issue && f.active === next.active) return
    this.frame = next
    this.frameListeners.forEach((l) => l())
  }

  /** Carrega MediaPipe e SFace (uma vez). O worker do SFace é criado primeiro para
   *  que os dois carregamentos ocorram em paralelo. */
  ensureModels(): Promise<void> {
    if (this.models) return Promise.resolve()
    if (this.loading) return this.loading
    this.setModels({ status: 'loading', error: null })
    const embedder = new SfaceEmbedder()
    // O MediaPipe só é baixado quando a câmera é ativada pela primeira vez.
    const vision = import('./faceLandmarker').then((m) => m.createVisionModels('VIDEO'))
    this.loading = Promise.all([vision, embedder.whenReady()])
      .then(([vision]) => {
        this.models = { vision, embedder }
        this.setModels({ status: 'ready', delegate: vision.delegate })
        this.kick()
      })
      .catch((err) => {
        embedder.dispose()
        this.loading = null
        this.setModels({ status: 'error', error: err instanceof Error ? err.message : String(err) })
      })
    return this.loading
  }

  /** O elemento <video> visível passa a ser a fonte dos quadros. */
  attachVideo(video: HTMLVideoElement | null) {
    if (this.video === video) return
    this.video = video
    this.newSession()
    this.kick()
  }

  setConsumer(consumer: AnalysisConsumer | null) {
    this.consumer = consumer
    this.newSession()
    this.kick()
  }

  /** Invalida resultados em andamento (troca de câmera, cadastros alterados, reinício). */
  newSession() {
    this.session++
    this.lastMediaTime = -1
    this.consumer?.onSession(this.session)
    this.setFrame(IDLE_FRAME)
  }

  private kick() {
    const ready = !!(this.models && this.video && this.consumer)
    if (ready && !this.running) {
      this.running = true
      this.schedule()
    } else if (!ready && this.running) {
      this.stopLoop()
    }
  }

  private stopLoop() {
    this.running = false
    if (this.video && this.rvfcHandle && 'cancelVideoFrameCallback' in this.video) this.video.cancelVideoFrameCallback(this.rvfcHandle)
    cancelAnimationFrame(this.rafHandle)
    this.rvfcHandle = 0
    this.rafHandle = 0
    this.setFrame(IDLE_FRAME)
  }

  private schedule() {
    if (!this.running || !this.video) return
    const video = this.video
    if ('requestVideoFrameCallback' in video) {
      this.rvfcHandle = video.requestVideoFrameCallback((now, meta) => this.tick(now, meta.mediaTime))
    } else {
      this.rafHandle = requestAnimationFrame((now) => this.tick(now, (video as HTMLVideoElement).currentTime))
    }
  }

  private tick(now: number, mediaTime: number) {
    if (!this.running) return
    try {
      const minGap = 1000 / PROCESSING.analysisFps
      // Só analisa quadros novos (mediaTime diferente) e respeitando a taxa de análise.
      if (now - this.lastAnalysis >= minGap && mediaTime !== this.lastMediaTime) {
        this.lastAnalysis = now
        this.lastMediaTime = mediaTime
        this.analyze()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.consumer?.onError(message)
      this.newSession()
    }
    this.schedule()
  }

  private analyze() {
    const video = this.video
    const models = this.models
    const consumer = this.consumer
    if (!video || !models || !consumer || video.readyState < 2 || !video.videoWidth) return

    const scale = Math.min(1, PROCESSING.maxAnalysisWidth / video.videoWidth)
    const w = Math.round(video.videoWidth * scale)
    const h = Math.round(video.videoHeight * scale)
    if (!this.canvas) {
      this.canvas = document.createElement('canvas')
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })
    }
    const canvas = this.canvas
    const ctx = this.ctx!
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    // Copia o quadro atual: daqui em diante, pontos e pixels vêm deste canvas.
    ctx.drawImage(video, 0, 0, w, h)
    const frameTime = performance.now()
    const frameId = ++this.frameId
    const session = this.session
    const obs = models.vision.observe(canvas, frameTime)

    let quality: QualityReport | null = null
    if (obs.landmarks) {
      const pre = assessQuality(obs.landmarks, w, h, null)
      const b = pre.box
      const bx = Math.max(0, Math.floor(b.x * w)), by = Math.max(0, Math.floor(b.y * h))
      const bw = Math.max(1, Math.min(w - bx, Math.ceil(b.w * w))), bh = Math.max(1, Math.min(h - by, Math.ceil(b.h * h)))
      const region = ctx.getImageData(bx, by, bw, bh)
      const luma = meanLuma(region.data, bw, bh, { x: 0, y: 0, w: 1, h: 1 })
      quality = assessQuality(obs.landmarks, w, h, luma)
    }

    const canEmbed = obs.faceCount === 1 && !!quality?.ok && !models.embedder.busy
    const analysis: FrameAnalysis = { session, frameId, frameTime, faceCount: obs.faceCount, landmarks: obs.landmarks, quality, canEmbed }
    this.setFrame({
      faceCount: obs.faceCount,
      issue: obs.faceCount === 0 ? 'no-face' : obs.faceCount === 1 && !quality ? 'unreadable' : (quality?.issue ?? null),
      active: true,
    })

    const wants = consumer.onAnalysis(analysis)
    if (!wants || !canEmbed || !obs.landmarks || !quality) return

    const points = sfaceKeypoints(obs.landmarks, w, h)
    const pixels = ctx.getImageData(0, 0, w, h).data.buffer as ArrayBuffer
    const pose = quality.pose
    models.embedder
      .embed({ width: w, height: h, pixels }, points)
      .then((r) => {
        // A imagem temporária foi transferida ao worker e descartada lá; só o vetor volta.
        if (session !== this.session || this.consumer !== consumer) return
        consumer.onEmbedding({ session, frameId, frameTime, embedding: r.embedding, pose })
      })
      .catch((err) => {
        if (session !== this.session || this.consumer !== consumer) return
        consumer.onError(err instanceof Error ? err.message : String(err))
      })
  }
}

export const analyzer = new FrameAnalyzer()

export function useModelState(): ModelState {
  return useSyncExternalStore(analyzer.subscribeModels, analyzer.getModels)
}

export function useFrameState(): FrameState {
  return useSyncExternalStore(analyzer.subscribeFrame, analyzer.getFrame)
}
