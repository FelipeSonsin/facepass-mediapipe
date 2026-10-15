// Página de validação técnica (apenas em desenvolvimento: /validacao.html).
// Executa o pipeline real no navegador — MediaPipe → 5 pontos → alinhamento → SFace —
// sobre imagens de teste e expõe os resultados em window.__VALIDATION__ para o
// script validation/opencv_reference.py comparar com a implementação oficial do OpenCV.
import { createVisionModels } from '../vision/faceLandmarker'
import { sfaceKeypoints, type EyeCenterStrategy } from '../vision/keypoints'
import { SfaceEmbedder } from '../sface/sfaceClient'
import type { Point } from '../sface/similarityTransform'

interface ImageReport {
  image: string
  width: number
  height: number
  faces: number
  landmarkerFaces: number
  guardFaces: number
  keypoints: Partial<Record<EyeCenterStrategy, Point[]>>
  landmarks?: [number, number][]
  embeddings: Record<string, number[]>
  rawNorms: Record<string, number>
  crops: Record<string, string>
  ms: Record<string, number>
}

declare global {
  interface Window {
    __VALIDATION__?: { ok: boolean; error?: string; delegate?: string; inputShape?: string[]; reports: ImageReport[] }
  }
}

const log = document.getElementById('log')!
function write(line: string) {
  log.textContent += line + '\n'
}

function cropToDataUrl(rgb: Uint8Array): string {
  const c = document.createElement('canvas')
  c.width = 112
  c.height = 112
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(112, 112)
  for (let i = 0; i < 112 * 112; i++) {
    img.data[i * 4] = rgb[i * 3]
    img.data[i * 4 + 1] = rgb[i * 3 + 1]
    img.data[i * 4 + 2] = rgb[i * 3 + 2]
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return c.toDataURL('image/png')
}

async function loadImage(src: string) {
  const img = new Image()
  img.src = src
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)
  return { canvas: c, ctx }
}

async function run() {
  const params = new URLSearchParams(location.search)
  const images = (params.get('imgs') ?? '').split(',').filter(Boolean)
  const external: Record<string, Point[]> = params.get('ext')
    ? await (await fetch(`/validation/out/${params.get('ext')}`)).json()
    : {}

  const t0 = performance.now()
  write('Carregando MediaPipe e SFace em paralelo…')
  const embedder = new SfaceEmbedder()
  const [vision, ready] = await Promise.all([createVisionModels('IMAGE'), embedder.whenReady()])
  const delegate = vision.delegate
  write(`MediaPipe carregado (delegate ${delegate}); SFace carregado: entrada ${ready.inputName} [${ready.inputShape.join(', ')}], saída ${ready.outputName} — ${(performance.now() - t0).toFixed(0)} ms`)

  const reports: ImageReport[] = []
  for (const name of images) {
    const { canvas, ctx } = await loadImage(`/validation/images/${name}`)
    const { width, height } = canvas
    const obs = vision.observe(canvas)
    const report: ImageReport = { image: name, width, height, faces: obs.faceCount, landmarkerFaces: obs.landmarkerFaces, guardFaces: obs.guardFaces, keypoints: {}, embeddings: {}, rawNorms: {}, crops: {}, ms: {} }
    const jobs: [string, Point[]][] = []
    if (obs.landmarks) {
      const lm = obs.landmarks
      report.landmarks = lm.map((l) => [l.x * width, l.y * height] as [number, number])
      for (const s of ['corners', 'iris', 'blend'] as const) {
        const kp = sfaceKeypoints(lm, width, height, s)
        report.keypoints[s] = kp
        jobs.push([`mp_${s}`, kp])
      }
    }
    if (external[name]) jobs.push(['external', external[name]])
    for (const [key, points] of jobs) {
      // Pixels e pontos vêm do mesmo canvas (mesmo quadro).
      const pixels = ctx.getImageData(0, 0, width, height).data.buffer
      const r = await embedder.embed({ width, height, pixels }, points, true)
      report.embeddings[key] = Array.from(r.embedding)
      report.rawNorms[key] = r.rawNorm
      report.ms[key] = r.ms
      if (r.crop) report.crops[key] = cropToDataUrl(r.crop)
    }
    write(`${name}: ${report.faces} rosto(s) [landmarker ${obs.landmarkerFaces}, guarda ${obs.guardFaces}]; embeddings: ${Object.keys(report.embeddings).join(', ') || '—'}`)
    reports.push(report)
  }
  vision.close()
  embedder.dispose()
  window.__VALIDATION__ = { ok: true, delegate, inputShape: ready.inputShape, reports }
  write('Concluído.')
}

run().catch((err) => {
  window.__VALIDATION__ = { ok: false, error: String(err), reports: [] }
  write(`ERRO: ${err}`)
})
