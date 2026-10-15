import { CircleCheck, Lightbulb, Move, ScanFace, ShieldCheck } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useCamera } from '../camera/cameraController'
import { useEnrollment } from '../enrollment/useEnrollment'
import { normalizeName, sameName, validateName } from '../lib/names'
import { usePeople } from '../storage/peopleStore'
import { useFrameState, useModelState, type FrameState } from '../vision/analyzer'
import { ISSUE_MESSAGES } from '../vision/quality'
import { Button } from './Button'
import { CameraStage } from './CameraStage'
import { ConfirmDialog } from './ConfirmDialog'
import type { GuideTone } from './FrameGuide'
import { PeopleList } from './PeopleList'

function frameGuidance(f: FrameState): { tone: GuideTone; hint: string | null; blocker: string | null } {
  if (!f.active) return { tone: 'idle', hint: null, blocker: 'Aguarde a câmera começar a analisar o vídeo.' }
  if (f.faceCount === 0) return { tone: 'searching', hint: 'Posicione o rosto dentro da moldura.', blocker: 'Nenhum rosto detectado. Posicione o rosto dentro da moldura.' }
  if (f.faceCount > 1) return { tone: 'multiple', hint: 'Fique apenas uma pessoa diante da câmera.', blocker: 'Há mais de uma pessoa na câmera. Fique apenas você diante dela.' }
  if (f.issue === 'unreadable') return { tone: 'adjust', hint: 'Olhe para a câmera, de frente.', blocker: 'O rosto não está nítido. Olhe para a câmera, de frente.' }
  if (f.issue && f.issue !== 'no-face') return { tone: 'adjust', hint: ISSUE_MESSAGES[f.issue], blocker: ISSUE_MESSAGES[f.issue] }
  return { tone: 'ready', hint: 'Rosto posicionado.', blocker: null }
}

