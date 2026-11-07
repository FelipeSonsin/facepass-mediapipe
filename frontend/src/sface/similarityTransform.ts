// Porta direta de FaceRecognizerSFImpl::getSimilarityTransformMatrix (OpenCV,
// modules/objdetect/src/face_recognize.cpp). Estimativa de Umeyama dos 5 pontos
// do rosto para o modelo de referência 112×112 usado no treino do SFace.

export type Point = readonly [number, number]
/** Matriz afim 2×3 em ordem de linha: [a, b, tx, c, d, ty]. */
export type Affine = [number, number, number, number, number, number]

/** Pontos de destino do OpenCV, na ordem: olho direito, olho esquerdo, nariz,
 *  canto direito da boca, canto esquerdo da boca (direita/esquerda da pessoa). */
export const SFACE_TEMPLATE: readonly Point[] = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
]
// O OpenCV usa esta média fixa (e não a média calculada do modelo).
const DST_MEAN: Point = [56.0262, 71.9008]

interface Svd2 {
  u: [[number, number], [number, number]]
  s: [number, number]
  vt: [[number, number], [number, number]]
}

/** SVD analítica de uma matriz 2×2, com valores singulares não negativos em ordem decrescente. */
export function svd2x2(a00: number, a01: number, a10: number, a11: number): Svd2 {
  const e = (a00 + a11) / 2
  const f = (a00 - a11) / 2
  const g = (a10 + a01) / 2
  const h = (a10 - a01) / 2
  const q = Math.hypot(e, h)
  const r = Math.hypot(f, g)
  let s1 = q + r
  let s2 = q - r
  const t1 = Math.atan2(g, f)
  const t2 = Math.atan2(h, e)
  const theta = (t2 - t1) / 2
  const phi = (t2 + t1) / 2
  // A = R(phi) · diag(s1, s2) · R(theta)
  const cp = Math.cos(phi), sp = Math.sin(phi)
  const ct = Math.cos(theta), st = Math.sin(theta)
  let u: Svd2['u'] = [[cp, -sp], [sp, cp]]
  let vt: Svd2['vt'] = [[ct, -st], [st, ct]]
  if (s2 < 0) {
    s2 = -s2
    u = [[u[0][0], -u[0][1]], [u[1][0], -u[1][1]]]
  }
  if (s2 > s1) {
    ;[s1, s2] = [s2, s1]
    u = [[u[0][1], u[0][0]], [u[1][1], u[1][0]]]
    vt = [vt[1], vt[0]]
  }
  return { u, s: [s1, s2], vt }
}

function mul2(a: number[][], b: number[][]): number[][] {
  return [
    [a[0][0] * b[0][0] + a[0][1] * b[1][0], a[0][0] * b[0][1] + a[0][1] * b[1][1]],
    [a[1][0] * b[0][0] + a[1][1] * b[1][0], a[1][0] * b[0][1] + a[1][1] * b[1][1]],
  ]
}

export function similarityTransform(src: readonly Point[]): Affine {
  if (src.length !== 5) throw new Error('São necessários exatamente 5 pontos faciais')
  const dst = SFACE_TEMPLATE
  const srcMean: Point = [
    (src[0][0] + src[1][0] + src[2][0] + src[3][0] + src[4][0]) / 5,
    (src[0][1] + src[1][1] + src[2][1] + src[3][1] + src[4][1]) / 5,
  ]
  const sd = src.map((p) => [p[0] - srcMean[0], p[1] - srcMean[1]])
  const dd = dst.map((p) => [p[0] - DST_MEAN[0], p[1] - DST_MEAN[1]])

  let a00 = 0, a01 = 0, a10 = 0, a11 = 0
  for (let i = 0; i < 5; i++) {
    a00 += dd[i][0] * sd[i][0]
    a01 += dd[i][0] * sd[i][1]
    a10 += dd[i][1] * sd[i][0]
    a11 += dd[i][1] * sd[i][1]
  }
  a00 /= 5; a01 /= 5; a10 /= 5; a11 /= 5

  const d = [1, 1]
  if (a00 * a11 - a01 * a10 < 0) d[1] = -1

  const { u, s, vt } = svd2x2(a00, a01, a10, a11)
  const smax = Math.max(s[0], s[1])
  const tol = smax * 2 * 1.17549435e-38 // FLT_MIN
  const rank = (s[0] > tol ? 1 : 0) + (s[1] > tol ? 1 : 0)
  const detU = u[0][0] * u[1][1] - u[0][1] * u[1][0]
  const detVt = vt[0][0] * vt[1][1] - vt[0][1] * vt[1][0]

  let t: number[][]
  if (rank === 1 && detU * detVt > 0) {
    t = mul2(u, vt)
  } else if (rank === 1) {
    t = mul2(u, mul2([[d[0], 0], [0, -1]], vt))
  } else {
    t = mul2(u, mul2([[d[0], 0], [0, d[1]]], vt))
  }

  let var1 = 0, var2 = 0
  for (let i = 0; i < 5; i++) {
    var1 += sd[i][0] * sd[i][0]
    var2 += sd[i][1] * sd[i][1]
  }
  var1 /= 5; var2 /= 5
  const scale = (1 / (var1 + var2)) * (s[0] * d[0] + s[1] * d[1])
  const ts0 = t[0][0] * srcMean[0] + t[0][1] * srcMean[1]
  const ts1 = t[1][0] * srcMean[0] + t[1][1] * srcMean[1]
  return [
    t[0][0] * scale, t[0][1] * scale, DST_MEAN[0] - scale * ts0,
    t[1][0] * scale, t[1][1] * scale, DST_MEAN[1] - scale * ts1,
  ]
}
