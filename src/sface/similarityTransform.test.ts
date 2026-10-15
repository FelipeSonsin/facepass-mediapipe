import { describe, expect, it } from 'vitest'
import { SFACE_TEMPLATE, similarityTransform, svd2x2, type Point } from './similarityTransform'

const apply = (m: number[], p: Point): Point => [m[0] * p[0] + m[1] * p[1] + m[2], m[3] * p[0] + m[4] * p[1] + m[5]]

describe('svd2x2', () => {
  it('reconstrói a matriz com valores singulares ordenados e não negativos', () => {
    const cases = [
      [3, 1, -2, 4],
      [0.5, -0.2, 0.1, -0.7],
      [1, 2, 2, 4],
      [-1, 0, 0, -3],
    ]
    for (const [a, b, c, d] of cases) {
      const { u, s, vt } = svd2x2(a, b, c, d)
      expect(s[0]).toBeGreaterThanOrEqual(s[1])
      expect(s[1]).toBeGreaterThanOrEqual(0)
      const r = [
        u[0][0] * s[0] * vt[0][0] + u[0][1] * s[1] * vt[1][0],
        u[0][0] * s[0] * vt[0][1] + u[0][1] * s[1] * vt[1][1],
        u[1][0] * s[0] * vt[0][0] + u[1][1] * s[1] * vt[1][0],
        u[1][0] * s[0] * vt[0][1] + u[1][1] * s[1] * vt[1][1],
      ]
      ;[a, b, c, d].forEach((v, i) => expect(r[i]).toBeCloseTo(v, 9))
    }
  })
})

describe('similarityTransform (porta de getSimilarityTransformMatrix do OpenCV)', () => {
  it('recupera uma transformação de similaridade conhecida', () => {
    // Pontos de origem = modelo do SFace girado 12°, ampliado 2,7× e deslocado.
    const ang = (12 * Math.PI) / 180
    const sc = 2.7
    const src = SFACE_TEMPLATE.map(
      ([x, y]) => [sc * (Math.cos(ang) * x - Math.sin(ang) * y) + 210, sc * (Math.sin(ang) * x + Math.cos(ang) * y) + 95] as Point,
    )
    const m = similarityTransform(src)
    // O OpenCV usa uma média de destino fixa (56,0262; 71,9008), levemente diferente da
    // média exata do modelo; por isso a correspondência é quase exata (< 0,02 px).
    src.forEach((p, i) => {
      const q = apply(m, p)
      expect(Math.abs(q[0] - SFACE_TEMPLATE[i][0])).toBeLessThan(0.02)
      expect(Math.abs(q[1] - SFACE_TEMPLATE[i][1])).toBeLessThan(0.02)
    })
    expect(Math.hypot(m[0], m[3])).toBeCloseTo(1 / sc, 6)
  })

  it('exige exatamente 5 pontos', () => {
    expect(() => similarityTransform(SFACE_TEMPLATE.slice(0, 4))).toThrow()
  })
})