export function EnrollView() {
  const cam = useCamera()
  const models = useModelState()
  const frame = useFrameState()
  const { people } = usePeople()
  const { phase, start, cancel, confirmUpdate, reset } = useEnrollment()

  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const [consentError, setConsentError] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const consentRef = useRef<HTMLInputElement>(null)
  const ids = { name: useId(), nameErr: useId(), nameDup: useId(), consent: useId(), start: useId(), heading: useId() }

  const guidance = frameGuidance(frame)
  const capturing = phase.kind === 'capturing'
  const busy = capturing || phase.kind === 'saving' || phase.kind === 'duplicate'
  const duplicateName = !validateName(name) && people.some((p) => sameName(p.name, name))

  // Avisa antes de sair da página no meio da captura ou da gravação.
  useEffect(() => {
    if (!busy) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [busy])

  const onRegister = () => {
    setStartError(null)
    const err = validateName(name)
    if (err) {
      setNameError(err)
      nameRef.current?.focus()
      return
    }
    if (!consent) {
      setConsentError(true)
      consentRef.current?.focus()
      return
    }
    if (cam.status !== 'on') return setStartError('Ative a câmera para registrar o rosto.')
    if (models.status !== 'ready') return setStartError('Aguarde o carregamento dos modelos de reconhecimento.')
    if (guidance.blocker) return setStartError(guidance.blocker)
    start(normalizeName(name))
  }

  const stageTone: GuideTone = capturing && frame.active && guidance.tone === 'ready' ? 'ready' : guidance.tone
  const stageHint = capturing ? phase.hint || guidance.hint : cam.status === 'on' ? guidance.hint : null

  return (
    // Celular: câmera → formulário → lista → dicas (o botão fica perto da câmera).
    // Computador: câmera e dicas à esquerda; formulário e lista à direita.
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-6 lg:gap-y-5">
      <div className="lg:col-start-1 lg:row-start-1">
        <CameraStage
          label="Prévia da câmera para cadastro"
          tone={stageTone}
          hint={stageHint}
          progress={capturing ? { count: phase.count, total: phase.total } : undefined}
          className="aspect-video"
        />
      </div>
      <ul className="order-last grid gap-3 text-sm text-muted sm:grid-cols-3 lg:order-none lg:col-start-1 lg:row-start-2" aria-label="Dicas de enquadramento e iluminação">
        <Tip icon={<ScanFace className="size-4" aria-hidden />}>Rosto inteiro dentro da moldura, olhando para a câmera.</Tip>
        <Tip icon={<Lightbulb className="size-4" aria-hidden />}>Luz de frente para o rosto. Evite janela ou lâmpada atrás de você.</Tip>
        <Tip icon={<Move className="size-4" aria-hidden />}>Durante a captura, mova a cabeça bem de leve.</Tip>
      </ul>

      <div className="flex flex-col gap-5 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <section aria-labelledby={ids.heading} className="rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-panel)] sm:p-5">
          <h1 id={ids.heading} className="text-xl font-semibold tracking-[-0.01em]">
            Cadastrar rosto
          </h1>
          <p className="mt-1 text-sm text-muted">Informe o nome, ative a câmera e registre 5 amostras do rosto.</p>

          {phase.kind === 'done' ? (
            <div className="animate-grant mt-5 rounded-xl border border-ok-line bg-ok-bg p-4" role="status">
              <div className="flex items-start gap-3">
                <CircleCheck className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />
                <div className="min-w-0">
                  <p className="font-medium text-ok-ink">{phase.updated ? 'Cadastro atualizado' : 'Cadastro concluído'}</p>
                  <p className="mt-0.5 break-words text-sm text-ink">
                    O rosto de {phase.name} já pode ser identificado na página de teste de acesso.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href="#/interacao"
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-action px-4 text-[15px] font-medium text-white transition-[background-color] duration-150 hover:bg-action-hover"
                >
                  Testar acesso agora
                </a>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setName('')
                    setConsent(false)
                    reset()
                  }}
                >
                  Cadastrar outra pessoa
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="mt-5 flex flex-col gap-5"
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                onRegister()
              }}
            >
              <div className="flex flex-col gap-1.5">
                <label htmlFor={ids.name} className="text-sm font-medium">
                  Nome
                </label>
                <input
                  ref={nameRef}
                  id={ids.name}
                  name="nome"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={80}
                  placeholder="Ex.: Maria Souza…"
                  value={name}
                  disabled={busy}
                  aria-invalid={!!nameError}
                  aria-describedby={nameError ? ids.nameErr : duplicateName ? ids.nameDup : undefined}
                  onChange={(e) => {
                    setName(e.target.value)
                    setNameError(null)
                  }}
                  onBlur={() => name && setNameError(validateName(name))}
                  className="min-h-11 rounded-lg border border-line-strong bg-sunken px-3 text-ink placeholder:text-faint transition-[border-color] duration-150 hover:border-[#4a5f7d] focus-visible:border-focus disabled:opacity-60 aria-[invalid=true]:border-attn"
                />
                {nameError ? (
                  <p id={ids.nameErr} className="text-sm text-attn">
                    {nameError}
                  </p>
                ) : duplicateName ? (
                  <p id={ids.nameDup} className="text-sm text-muted">
                    Já existe um cadastro com este nome. Este será um cadastro separado.
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={ids.consent} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-sunken/60 p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
                  <input
                    ref={consentRef}
                    id={ids.consent}
                    name="autorizacao"
                    type="checkbox"
                    checked={consent}
                    disabled={busy}
                    aria-invalid={consentError}
                    onChange={(e) => {
                      setConsent(e.target.checked)
                      setConsentError(false)
                    }}
                    className="mt-0.5 size-5 shrink-0 accent-action focus-visible:outline-none"
                  />
                  <span className="text-sm">
                    <span className="font-medium text-ink">Autorizo o cadastro do meu rosto.</span>
                    <span className="mt-1 flex items-start gap-1.5 text-muted">
                      <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                      As amostras ficam salvas só neste navegador. Nenhuma imagem é guardada.
                    </span>
                  </span>
                </label>
                {consentError ? <p className="text-sm text-attn">Marque a autorização para continuar.</p> : null}
              </div>

              {capturing ? (
                <div className="flex flex-col gap-3" role="status" aria-live="polite">
                  <div className="flex items-baseline justify-between">
                    <p className="font-medium">Capturando amostras</p>
                    <p className="text-sm tabular-nums text-muted">
                      {phase.count} de {phase.total} amostras
                    </p>
                  </div>
                  <div className="flex gap-1.5" aria-hidden="true">
                    {Array.from({ length: phase.total }, (_, i) => (
                      <span key={i} className={`h-1.5 flex-1 rounded-full transition-[background-color] duration-200 ${i < phase.count ? 'bg-guide' : 'bg-line'}`} />
                    ))}
                  </div>
                  <p className="text-sm text-muted">{phase.hint}</p>
                  <Button variant="secondary" onClick={cancel}>
                    Cancelar captura
                  </Button>
                </div>
              ) : phase.kind === 'saving' ? (
                <p className="text-sm text-muted" role="status">
                  Salvando cadastro…
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button type="submit" aria-describedby={startError ? ids.start : undefined} icon={<ScanFace className="size-4" aria-hidden />}>
                    Registrar rosto
                  </Button>
                  <div aria-live="polite">
                    {startError ? (
                      <p id={ids.start} className="text-sm text-attn">
                        {startError}
                      </p>
                    ) : phase.kind === 'stopped' || phase.kind === 'error' ? (
                      <p className="text-sm text-attn">{phase.message}</p>
                    ) : null}
                  </div>
                </div>
              )}
            </form>
          )}
        </section>

        <PeopleList />
      </div>

      <ConfirmDialog
        open={phase.kind === 'duplicate'}
        title="Este rosto já está cadastrado"
        confirmLabel="Atualizar cadastro"
        onConfirm={() => void confirmUpdate()}
        onCancel={cancel}
      >
        {phase.kind === 'duplicate' ? (
          <p>
            As amostras correspondem a <strong className="font-medium text-ink">{phase.personName}</strong>. Deseja substituir as amostras desse cadastro pelas novas? O nome continua{" "}
            {phase.personName}. Se cancelar, nada será salvo.
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  )
}

function Tip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 rounded-xl border border-line bg-surface/60 px-3.5 py-3">
      <span className="mt-0.5 text-guide">{icon}</span>
      <span>{children}</span>
    </li>
  )
}
