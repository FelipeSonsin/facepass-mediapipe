// Liga o analisador de quadros à coleta de amostras da aba Cadastrar rosto.
import { useCallback, useEffect, useRef, useState } from 'react'
import { camera } from '../camera/cameraController'
import { MATCHING } from '../config/recognition'
import { personScore } from '../recognition/match'
import { StorageError } from '../storage/db'
import { peopleStore } from '../storage/peopleStore'
import { analyzer, type AnalysisConsumer } from '../vision/analyzer'
import { ISSUE_MESSAGES } from '../vision/quality'
import { EnrollmentSession, type CaptureStatus } from './enrollmentSession'

export type EnrollPhase =
  | { kind: 'idle' }
  | { kind: 'capturing'; count: number; total: number; hint: string }
  | { kind: 'duplicate'; personId: string; personName: string; samples: Float32Array[] }
  | { kind: 'saving' }
  | { kind: 'done'; name: string; updated: boolean }
  | { kind: 'stopped'; message: string }
  | { kind: 'error'; message: string }

function hintFor(status: CaptureStatus): string | null {
  switch (status.kind) {
    case 'collecting':
      return 'Capturando… mantenha o rosto na moldura.'
    case 'hold':
      return 'Capturando… mantenha o rosto na moldura.'
    case 'move':
      return 'Mova a cabeça levemente, como num aceno curto.'
    case 'paused':
      return status.reason === 'no-face' ? 'Rosto não encontrado. Volte para a moldura.' : `Captura em pausa. ${ISSUE_MESSAGES[status.reason]}`
    case 'restarted':
      return status.reason === 'multiple'
        ? 'Outra pessoa apareceu. A captura recomeçou: fique só você na frente da câmera.'
        : 'As amostras não ficaram parecidas entre si. A captura recomeçou: mantenha o rosto estável e bem iluminado.'
    default:
      return null
  }
}

/** Pessoa já cadastrada cujo rosto corresponde às novas amostras, se houver. */
function findDuplicate(samples: Float32Array[]): string | null {
  let best: { id: string; score: number } | null = null
  for (const p of peopleStore.compatible()) {
    const score = samples.reduce((acc, s) => acc + personScore(s, p.samples, MATCHING.topK), 0) / samples.length
    if (score >= MATCHING.acceptThreshold && (!best || score > best.score)) best = { id: p.id, score }
  }
  return best?.id ?? null
}

export function useEnrollment() {
  const [phase, setPhase] = useState<EnrollPhase>({ kind: 'idle' })
  const sessionRef = useRef<EnrollmentSession | null>(null)
  const nameRef = useRef('')
  const phaseRef = useRef(phase)
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  const finish = useCallback(async (samples: Float32Array[]) => {
    const dup = findDuplicate(samples)
    if (dup) {
      setPhase({ kind: 'duplicate', personId: dup, personName: peopleStore.nameOf(dup) ?? '', samples })
      return
    }
    setPhase({ kind: 'saving' })
    try {
      await peopleStore.add(nameRef.current, samples)
      // A confirmação só aparece depois que a transação do IndexedDB foi concluída.
      setPhase({ kind: 'done', name: nameRef.current, updated: false })
    } catch (e) {
      setPhase({ kind: 'error', message: storageMessage(e) })
    }
  }, [])

  useEffect(() => {
    const consumer: AnalysisConsumer = {
      onSession() {
        if (sessionRef.current && phaseRef.current.kind === 'capturing') {
          sessionRef.current = null
          setPhase({ kind: 'stopped', message: 'A captura foi interrompida. Clique em Registrar rosto para recomeçar.' })
        }
      },
      onAnalysis(a) {
        const s = sessionRef.current
        if (!s || s.finished) return false
        const r = s.onAnalysis({ faceCount: a.faceCount, quality: a.quality, frameTime: a.frameTime }, performance.now())
        if (r.status.kind === 'stopped') {
          sessionRef.current = null
          setPhase({ kind: 'stopped', message: 'Captura interrompida: o rosto ficou fora da moldura por muito tempo. Clique em Registrar rosto para tentar de novo.' })
          return false
        }
        const hint = hintFor(r.status)
        setPhase((p) => (p.kind === 'capturing' && p.count === s.count && p.hint === hint ? p : { kind: 'capturing', count: s.count, total: s.total, hint: hint ?? '' }))
        if (r.requestEmbedding && !a.canEmbed) {
          s.cancelPending()
          return false
        }
        return r.requestEmbedding
      },
      onEmbedding(r) {
        const s = sessionRef.current
        if (!s) return
        const status = s.onEmbedding(r.embedding, r.pose, r.frameTime, performance.now())
        if (status.kind === 'complete') {
          sessionRef.current = null
          void finish(s.embeddings())
          return
        }
        const hint = hintFor(status) ?? ''
        setPhase({ kind: 'capturing', count: s.count, total: s.total, hint })
      },
      onError(message) {
        if (!sessionRef.current) return
        sessionRef.current = null
        setPhase({ kind: 'error', message: `O processamento falhou (${message}). Clique em Registrar rosto para tentar de novo.` })
      },
    }
    analyzer.setConsumer(consumer)
    let lastGeneration = camera.get().generation
    const offCamera = camera.subscribe(() => {
      const g = camera.get().generation
      if (g !== lastGeneration) {
        lastGeneration = g
        analyzer.newSession()
      }
    })
    return () => {
      offCamera()
      sessionRef.current = null
      analyzer.setConsumer(null)
    }
  }, [finish])

  const start = useCallback((name: string) => {
    nameRef.current = name
    sessionRef.current = new EnrollmentSession(performance.now())
    setPhase({ kind: 'capturing', count: 0, total: sessionRef.current.total, hint: 'Capturando… mantenha o rosto na moldura.' })
  }, [])

  const cancel = useCallback(() => {
    sessionRef.current = null
    setPhase({ kind: 'idle' })
  }, [])

  const confirmUpdate = useCallback(async () => {
    const p = phaseRef.current
    if (p.kind !== 'duplicate') return
    setPhase({ kind: 'saving' })
    try {
      const updated = await peopleStore.replaceSamples(p.personId, p.samples)
      setPhase({ kind: 'done', name: updated.name, updated: true })
    } catch (e) {
      setPhase({ kind: 'error', message: storageMessage(e) })
    }
  }, [])

  const reset = useCallback(() => setPhase({ kind: 'idle' }), [])

  return { phase, start, cancel, confirmUpdate, reset }
}

function storageMessage(e: unknown) {
  if (e instanceof StorageError && e.kind === 'quota') return 'Não há espaço para salvar neste navegador. Libere espaço e tente de novo.'
  return 'Não foi possível salvar o cadastro neste navegador. Verifique se o navegador permite armazenamento local e tente de novo.'
}
