// Liga o analisador de quadros à regra de identificação da aba Interação.
import { useEffect, useRef, useState } from 'react'
import { camera } from '../camera/cameraController'
import { peopleStore } from '../storage/peopleStore'
import { analyzer, type AnalysisConsumer } from '../vision/analyzer'
import { matchEmbedding } from './match'
import { RecognitionStabilizer, type RecognitionView } from './stabilizer'

const EMPTY: RecognitionView = { grantedPersonId: null, deniedReason: null, multipleFaces: false }
const EXPIRY_CHECK_MS = 200

export function useRecognition(enabled: boolean) {
  const [view, setView] = useState<RecognitionView>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const viewRef = useRef(view)

  useEffect(() => {
    if (!enabled) return
    const stab = new RecognitionStabilizer()
    let session = 0
    const publish = (next: RecognitionView | null) => {
      if (!next) return
      const cur = viewRef.current
      if (cur.grantedPersonId === next.grantedPersonId && cur.deniedReason === next.deniedReason && cur.multipleFaces === next.multipleFaces) return
      viewRef.current = next
      setView(next)
    }

    const consumer: AnalysisConsumer = {
      onSession(s) {
        session = s
        publish(stab.reset(s))
      },
      onAnalysis(a) {
        const meta = { session: a.session, frameId: a.frameId, frameTime: a.frameTime }
        const now = performance.now()
        if (a.faceCount === 0) publish(stab.apply({ kind: 'absent' }, meta, now))
        else if (a.faceCount >= 2) publish(stab.apply({ kind: 'multiple' }, meta, now))
        else if (!a.quality?.ok) publish(stab.apply({ kind: 'unusable' }, meta, now))
        else {
          setError(null)
          // Um rosto em boas condições: a decisão vem do embedding deste mesmo quadro.
          return a.canEmbed && peopleStore.compatible().length > 0
        }
        return false
      },
      onEmbedding(r) {
        const match = matchEmbedding(r.embedding, peopleStore.compatible())
        publish(stab.apply({ kind: 'identified', match }, { session: r.session, frameId: r.frameId, frameTime: r.frameTime }, performance.now()))
      },
      onError(message) {
        setError(message)
        publish(stab.reset(session))
      },
    }

    analyzer.setConsumer(consumer)
    // Cadastros alterados (inclusive exclusão) ou câmera trocada: nova sessão, nada herdado.
    const offPeople = peopleStore.onChange(() => analyzer.newSession())
    let lastGeneration = camera.get().generation
    const offCamera = camera.subscribe(() => {
      const g = camera.get().generation
      if (g !== lastGeneration) {
        lastGeneration = g
        analyzer.newSession()
      }
    })
    const timer = window.setInterval(() => publish(stab.expire(performance.now())), EXPIRY_CHECK_MS)
    return () => {
      window.clearInterval(timer)
      offPeople()
      offCamera()
      analyzer.setConsumer(null)
      viewRef.current = EMPTY
      setView(EMPTY)
    }
  }, [enabled])

  return { view, error }
}
