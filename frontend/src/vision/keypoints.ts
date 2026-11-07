// Conversão dos pontos do MediaPipe Face Mesh para os 5 pontos esperados pelo SFace.
//
// Ordem do OpenCV (a mesma do YuNet): olho direito, olho esquerdo, ponta do nariz,
// canto direito da boca, canto esquerdo da boca — "direito/esquerdo" da PESSOA,
// ou seja, o olho direito aparece à esquerda numa imagem não espelhada.
//
// Mapeamento escolhido por medição (validation/opencv_reference.py): entre candidatos
// semanticamente equivalentes, é o que gera embeddings mais próximos do pipeline oficial
// YuNet + alignCrop do OpenCV (cosseno médio 0,92 nas imagens de teste).
//   olho direito da pessoa:  ponto médio dos cantos 33 e 133
//   olho esquerdo da pessoa: ponto médio dos cantos 362 e 263
//   ponta do nariz: 4
//   cantos da boca: 62 (direito da pessoa) e 292 (esquerdo da pessoa)
// Usar o ponto médio dos cantos (e não a íris) também torna o alinhamento
// independente da direção do olhar.
import type { Point } from '../sface/similarityTransform'

export interface NormalizedLandmark {
  x: number
  y: number
  z?: number
}

export const MESH = {
  rightEyeOuter: 33,
  rightEyeInner: 133,
  rightIris: 468,
  leftEyeInner: 362,
  leftEyeOuter: 263,
  leftIris: 473,
  noseTip: 4,
  mouthRight: 62,
  mouthLeft: 292,
} as const

/** Estratégias mantidas para a página de validação; o app usa 'corners'. */
export type EyeCenterStrategy = 'corners' | 'iris' | 'blend'
export const EYE_CENTER_STRATEGY: EyeCenterStrategy = 'corners'

function px(l: NormalizedLandmark, w: number, h: number): Point {
  return [l.x * w, l.y * h]
}

function eyeCenter(lm: NormalizedLandmark[], a: number, b: number, iris: number, w: number, h: number, s: EyeCenterStrategy): Point {
  const pa = px(lm[a], w, h)
  const pb = px(lm[b], w, h)
  const corners: Point = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2]
  if (s === 'corners' || lm.length <= iris) return corners
  const pi = px(lm[iris], w, h)
  if (s === 'iris') return pi
  return [(corners[0] + pi[0]) / 2, (corners[1] + pi[1]) / 2]
}

/** 5 pontos em pixels do quadro analisado, na ordem do OpenCV/SFace. */
export function sfaceKeypoints(lm: NormalizedLandmark[], width: number, height: number, strategy = EYE_CENTER_STRATEGY): Point[] {
  if (lm.length < 468) throw new Error('Pontos faciais insuficientes')
  return [
    eyeCenter(lm, MESH.rightEyeOuter, MESH.rightEyeInner, MESH.rightIris, width, height, strategy),
    eyeCenter(lm, MESH.leftEyeInner, MESH.leftEyeOuter, MESH.leftIris, width, height, strategy),
    px(lm[MESH.noseTip], width, height),
    px(lm[MESH.mouthRight], width, height),
    px(lm[MESH.mouthLeft], width, height),
  ]
}
