// Usa DADOS SIMULADOS (src/test-support/simulated.ts), não embeddings reais.
import { describe, expect, it } from 'vitest'
import { EnrollmentSession } from './enrollmentSession'
import { simulatedIdentity, simulatedPose, withCosine } from '../test-support/simulated'
import type { QualityReport } from '../vision/quality'

const cfg = { samples: 5, minIntervalMs: 450, minPoseChange: 0.04, minConsistency: 0.55, maxPauseMs: 4000 }
const person = simulatedIdentity(42)
const other = simulatedIdentity(7)

function goodQuality(dx: number): QualityReport {
  return { ok: true, issue: null, box: { x: 0.35, y: 0.25, w: 0.3, h: 0.45 }, pose: simulatedPose(dx) }
}

/** Alimenta quadros a cada 500 ms, movendo levemente o rosto, até coletar `n` amostras. */
function collect(s: EnrollmentSession, n: number, start = 0, embed = (i: number) => withCosine(person, 0.8, 1000 + i)) {
  let t = start
  let last = s.count
  for (let i = 0; s.count < last + n && i < 100; i++) {
    t += 500
    const q = goodQuality((i % 2) * 0.01)
    const r = s.onAnalysis({ faceCount: 1, quality: q, frameTime: t }, t)
    if (r.requestEmbedding) {
      const status = s.onEmbedding(embed(i), q.pose, t, t + 30)
      if (status.kind === 'restarted' || status.kind === 'complete') return { status, t }
    }
  }
  last = s.count
  return { status: null, t }
}

describe('EnrollmentSession', () => {
  it('conclui com 5 amostras coerentes, em momentos distintos', () => {
    const s = new EnrollmentSession(0, cfg)
    const { status } = collect(s, 5)
    expect(status?.kind).toBe('complete')
    expect(s.embeddings()).toHaveLength(5)
  })

  it('reinicia quando outra pessoa entra no quadro', () => {
    const s = new EnrollmentSession(0, cfg)
    collect(s, 2)
    expect(s.count).toBe(2)
    const r = s.onAnalysis({ faceCount: 2, quality: null, frameTime: 99999 }, 99999)
    expect(r.status).toEqual({ kind: 'restarted', reason: 'multiple' })
    expect(s.count).toBe(0)
  })

  it('reinicia quando uma amostra não é coerente com as anteriores', () => {
    const s = new EnrollmentSession(0, cfg)
    const { status } = collect(s, 5, 0, (i) => (i < 4 ? withCosine(person, 0.85, 2000 + i) : withCosine(other, 0.9, 3000 + i)))
    expect(status).toEqual({ kind: 'restarted', reason: 'inconsistent' })
    expect(s.count).toBe(0)
  })

  it('pausa sem rosto e interrompe após a pausa máxima', () => {
    const s = new EnrollmentSession(0, cfg)
    expect(s.onAnalysis({ faceCount: 0, quality: null, frameTime: 1000 }, 1000).status).toEqual({ kind: 'paused', reason: 'no-face' })
    expect(s.onAnalysis({ faceCount: 0, quality: null, frameTime: 4100 }, 4100).status).toEqual({ kind: 'stopped', reason: 'lost' })
  })

  it('pausa com qualidade insuficiente e informa o motivo', () => {
    const s = new EnrollmentSession(0, cfg)
    const q: QualityReport = { ...goodQuality(0), ok: false, issue: 'dark' }
    expect(s.onAnalysis({ faceCount: 1, quality: q, frameTime: 500 }, 500).status).toEqual({ kind: 'paused', reason: 'dark' })
  })

  it('exige pequena variação de posição entre amostras', () => {
    const s = new EnrollmentSession(0, cfg)
    const q = goodQuality(0)
    const r1 = s.onAnalysis({ faceCount: 1, quality: q, frameTime: 500 }, 500)
    expect(r1.requestEmbedding).toBe(true)
    s.onEmbedding(withCosine(person, 0.9, 1), q.pose, 500, 520)
    const r2 = s.onAnalysis({ faceCount: 1, quality: q, frameTime: 1100 }, 1100)
    expect(r2.status).toEqual({ kind: 'move' })
    const r3 = s.onAnalysis({ faceCount: 1, quality: goodQuality(0.01), frameTime: 1200 }, 1200)
    expect(r3.requestEmbedding).toBe(true)
  })

  it('respeita o intervalo mínimo entre amostras', () => {
    const s = new EnrollmentSession(0, cfg)
    const q = goodQuality(0)
    s.onAnalysis({ faceCount: 1, quality: q, frameTime: 500 }, 500)
    s.onEmbedding(withCosine(person, 0.9, 1), q.pose, 500, 520)
    expect(s.onAnalysis({ faceCount: 1, quality: goodQuality(0.02), frameTime: 700 }, 700).status).toEqual({ kind: 'hold' })
  })

  it('ignora embedding de um pedido anterior a um reinício', () => {
    const s = new EnrollmentSession(0, cfg)
    const q = goodQuality(0)
    s.onAnalysis({ faceCount: 1, quality: q, frameTime: 500 }, 500)
    s.onAnalysis({ faceCount: 2, quality: null, frameTime: 600 }, 600)
    expect(s.onEmbedding(withCosine(person, 0.9, 1), q.pose, 500, 650)).toEqual({ kind: 'collecting' })
    expect(s.count).toBe(0)
  })
})
