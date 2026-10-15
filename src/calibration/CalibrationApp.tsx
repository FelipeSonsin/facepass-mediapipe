// Ferramenta de calibração (calibracao.html). Fica fora da interface principal: aqui as
// similaridades aparecem como números técnicos, para avaliar os limiares provisórios com
// amostras reais, autorizadas e separadas das usadas no cadastro.
import { Download, Play, Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useCamera } from '../camera/cameraController'
import { Button } from '../components/Button'
import { CameraStage } from '../components/CameraStage'
import { MATCHING, STABILITY } from '../config/recognition'
import { personScore } from '../recognition/match'
import { peopleStore, usePeople } from '../storage/peopleStore'
import { analyzer, useFrameState, type AnalysisConsumer } from '../vision/analyzer'
import { quantile, suggestThreshold, summarize, type CalibrationRecord } from './stats'

const BATCH = 20
// Guarda só as pontuações (números), nunca embeddings ou imagens.
const STORAGE_KEY = 'facepass-calibracao-v1'

function loadRecords(): CalibrationRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CalibrationRecord[]) : []
  } catch {
    return []
  }
}
const fmt = (v: number | null) => (v === null ? '—' : v.toFixed(3))

export function CalibrationApp() {
  const cam = useCamera()
  const frame = useFrameState()
  const { people, status } = usePeople()
  const [truth, setTruth] = useState<string>('')
  const [records, setRecords] = useState<CalibrationRecord[]>(loadRecords)
  const [remaining, setRemaining] = useState(0)
  const remainingRef = useRef(0)
  const truthRef = useRef<string | null>(null)
  const selectId = useId()

  useEffect(() => {
    void peopleStore.load()
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
    } catch {
      /* sem armazenamento: a coleta continua só nesta página */
    }
  }, [records])

  useEffect(() => {
    const consumer: AnalysisConsumer = {
      onSession() {},
      onAnalysis: (a) => remainingRef.current > 0 && a.canEmbed && a.faceCount === 1,
      onEmbedding(r) {
        if (remainingRef.current <= 0) return
        const scores: Record<string, number> = {}
        for (const p of peopleStore.compatible()) scores[p.id] = personScore(r.embedding, p.samples, MATCHING.topK)
        remainingRef.current -= 1
        setRemaining(remainingRef.current)
        setRecords((prev) => [...prev, { truth: truthRef.current, scores, at: Date.now() }])
      },
      onError() {
        remainingRef.current = 0
        setRemaining(0)
      },
    }
    analyzer.setConsumer(consumer)
    return () => analyzer.setConsumer(null)
  }, [])

  const collect = () => {
    truthRef.current = truth === '' ? null : truth
    remainingRef.current = BATCH
    setRemaining(BATCH)
  }

  const summary = summarize(records)
  const suggestion = suggestThreshold(summary)
  const nameOf = (id: string | null) => (id === null ? 'Pessoa não cadastrada' : (people.find((p) => p.id === id)?.name ?? id))

  const exportJson = () => {
    const blob = new Blob(
      [JSON.stringify({ exportedAt: new Date().toISOString(), config: { MATCHING, STABILITY }, people: people.map((p) => ({ id: p.id, name: p.name })), records }, null, 2)],
      { type: 'application/json' },
    )
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `facepass-calibracao-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold">Calibração dos limiares</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        Use pessoas que autorizaram o teste. Cadastre-as antes na aba Cadastrar rosto, neste mesmo endereço. Aqui, cada análise compara um quadro novo — que não faz
        parte do cadastro — com todos os cadastros. Colete com cada pessoa cadastrada e também com pessoas não cadastradas.
      </p>
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <CameraStage label="Câmera de calibração" tone={frame.faceCount === 1 && !frame.issue ? 'ready' : frame.active ? 'adjust' : 'idle'} hint={null} className="aspect-video" />
        <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 sm:p-5" aria-label="Coleta">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={selectId} className="text-sm font-medium">
              Quem está diante da câmera agora?
            </label>
            <select
              id={selectId}
              name="pessoa"
              value={truth}
              onChange={(e) => setTruth(e.target.value)}
              className="min-h-11 rounded-lg border border-line-strong bg-sunken px-3 text-ink"
            >
              <option value="">Pessoa não cadastrada</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <Button icon={<Play className="size-4" aria-hidden />} onClick={collect} disabled={cam.status !== 'on' || remaining > 0 || status !== 'ready' || people.length === 0}>
            {remaining > 0 ? `Coletando… faltam ${remaining}` : `Coletar ${BATCH} análises`}
          </Button>
          <p className="text-sm text-muted">
            {records.length} análises coletadas. Limiar atual {MATCHING.acceptThreshold}, margem {MATCHING.ambiguityMargin}, {STABILITY.requiredConfirmations} confirmações.
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
            <dt className="text-muted">Genuínas (n)</dt>
            <dd>{summary.genuine.length}</dd>
            <dt className="text-muted">Genuína mínima</dt>
            <dd>{fmt(summary.genuine.length ? Math.min(...summary.genuine) : null)}</dd>
            <dt className="text-muted">Genuína p5 / média</dt>
            <dd>
              {fmt(quantile(summary.genuine, 0.05))} / {fmt(quantile(summary.genuine, 0.5))}
            </dd>
            <dt className="text-muted">Impostoras (n)</dt>
            <dd>{summary.impostor.length}</dd>
            <dt className="text-muted">Impostora máxima</dt>
            <dd>{fmt(summary.impostor.length ? Math.max(...summary.impostor) : null)}</dd>
            <dt className="text-muted">Impostora p95</dt>
            <dd>{fmt(quantile(summary.impostor, 0.95))}</dd>
            <dt className="text-muted">Margem mínima</dt>
            <dd>{fmt(summary.margins.length ? Math.min(...summary.margins) : null)}</dd>
          </dl>
          {suggestion ? (
            <p className="rounded-lg border border-line bg-sunken p-3 text-sm">
              Sugestão: limiar {suggestion.threshold.toFixed(2)} (maior impostora {suggestion.maxImpostor.toFixed(3)} + 0,05). Com ele,{' '}
              {(suggestion.falseRejectRate * 100).toFixed(0)}% das análises genuínas ficariam abaixo. Ajuste em src/config/recognition.ts.
            </p>
          ) : (
            <p className="text-sm text-muted">Colete análises genuínas e impostoras para ver uma sugestão.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" icon={<Download className="size-4" aria-hidden />} onClick={exportJson} disabled={records.length === 0}>
              Exportar JSON
            </Button>
            <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setRecords([])} disabled={records.length === 0}>
              Limpar coleta
            </Button>
          </div>
          {records.length > 0 ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">Últimas análises</summary>
              <ul className="mt-2 max-h-48 overflow-y-auto tabular-nums">
                {records.slice(-15).reverse().map((r, i) => (
                  <li key={records.length - i} className="truncate">
                    {nameOf(r.truth)}: {Object.entries(r.scores).map(([id, s]) => `${nameOf(id)} ${s.toFixed(3)}`).join(' · ')}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      </div>
    </main>
  )
}
