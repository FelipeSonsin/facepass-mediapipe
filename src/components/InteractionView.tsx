import { CircleCheck, CircleX, UserPlus, Users } from 'lucide-react'
import { useId } from 'react'
import { useCamera } from '../camera/cameraController'
import { useRecognition } from '../recognition/useRecognition'
import { isCompatible, usePeople } from '../storage/peopleStore'
import { useFrameState } from '../vision/analyzer'
import { ISSUE_MESSAGES } from '../vision/quality'
import { CameraStage } from './CameraStage'
import type { GuideTone } from './FrameGuide'

export function InteractionView() {
  const cam = useCamera()
  const frame = useFrameState()
  const { status, people } = usePeople()
  const hasPeople = people.some(isCompatible)
  const { view, error } = useRecognition(true)
  const headingId = useId()

  const grantedName = view.grantedPersonId ? (people.find((p) => p.id === view.grantedPersonId)?.name ?? null) : null
  const granted = cam.status === 'on' && grantedName !== null
  const denied = cam.status === 'on' && frame.active && frame.faceCount === 1 && !frame.issue && view.deniedReason !== null

  let tone: GuideTone = 'idle'
  let hint: string | null = null
  if (frame.active) {
    if (granted) tone = 'granted'
    else if (frame.faceCount > 1) {
      tone = 'multiple'
      hint = 'Fique apenas uma pessoa diante da câmera.'
    } else if (frame.faceCount === 0) tone = 'searching'
    else if (frame.issue === 'unreadable') {
      tone = 'adjust'
      hint = 'Olhe para a câmera, de frente.'
    } else if (frame.issue && frame.issue !== 'no-face') {
      tone = 'adjust'
      hint = ISSUE_MESSAGES[frame.issue]
    } else tone = 'ready'
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8">
      <CameraStage
        label="Câmera de identificação"
        tone={tone}
        hint={hasPeople ? hint : null}
        className="aspect-[16/10] min-h-64"
        controls={
          error ? (
            <p className="text-sm text-attn" role="alert">
              O processamento falhou. A identificação foi suspensa.
            </p>
          ) : null
        }
      />

      <section aria-labelledby={headingId} className="overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-panel)] lg:sticky lg:top-6">
        <h2 id={headingId} className="border-b border-line px-6 py-4 text-sm font-semibold">
          Resultado da identificação
        </h2>
        {status === 'ready' && !hasPeople ? (
          <div className="flex min-h-48 flex-col items-start justify-center gap-5 p-6 sm:min-h-64 sm:p-7">
            <Users className="size-7 text-faint" strokeWidth={1.5} aria-hidden />
            <div>
              <p className="text-lg font-medium tracking-tight">Nenhum rosto cadastrado</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">Cadastre uma pessoa para começar a testar o acesso.</p>
            </div>
            <a
              href="#/cadastro"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-action px-4 text-[15px] font-medium text-white transition-[background-color] duration-150 hover:bg-action-hover"
            >
              <UserPlus className="size-4" aria-hidden />
              Cadastrar rosto
            </a>
          </div>
        ) : (
          // Região de tamanho fixo: o layout não se move quando alguém é reconhecido.
          <div
            aria-live="polite"
            aria-atomic="true"
            className={`flex min-h-36 items-center border-l-[3px] p-6 transition-[background-color,border-color] duration-200 sm:min-h-64 sm:p-7 ${
              granted ? 'border-ok bg-ok-bg' : denied ? 'border-danger bg-danger-bg' : 'border-transparent bg-surface'
            }`}
          >
            {granted ? (
              <div key={view.grantedPersonId} className="animate-grant flex w-full items-start gap-4 sm:flex-col sm:gap-5">
                <CircleCheck className="size-8 shrink-0 text-ok" strokeWidth={1.5} aria-hidden />
                <div className="min-w-0">
                  <p className="text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ok-ink">Acesso liberado</p>
                  <p className="mt-2 break-words text-base text-ink">Olá, {grantedName}</p>
                </div>
              </div>
            ) : denied ? (
              <div className="animate-grant flex w-full items-start gap-4 sm:flex-col sm:gap-5">
                <CircleX className="size-8 shrink-0 text-danger" strokeWidth={1.5} aria-hidden />
                <div className="min-w-0">
                  <p className="text-[26px] font-semibold leading-tight tracking-[-0.025em] text-danger">Acesso negado</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {view.deniedReason === 'ambiguous' ? 'Não foi possível confirmar sua identidade. Olhe de frente para a câmera e tente novamente.' : 'Rosto não cadastrado. Cadastre seu rosto para testar o acesso.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-base font-medium text-muted">Aguardando identificação</p>
                <p className="text-sm leading-relaxed text-muted">
                  {cam.status === 'on' ? 'O resultado aparecerá aqui após a análise do rosto.' : 'Ative a câmera para iniciar a verificação.'}
                </p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
