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
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
      <h1 className="sr-only">Testar acesso</h1>
      <CameraStage
        label="Câmera de identificação"
        tone={tone}
        hint={hasPeople ? hint : null}
        className="aspect-video"
        controls={
          error ? (
            <p className="text-sm text-attn" role="alert">
              O processamento falhou. A identificação foi suspensa.
            </p>
          ) : null
        }
      />

      <section aria-labelledby={headingId} className="lg:sticky lg:top-6">
        <h2 id={headingId} className="sr-only">
          Resultado da identificação
        </h2>
        {status === 'ready' && !hasPeople ? (
          <div className="flex min-h-56 flex-col items-start justify-center gap-4 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-panel)] lg:min-h-80">
            <span className="grid size-11 place-items-center rounded-full bg-raised ring-1 ring-line">
              <Users className="size-5 text-muted" aria-hidden />
            </span>
            <div>
              <p className="text-lg font-semibold">Nenhum rosto cadastrado</p>
              <p className="mt-1 text-sm text-muted">Cadastre uma pessoa para que ela possa ser identificada aqui.</p>
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
            className={`flex min-h-56 items-center rounded-2xl border p-5 transition-[background-color,border-color] duration-200 lg:min-h-80 ${
              granted ? 'border-ok-line bg-ok-bg' : denied ? 'border-danger/50 bg-danger-bg' : 'border-dashed border-line bg-surface/40'
            }`}
          >
            {granted ? (
              <div key={view.grantedPersonId} className="animate-grant flex w-full flex-col gap-4">
                <CircleCheck className="size-11 text-ok" strokeWidth={1.75} aria-hidden />
                <div className="min-w-0">
                  <p className="text-[28px] font-semibold leading-tight tracking-[-0.015em] text-ok-ink">Acesso liberado</p>
                  <p className="mt-1.5 break-words text-lg text-ink">Olá, {grantedName}</p>
                </div>
              </div>
            ) : denied ? (
              <div className="animate-grant flex w-full flex-col gap-4">
                <CircleX className="size-11 text-danger" strokeWidth={1.75} aria-hidden />
                <div className="min-w-0">
                  <p className="text-[28px] font-semibold leading-tight tracking-[-0.015em] text-danger">Acesso negado</p>
                  <p className="mt-1.5 text-base text-ink">
                    {view.deniedReason === 'ambiguous' ? 'Não foi possível confirmar sua identidade. Olhe de frente para a câmera e tente novamente.' : 'Rosto não cadastrado. Cadastre seu rosto para testar o acesso.'}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  )
}
