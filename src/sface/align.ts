// Recorte alinhado e tensor de entrada do SFace, reproduzindo o OpenCV:
//  - alignCrop: warpAffine(src, M, 112×112, INTER_LINEAR, BORDER_CONSTANT = 0)
//  - feature:   blobFromImage(img, scale 1, size 112, mean 0, swapRB = true)
// No OpenCV a imagem está em BGR e swapRB a converte para RGB; aqui o quadro já é
// RGBA (canvas), então lemos R, G, B diretamente. Valores ficam em 0–255, sem normalização.
import { similarityTransform, type Affine, type Point } from './similarityTransform'

export const SFACE_SIZE = 112
const INTER_TAB_SIZE = 32 // o OpenCV quantiza coordenadas em 1/32 de pixel

export interface RgbaFrame {
  width: number
  height: number
  data: Uint8ClampedArray | Uint8Array
}

function invertAffine(m: Affine): Affine {
  const [a, b, tx, c, d, ty] = m
  const det = a * d - b * c
  if (det === 0) throw new Error('Transformação de alinhamento degenerada')
  const ia = d / det, ib = -b / det, ic = -c / det, id = a / det
  return [ia, ib, -(ia * tx + ib * ty), ic, id, -(ic * tx + id * ty)]
}

/** Recorte 112×112 alinhado, como Uint8 RGB intercalado (equivale à saída de alignCrop). */
export function alignCrop(frame: RgbaFrame, points: readonly Point[]): Uint8Array {
  const m = similarityTransform(points)
  return warpAffineRgb(frame, m, SFACE_SIZE, SFACE_SIZE)
}

export function warpAffineRgb(frame: RgbaFrame, m: Affine, outW: number, outH: number): Uint8Array {
  const inv = invertAffine(m)
  const { width: w, height: h, data } = frame
  const out = new Uint8Array(outW * outH * 3)
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const sx = Math.round((inv[0] * x + inv[1] * y + inv[2]) * INTER_TAB_SIZE) / INTER_TAB_SIZE
      const sy = Math.round((inv[3] * x + inv[4] * y + inv[5]) * INTER_TAB_SIZE) / INTER_TAB_SIZE
      const x0 = Math.floor(sx), y0 = Math.floor(sy)
      const fx = sx - x0, fy = sy - y0
      const o = (y * outW + x) * 3
      for (let ch = 0; ch < 3; ch++) {
        let acc = 0
        for (let dy = 0; dy < 2; dy++) {
          const yy = y0 + dy
          const wy = dy === 0 ? 1 - fy : fy
          if (yy < 0 || yy >= h || wy === 0) continue
          for (let dx = 0; dx < 2; dx++) {
            const xx = x0 + dx
            const wx = dx === 0 ? 1 - fx : fx
            if (xx < 0 || xx >= w || wx === 0) continue
            acc += data[(yy * w + xx) * 4 + ch] * wx * wy
          }
        }
        out[o + ch] = Math.min(255, Math.max(0, Math.round(acc)))
      }
    }
  }
  return out
}

/** Converte o recorte RGB intercalado para o tensor NCHW [1, 3, 112, 112] em float32. */
export function toSfaceTensor(rgb: Uint8Array): Float32Array {
  const plane = SFACE_SIZE * SFACE_SIZE
  const tensor = new Float32Array(3 * plane)
  for (let i = 0; i < plane; i++) {
    tensor[i] = rgb[i * 3]
    tensor[plane + i] = rgb[i * 3 + 1]
    tensor[2 * plane + i] = rgb[i * 3 + 2]
  }
  return tensor
}
