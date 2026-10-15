import { ScanFace, UserPlus } from 'lucide-react'
import { useCamera } from '../camera/cameraController'

export type Tab = 'cadastro' | 'interacao'

const TABS: { id: Tab; label: string; icon: typeof UserPlus }[] = [
  { id: 'cadastro', label: 'Cadastrar rosto', icon: UserPlus },
  { id: 'interacao', label: 'Testar acesso', icon: ScanFace },
]

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
      <rect x="0.5" y="0.5" width="31" height="31" rx="9" fill="#172338" stroke="#34465f" />
      <path d="M10 13v-2.5A1.5 1.5 0 0 1 11.5 9H14M18 9h2.5a1.5 1.5 0 0 1 1.5 1.5V13M22 19v2.5a1.5 1.5 0 0 1-1.5 1.5H18M14 23h-2.5A1.5 1.5 0 0 1 10 21.5V19" fill="none" stroke="#8fb3ff" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16" cy="16" r="2.2" fill="#f1f5f9" />
    </svg>
  )
}

function CameraStatus() {
  const cam = useCamera()
  const map = {
    off: { text: 'Câmera desligada', dot: 'bg-faint' },
    starting: { text: 'Ativando câmera…', dot: 'bg-guide' },
    on: { text: 'Câmera ativa', dot: 'bg-guide' },
    error: { text: 'Câmera indisponível', dot: 'bg-attn' },
  } as const
  const s = map[cam.status]
  return (
    <p className="flex items-center gap-2 whitespace-nowrap rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-muted" role="status">
      <span className={`size-2 rounded-full ${s.dot}`} aria-hidden="true" />
      {s.text}
    </p>
  )
}

export function Header({ tab }: { tab: Tab }) {
  return (
    <header className="border-b border-line bg-bg/95">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <a href="#/cadastro" className="flex items-center gap-2.5 rounded-lg" aria-label="FacePass, início">
          <Logo />
          <span className="text-[17px] font-semibold tracking-[-0.01em]" translate="no">
            FacePass
          </span>
        </a>
        <nav aria-label="Seções" className="order-3 w-full sm:order-none sm:w-auto">
          <ul className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface p-1 sm:flex">
            {TABS.map(({ id, label, icon: Icon }) => {
              const active = tab === id
              return (
                <li key={id}>
                  <a
                    href={`#/${id}`}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-10 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-[background-color,color] duration-150 ${
                      active ? 'bg-raised text-ink ring-1 ring-line-strong' : 'text-muted hover:bg-raised/60 hover:text-ink'
                    }`}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {label}
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="ml-auto">
          <CameraStatus />
        </div>
      </div>
    </header>
  )
}
