import { ChevronDown, CircleCheck, ScanFace } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-x-8">
      <div className="min-w-0">
        <CameraStage
          label="Prévia da câmera para cadastro"
          tone={stageTone}
          hint={stageHint}
          className="aspect-[16/10] min-h-64"
        />
        <details className="group mt-4 text-sm text-muted">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-1 font-medium hover:text-ink [&::-webkit-details-marker]:hidden">
            Dicas para uma boa captura
            <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="mt-1 space-y-2 border-l-2 border-line pl-4 leading-relaxed" aria-label="Dicas de enquadramento e iluminação">
            <li>Enquadre o rosto inteiro e olhe de frente para a câmera.</li>
            <li>Use luz de frente. Evite janelas ou lâmpadas atrás de você.</li>
            <li>Durante a captura, mova a cabeça bem de leve.</li>
          </ul>
        </details>
      </div>

      <section aria-labelledby={ids.heading} className="rounded-xl border border-line bg-surface p-6 shadow-[var(--shadow-panel)] sm:p-7">
        <h2 id={ids.heading} className="text-base font-semibold tracking-[-0.015em]">
          Dados da pessoa
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">Informe o nome e registre o rosto pela câmera.</p>

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
            className="mt-7 flex flex-col gap-6"
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
                placeholder="Ex.: Maria Souza"
                value={name}
                disabled={busy}
                aria-invalid={!!nameError}
                aria-describedby={nameError ? ids.nameErr : duplicateName ? ids.nameDup : undefined}
                onChange={(e) => {
                  setName(e.target.value)
                  setNameError(null)
                }}
                onBlur={() => name && setNameError(validateName(name))}
                className="min-h-12 w-full min-w-0 rounded-lg border border-line-strong bg-surface px-3.5 text-ink placeholder:text-faint transition-[border-color] duration-150 hover:border-muted focus-visible:border-focus disabled:bg-sunken disabled:opacity-60 aria-[invalid=true]:border-attn"
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
              <label htmlFor={ids.consent} className="flex cursor-pointer items-start gap-3 rounded-md has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
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
                  <span className="text-ink">Autorizo o cadastro do meu rosto.</span>
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
            <p className="border-t border-line pt-4 text-xs leading-relaxed text-muted">
              Seus dados ficam salvos neste computador. Nenhuma foto é armazenada.
            </p>
          </form>
        )}
      </section>

      <div className="min-w-0 lg:col-span-2">
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
