import { describe, expect, it } from 'vitest'
import { SFACE_TEMPLATE } from './similarityTransform'
import { alignCrop, toSfaceTensor, warpAffineRgb } from './align'

function gradientFrame(w: number, h: number) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      data[i] = x % 256
      data[i + 1] = y % 256
      data[i + 2] = (x + y) % 256
      data[i + 3] = 255
    }
  return { width: w, height: h, data }
}

describe('alinhamento e tensor do SFace', () => {
  it('com a transformação identidade, copia os pixels em RGB, sem normalização', () => {
    const out = warpAffineRgb(gradientFrame(150, 150), [1, 0, 0, 0, 1, 0], 112, 112)
    expect(Array.from(out.slice(0, 6))).toEqual([0, 0, 0, 1, 0, 1])
    const i = (50 * 112 + 70) * 3
    expect([out[i], out[i + 1], out[i + 2]]).toEqual([70, 50, 120])
  })

  it('preenche com 0 fora da imagem (BORDER_CONSTANT)', () => {
    const out = warpAffineRgb(gradientFrame(20, 20), [1, 0, -50, 0, 1, -50], 112, 112)
    expect(out[0]).toBe(0)
  })

  it('com os pontos já no modelo, o recorte é praticamente a própria imagem', () => {
    const crop = alignCrop(gradientFrame(112, 112), SFACE_TEMPLATE)
    const i = (60 * 112 + 60) * 3
    expect(Math.abs(crop[i] - 60)).toBeLessThanOrEqual(1)
    expect(Math.abs(crop[i + 1] - 60)).toBeLessThanOrEqual(1)
  })

  it('monta o tensor NCHW [1,3,112,112] com canais R, G, B', () => {
    const rgb = new Uint8Array(112 * 112 * 3)
    rgb[0] = 10
    rgb[1] = 20
    rgb[2] = 30
    const t = toSfaceTensor(rgb)
    expect(t.length).toBe(3 * 112 * 112)
    expect([t[0], t[112 * 112], t[2 * 112 * 112]]).toEqual([10, 20, 30])
  })
})
