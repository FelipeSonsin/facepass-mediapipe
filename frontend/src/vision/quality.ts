// Avaliação da qualidade do rosto em um quadro: tamanho, posição, giro, inclinação e luz.
// Usa apenas os pontos do MediaPipe e os pixels do mesmo quadro.
import { QUALITY } from '../config/recognition'
import { MESH, type NormalizedLandmark } from './keypoints'

export type QualityIssue = 'too-small' | 'too-large' | 'off-center' | 'near-edge' | 'turned' | 'tilted' | 'dark' | 'bright'

export interface QualityReport {
  ok: boolean
  issue: QualityIssue | null
  /** Caixa do rosto normalizada (0–1) no quadro não espelhado. */
  box: { x: number; y: number; w: number; h: number }
  /** Pose resumida, usada para exigir pequenas variações entre amostras do cadastro. */
  pose: { cx: number; cy: number; noseX: number; noseY: number; iod: number }
}

export type QualityConfig = { readonly [K in keyof typeof QUALITY]: number }

/** Luminância média de uma região do quadro RGBA (amostragem esparsa). */
export function meanLuma(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  box: { x: number; y: number; w: number; h: number },
): number {
  const x0 = Math.max(0, Math.floor(box.x * width))
  const y0 = Math.max(0, Math.floor(box.y * height))
  const x1 = Math.min(width, Math.ceil((box.x + box.w) * width))
  const y1 = Math.min(height, Math.ceil((box.y + box.h) * height))
  const step = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 24))
  let sum = 0
  let n = 0
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * width + x) * 4
      sum += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]
      n++
    }
  }
  return n ? sum / n : 0
}

export function assessQuality(
  lm: NormalizedLandmark[],
  width: number,
  height: number,
  brightness: number | null,
  config: QualityConfig = QUALITY,
): QualityReport {
  let minX = 1, minY = 1, maxX = 0, maxY = 0
  for (const p of lm) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  const box = { x: minX, y: minY, w: maxX - minX, h: maxY - minY }

  const px = (i: number) => [lm[i].x * width, lm[i].y * height] as const
  const re = [(px(MESH.rightEyeOuter)[0] + px(MESH.rightEyeInner)[0]) / 2, (px(MESH.rightEyeOuter)[1] + px(MESH.rightEyeInner)[1]) / 2]
  const le = [(px(MESH.leftEyeOuter)[0] + px(MESH.leftEyeInner)[0]) / 2, (px(MESH.leftEyeOuter)[1] + px(MESH.leftEyeInner)[1]) / 2]
  const nose = px(MESH.noseTip)
  const iod = Math.hypot(le[0] - re[0], le[1] - re[1])
  const eyeMid = [(re[0] + le[0]) / 2, (re[1] + le[1]) / 2]
  // Projeção do nariz na direção da linha dos olhos: ~0 quando o rosto está de frente.
  const ux = (le[0] - re[0]) / (iod || 1), uy = (le[1] - re[1]) / (iod || 1)
  const yaw = ((nose[0] - eyeMid[0]) * ux + (nose[1] - eyeMid[1]) * uy) / (iod || 1)
  const roll = (Math.atan2(le[1] - re[1], le[0] - re[0]) * 180) / Math.PI

  const pose = {
    cx: box.x + box.w / 2,
    cy: box.y + box.h / 2,
    noseX: nose[0] / width,
    noseY: nose[1] / height,
    iod: iod / width,
  }

  let issue: QualityIssue | null = null
  if (box.w < config.minFaceWidthRatio || iod < config.minInterocularPx) issue = 'too-small'
  else if (box.w > config.maxFaceWidthRatio) issue = 'too-large'
  else if (
    box.x < config.edgeMargin ||
    box.y < config.edgeMargin ||
    box.x + box.w > 1 - config.edgeMargin ||
    box.y + box.h > 1 - config.edgeMargin
  )
    issue = 'near-edge'
  else if (Math.abs(pose.cx - 0.5) > config.maxCenterOffset || Math.abs(pose.cy - 0.5) > config.maxCenterOffset) issue = 'off-center'
  else if (Math.abs(yaw) > config.maxYawRatio) issue = 'turned'
  else if (Math.abs(roll) > config.maxRollDeg) issue = 'tilted'
  else if (brightness !== null && brightness < config.minBrightness) issue = 'dark'
  else if (brightness !== null && brightness > config.maxBrightness) issue = 'bright'

  return { ok: issue === null, issue, box, pose }
}

/** Variação de posição entre duas amostras, em unidades da distância entre os olhos. */
export function poseChange(a: QualityReport['pose'], b: QualityReport['pose']): number {
  const iod = (a.iod + b.iod) / 2 || 1
  const dCenter = Math.hypot(a.cx - b.cx, a.cy - b.cy)
  const dNose = Math.hypot(a.noseX - a.cx - (b.noseX - b.cx), a.noseY - a.cy - (b.noseY - b.cy))
  const dScale = Math.abs(a.iod - b.iod)
  return Math.max(dCenter, dNose, dScale) / iod
}

export const ISSUE_MESSAGES: Record<QualityIssue, string> = {
  'too-small': 'Aproxime-se um pouco da câmera.',
  'too-large': 'Afaste-se um pouco da câmera.',
  'off-center': 'Centralize o rosto na moldura.',
  'near-edge': 'Centralize o rosto na moldura.',
  turned: 'Olhe para a câmera, de frente.',
  tilted: 'Mantenha a cabeça reta.',
  dark: 'Ilumine melhor o rosto.',
  bright: 'Há luz demais no rosto. Evite luz direta.',
}
