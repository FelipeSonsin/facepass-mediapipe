// Estatísticas da calibração: separa pontuações "genuínas" (a pessoa diante da câmera
// comparada com o próprio cadastro) de "impostoras" (comparada com outros cadastros, ou
// uma pessoa não cadastrada comparada com todos).

export interface CalibrationRecord {
  /** id da pessoa realmente diante da câmera, ou null para pessoa não cadastrada. */
  truth: string | null
  /** Pontuação (média das K maiores similaridades) para cada cadastro. */
  scores: Record<string, number>
  at: number
}

export interface CalibrationSummary {
  genuine: number[]
  impostor: number[]
  /** Diferença entre a pontuação correta e a melhor pontuação errada, por análise genuína. */
  margins: number[]
}

export function summarize(records: CalibrationRecord[]): CalibrationSummary {
  const genuine: number[] = []
  const impostor: number[] = []
  const margins: number[] = []
  for (const r of records) {
    let bestWrong = -Infinity
    for (const [id, score] of Object.entries(r.scores)) {
      if (id === r.truth) genuine.push(score)
      else {
        impostor.push(score)
        bestWrong = Math.max(bestWrong, score)
      }
    }
    if (r.truth && r.truth in r.scores && Number.isFinite(bestWrong)) margins.push(r.scores[r.truth] - bestWrong)
  }
  return { genuine, impostor, margins }
}

export function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const pos = (s.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}

/** Sugestão conservadora: acima de todas as pontuações impostoras observadas, com folga,
 *  e informando quantas análises genuínas ficariam abaixo (rejeições). */
export function suggestThreshold(summary: CalibrationSummary, guard = 0.05) {
  if (summary.impostor.length === 0 || summary.genuine.length === 0) return null
  const maxImpostor = Math.max(...summary.impostor)
  const threshold = Math.round((maxImpostor + guard) * 100) / 100
  const rejected = summary.genuine.filter((g) => g < threshold).length
  return { threshold, maxImpostor, falseRejectRate: rejected / summary.genuine.length }
}
