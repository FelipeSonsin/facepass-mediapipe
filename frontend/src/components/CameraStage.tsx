import { Camera, CameraOff, LoaderCircle, RotateCcw, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { camera, CAMERA_ERRORS, useCamera } from '../camera/cameraController'
import { startCamera } from '../camera/startCamera'
import { analyzer, useModelState } from '../vision/analyzer'
import { Button } from './Button'
import { FrameGuide, type GuideTone } from './FrameGuide'

interface Props {
  tone: GuideTone
  /** Mensagem curta sobre o vídeo (orientação de posição, captura etc.). */
  hint?: string | null
  progress?: { count: number; total: number }
  /** Rótulo acessível do vídeo. */
  label: string
  /** Conteúdo extra na barra de controles, à direita do botão da câmera. */
  controls?: ReactNode
  /** Classe de proporção mínima do palco quando a câmera está desligada. */
  className?: string
}

export function CameraStage({ tone, hint, progress, label, controls, className = '' }: Props) {
  const cam = useCamera()
  const models = useModelState()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [aspect, setAspect] = useState(16 / 9)
  // Stream que já entregou quadros; comparar com o atual evita estado "tocando" herdado.
  const [playingStream, setPlayingStream] = useState<MediaStream | null>(null)
  const playing = !!cam.stream && playingStream === cam.stream

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const stream = cam.stream
    if (!stream) {
      video.srcObject = null
      return
    }
    video.srcObject = stream
    const onReady = () => {
      if (video.videoWidth && video.videoHeight) setAspect(video.videoWidth / video.videoHeight)
      setPlayingStream(stream)
      analyzer.attachVideo(video)
    }
    video.addEventListener('loadeddata', onReady)
    video.play().catch(() => {
      /* autoplay de vídeo mudo é permitido; erros reais chegam pelo evento "error" */
    })
    if (video.readyState >= 2) onReady()
    return () => {
      video.removeEventListener('loadeddata', onReady)
      analyzer.attachVideo(null)
    }
  }, [cam.stream])

  const on = cam.status === 'on'
  const loadingModels = on && models.status === 'loading'
  const ready = on && playing && models.status === 'ready'

  let overlay: ReactNode = null
  if (cam.status === 'error' && cam.error) {
    const e = CAMERA_ERRORS[cam.error]
    overlay = (
      <StageMessage icon={<TriangleAlert className="size-6 text-attn" aria-hidden />} title={e.title} body={e.action}>
        {cam.error !== 'insecure' && cam.error !== 'unsupported' ? (
          <Button variant="secondary" icon={<RotateCcw className="size-4" aria-hidden />} onClick={startCamera}>
            Tentar de novo
          </Button>
        ) : null}
      </StageMessage>
    )
  } else if (on && models.status === 'error') {
    overlay = (
      <StageMessage
        icon={<TriangleAlert className="size-6 text-attn" aria-hidden />}
        title="Os modelos de reconhecimento não carregaram."
        body="Verifique a conexão com o servidor do FacePass e tente de novo."
      >
        <Button variant="secondary" icon={<RotateCcw className="size-4" aria-hidden />} onClick={() => void analyzer.ensureModels()}>
          Carregar de novo
        </Button>
      </StageMessage>
    )
  } else if (cam.status === 'off') {
    overlay = (
      <StageMessage icon={<CameraOff className="size-6 text-muted" aria-hidden />} title="Câmera desligada" body="Ative a câmera para posicionar o rosto.">
        <Button icon={<Camera className="size-4" aria-hidden />} onClick={startCamera}>
          Ativar câmera
        </Button>
      </StageMessage>
    )
  } else if (cam.status === 'starting' || loadingModels || (on && !playing)) {
    overlay = (
      <StageMessage
        icon={<LoaderCircle className="size-6 animate-spin-slow text-muted" aria-hidden />}
        title={cam.status === 'starting' ? 'Ativando câmera…' : 'Carregando modelos…'}
        body={cam.status === 'starting' ? 'Permita o acesso à câmera, se o navegador pedir.' : 'Na primeira vez, isso pode levar alguns segundos.'}
      />
    )
  }

  return (
    <section aria-label={label} className="overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-panel)]">
      <div className="flex min-h-13 items-center justify-between gap-3 border-b border-line px-4 sm:px-5">
        <p className="text-sm font-medium">Prévia da câmera</p>
        <p className="flex items-center gap-2 text-xs text-muted" role="status">
          <span className={`size-1.5 rounded-full ${on ? 'bg-ok' : cam.status === 'error' ? 'bg-attn' : 'bg-line-strong'}`} aria-hidden />
          {on ? 'Ativa' : cam.status === 'starting' ? 'Ativando…' : cam.status === 'error' ? 'Indisponível' : 'Desligada'}
        </p>
      </div>
      <div
        className={`relative w-full overflow-hidden ${on && playing ? 'bg-[#111827]' : 'bg-raised'} ${className}`}
        style={{
          aspectRatio: on && playing ? String(aspect) : undefined,
          minHeight: cam.status === 'error' || models.status === 'error' ? '20rem' : undefined,
        }}
      >
        <video
          ref={videoRef}
          className={`absolute inset-0 h-full w-full -scale-x-100 object-cover transition-opacity duration-300 ${on && playing ? 'opacity-100' : 'opacity-0'}`}
          muted
          playsInline
          autoPlay
          aria-label={label}
          onError={() => camera.reportInterrupted()}
        />
        {ready ? <FrameGuide tone={tone} progress={progress} /> : null}
        {ready && hint ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3 sm:p-4">
            <p
              role="status"
              className="max-w-[min(32rem,100%)] rounded-lg bg-[#17212f]/85 px-3.5 py-2 text-center text-sm text-white"
            >
              {hint}
            </p>
          </div>
        ) : null}
        {overlay ? <div className="absolute inset-0 flex items-center justify-center bg-raised p-6">{overlay}</div> : null}
      </div>
      {on || cam.status === 'starting' || controls ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-2.5 sm:px-5">
          {on || cam.status === 'starting' ? (
            <Button variant="ghost" size="sm" icon={<CameraOff className="size-4" aria-hidden />} onClick={() => camera.stop()}>
              Desligar câmera
            </Button>
          ) : null}
          <div className="ml-auto flex min-w-0 items-center gap-2">{controls}</div>
        </div>
      ) : null}
    </section>
  )
}

function StageMessage({ icon, title, body, children }: { icon: ReactNode; title: string; body: string; children?: ReactNode }) {
  return (
    <div className="flex max-w-sm flex-col items-center gap-4 text-center">
      <span className="mb-1 grid size-12 place-items-center text-muted">{icon}</span>
      <div>
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-1 text-sm text-muted">{body}</p>
      </div>
      {children}
    </div>
  )
}
