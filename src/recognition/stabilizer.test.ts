import { describe, expect, it } from 'vitest'
import { RecognitionStabilizer, type AnalysisOutcome } from './stabilizer'

const match = (personId: string): AnalysisOutcome => ({ kind: 'identified', match: { kind: 'match', personId, score: 0.7, secondScore: null } })
const unknown: AnalysisOutcome = { kind: 'identified', match: { kind: 'unknown', bestScore: 0.2 } }

function setup() {
  const s = new RecognitionStabilizer(3, 1200)
  s.reset(1)
  let frame = 0
  let t = 1000
  const feed = (o: AnalysisOutcome, session = 1) => {
    frame += 1
    t += 100
    return s.apply(o, { session, frameId: frame, frameTime: t }, t + 20)
  }
  return { s, feed, now: () => t }
}

describe('RecognitionStabilizer', () => {
  it('só nega após três análises consecutivas de um rosto desconhecido', () => {
    const { feed } = setup()
    expect(feed(unknown)?.deniedReason).toBeNull()
    expect(feed(unknown)?.deniedReason).toBeNull()
    expect(feed(unknown)).toEqual({ grantedPersonId: null, deniedReason: 'unknown', multipleFaces: false })
  })

  it('nega a identidade ambígua sem exibir um nome', () => {
    const { feed } = setup()
    const ambiguous: AnalysisOutcome = { kind: 'identified', match: { kind: 'ambiguous', personId: 'ana', score: 0.7, secondScore: 0.68 } }
    feed(ambiguous)
    feed(ambiguous)
    expect(feed(ambiguous)).toEqual({ grantedPersonId: null, deniedReason: 'ambiguous', multipleFaces: false })
  })

  it.each(['absent', 'multiple', 'unusable'] as const)('remove a negação com %s e exige novas confirmações', (kind) => {
    const { feed } = setup()
    feed(unknown)
    feed(unknown)
    feed(unknown)
    expect(feed({ kind })?.deniedReason).toBeNull()
    expect(feed(unknown)?.deniedReason).toBeNull()
  })

  it('troca de negado para liberado e de liberado para negado sem herdar resultado', () => {
    const { feed } = setup()
    feed(unknown)
    feed(unknown)
    feed(unknown)
    expect(feed(match('ana'))?.deniedReason).toBeNull()
    feed(match('ana'))
    expect(feed(match('ana'))?.grantedPersonId).toBe('ana')
    expect(feed(unknown)).toEqual({ grantedPersonId: null, deniedReason: null, multipleFaces: false })
    feed(unknown)
    expect(feed(unknown)?.deniedReason).toBe('unknown')
  })

  it('negação expira e é removida ao trocar de sessão; resultados antigos são ignorados', () => {
    const { s, feed, now } = setup()
    feed(unknown)
    feed(unknown)
    feed(unknown)
    expect(s.expire(now() + 1300).deniedReason).toBeNull()
    feed(unknown)
    feed(unknown)
    feed(unknown)
    expect(s.reset(2).deniedReason).toBeNull()
    expect(feed(unknown, 1)).toBeNull()
    expect(s.view().deniedReason).toBeNull()
  })

  it('quadros sem qualidade ou separados por uma pausa interrompem a contagem', () => {
    const { s, feed, now } = setup()
    feed(match('ana'))
    feed({ kind: 'unusable' })
    feed(match('ana'))
    expect(feed(match('ana'))?.grantedPersonId).toBeNull()
    expect(feed(match('ana'))?.grantedPersonId).toBe('ana')
    s.reset(1)
    feed(unknown)
    s.expire(now() + 1300)
    expect(feed(unknown)?.deniedReason).toBeNull()
  })

  it('só libera após 3 análises novas e consecutivas da mesma pessoa', () => {
    const { feed } = setup()
    expect(feed(match('ana'))?.grantedPersonId).toBeNull()
    expect(feed(match('ana'))?.grantedPersonId).toBeNull()
    expect(feed(match('ana'))?.grantedPersonId).toBe('ana')
  })

  it('a troca de identidade no meio reinicia a contagem', () => {
    const { feed } = setup()
    feed(match('ana'))
    feed(match('ana'))
    expect(feed(match('bia'))?.grantedPersonId).toBeNull()
    feed(match('bia'))
    expect(feed(match('bia'))?.grantedPersonId).toBe('bia')
  })

  it.each([
    ['ausência de rosto', { kind: 'absent' } as AnalysisOutcome],
    ['desconhecido', unknown],
    ['ambíguo', { kind: 'identified', match: { kind: 'ambiguous', personId: 'ana', score: 0.6, secondScore: 0.58 } } as AnalysisOutcome],
    ['múltiplos rostos', { kind: 'multiple' } as AnalysisOutcome],
  ])('remove a liberação imediatamente com %s', (_, outcome) => {
    const { feed } = setup()
    feed(match('ana'))
    feed(match('ana'))
    feed(match('ana'))
    const v = feed(outcome)
    expect(v?.grantedPersonId).toBeNull()
    expect(v?.multipleFaces).toBe(outcome.kind === 'multiple')
  })

  it('desconhecido depois de uma pessoa reconhecida não herda a liberação', () => {
    const { feed } = setup()
    feed(match('ana'))
    feed(match('ana'))
    feed(match('ana'))
    expect(feed(unknown)?.grantedPersonId).toBeNull()
    expect(feed(match('ana'))?.grantedPersonId).toBeNull()
  })

  it('descarta resultado de sessão anterior (troca de aba/câmera, exclusão)', () => {
    const { s, feed } = setup()
    feed(match('ana'))
    feed(match('ana'))
    s.reset(2)
    expect(feed(match('ana'), 1)).toBeNull()
    expect(s.view().grantedPersonId).toBeNull()
  })

  it('descarta inferência atrasada de um quadro anterior ao último aplicado', () => {
    const s = new RecognitionStabilizer(1, 1200)
    s.reset(1)
    s.apply({ kind: 'absent' }, { session: 1, frameId: 10, frameTime: 2000 }, 2010)
    expect(s.apply(match('ana'), { session: 1, frameId: 9, frameTime: 1900 }, 2050)).toBeNull()
    expect(s.view().grantedPersonId).toBeNull()
  })

  it('descarta resultado vencido', () => {
    const s = new RecognitionStabilizer(1, 1200)
    s.reset(1)
    expect(s.apply(match('ana'), { session: 1, frameId: 1, frameTime: 1000 }, 3000)).toBeNull()
  })

  it('a liberação vence sem novas confirmações (processamento parado)', () => {
    const { s, feed, now } = setup()
    feed(match('ana'))
    feed(match('ana'))
    feed(match('ana'))
    expect(s.expire(now() + 500).grantedPersonId).toBe('ana')
    expect(s.expire(now() + 1300).grantedPersonId).toBeNull()
  })

  it('quadro inutilizável não confirma nem renova a liberação', () => {
    const s = new RecognitionStabilizer(3, 1200)
    s.reset(1)
    for (let i = 1; i <= 3; i++) s.apply(match('ana'), { session: 1, frameId: i, frameTime: 1000 + i * 100 }, 1010 + i * 100)
    expect(s.view().grantedPersonId).toBe('ana')
    let v = s.view()
    for (let i = 4; i <= 20; i++) v = s.apply({ kind: 'unusable' }, { session: 1, frameId: i, frameTime: 1000 + i * 100 }, 1010 + i * 100) ?? v
    expect(v.grantedPersonId).toBeNull()
  })

  it('esquece a pessoa excluída', () => {
    const { s, feed } = setup()
    feed(match('ana'))
    feed(match('ana'))
    feed(match('ana'))
    expect(s.forget('ana').grantedPersonId).toBeNull()
  })
})
