import { describe, expect, it } from 'vitest'
import { quantile, suggestThreshold, summarize } from './stats'

describe('estatísticas de calibração', () => {
  const records = [
    { truth: 'ana', scores: { ana: 0.7, bia: 0.2 }, at: 1 },
    { truth: 'ana', scores: { ana: 0.6, bia: 0.25 }, at: 2 },
    { truth: null, scores: { ana: 0.3, bia: 0.1 }, at: 3 },
  ]

  it('separa pontuações genuínas e impostoras e calcula margens', () => {
    const s = summarize(records)
    expect(s.genuine).toEqual([0.7, 0.6])
    expect(s.impostor).toEqual([0.2, 0.25, 0.3, 0.1])
    expect(s.margins.map((m) => Math.round(m * 100) / 100)).toEqual([0.5, 0.35])
  })

  it('sugere limiar acima do maior impostor e informa rejeições', () => {
    const r = suggestThreshold(summarize(records))
    expect(r?.threshold).toBe(0.35)
    expect(r?.falseRejectRate).toBe(0)
  })

  it('calcula quantis', () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3)
    expect(quantile([], 0.5)).toBeNull()
  })
})
