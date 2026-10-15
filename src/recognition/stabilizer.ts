// Estado da liberação na aba Interação.
//
// Regras:
//  - "Acesso liberado" e "Acesso negado" só aparecem após `requiredConfirmations`
//    análises NOVAS (quadros distintos, em ordem) com a mesma decisão.
//  - Qualquer análise válida de ausência, desconhecido, ambiguidade ou múltiplos rostos
//    zera a sequência e remove a liberação imediatamente.
//  - Resultados de outra sessão (troca de câmera/aba, exclusão, reinício) ou de um quadro
//    mais antigo que o último aplicado são descartados.
//  - A liberação vence se a última confirmação ficar mais velha que `maxResultAgeMs`
//    (processamento travado ou quadros inutilizáveis). Não há temporizador de exibição.
import { STABILITY } from '../config/recognition'
import type { MatchOutcome } from './match'

export type AnalysisOutcome =
  | { kind: 'absent' }
  | { kind: 'multiple' }
  /** Um rosto, mas sem condições de identificar (de lado, longe, escuro…). Não confirma nem nega. */
  | { kind: 'unusable' }
  | { kind: 'identified'; match: MatchOutcome }

export interface FrameMeta {
  session: number
  frameId: number
  /** Horário do quadro analisado (performance.now() no momento da captura). */
  frameTime: number
}

export interface RecognitionView {
  grantedPersonId: string | null
  deniedReason: 'unknown' | 'ambiguous' | null
  multipleFaces: boolean
}

export class RecognitionStabilizer {
  private session = 0
  private lastFrameId = -1
  private candidate: string | null = null
  private streak = 0
  private granted: string | null = null
  private denied: RecognitionView['deniedReason'] = null
  private lastConfirmTime = 0
  private multiple = false
  private readonly required: number
  private readonly maxAge: number

  constructor(required: number = STABILITY.requiredConfirmations, maxAgeMs: number = STABILITY.maxResultAgeMs) {
    this.required = Math.max(1, required)
    this.maxAge = maxAgeMs
  }

  /** Inicia uma nova sessão e descarta tudo o que veio antes. */
  reset(session: number): RecognitionView {
    this.session = session
    this.lastFrameId = -1
    this.clearIdentity()
    this.multiple = false
    return this.view()
  }

  /** Aplica uma análise. Retorna null quando o resultado foi descartado. */
  apply(outcome: AnalysisOutcome, meta: FrameMeta, now: number): RecognitionView | null {
    if (meta.session !== this.session) return null
    if (meta.frameId <= this.lastFrameId) return null
    if (now - meta.frameTime > this.maxAge) return null
    this.lastFrameId = meta.frameId

    this.multiple = outcome.kind === 'multiple'
    if (outcome.kind === 'unusable') {
      // Interrompe a sequência; uma liberação já confirmada continua sujeita ao vencimento.
      this.candidate = null
      this.streak = 0
      this.denied = null
      return this.expire(now)
    }
    if (outcome.kind !== 'identified') {
      this.clearIdentity()
      return this.view()
    }
    const result = outcome.match
    const candidate = result.kind === 'match' ? `match:${result.personId}` : `deny:${result.kind}`
    if (this.candidate === candidate) {
      this.streak += 1
    } else {
      this.clearIdentity()
      this.candidate = candidate
      this.streak = 1
    }
    this.lastConfirmTime = meta.frameTime
    if (this.streak >= this.required) {
      this.granted = result.kind === 'match' ? result.personId : null
      this.denied = result.kind === 'match' ? null : result.kind
    }
    return this.view()
  }

  /** Verificação periódica de vencimento. */
  expire(now: number): RecognitionView {
    if ((this.candidate || this.granted || this.denied) && now - this.lastConfirmTime > this.maxAge) this.clearIdentity()
    return this.view()
  }

  /** Remove a liberação se ela pertencer a uma pessoa que deixou de existir. */
  forget(personId: string): RecognitionView {
    if (this.candidate === `match:${personId}` || this.granted === personId) this.clearIdentity()
    return this.view()
  }

  view(): RecognitionView {
    return { grantedPersonId: this.granted, deniedReason: this.denied, multipleFaces: this.multiple }
  }

  private clearIdentity() {
    this.candidate = null
    this.streak = 0
    this.granted = null
    this.denied = null
    this.lastConfirmTime = 0
  }
}
