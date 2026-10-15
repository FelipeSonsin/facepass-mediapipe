export type Tab = 'cadastro' | 'interacao'

const TABS: { id: Tab; label: string }[] = [
  { id: 'cadastro', label: 'Cadastrar rosto' },
  { id: 'interacao', label: 'Testar acesso' },
]

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#245ad0" />
      <path d="M8 12v-2a2 2 0 0 1 2-2h2m8 0h2a2 2 0 0 1 2 2v2m0 8v2a2 2 0 0 1-2 2h-2m-8 0h-2a2 2 0 0 1-2-2v-2" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 16a4 4 0 0 0 8 0m-6-3h.01M18 13h.01" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function Header({ tab }: { tab: Tab }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-4 px-5 pt-4 sm:px-8 sm:pt-0">
        <a href="#/cadastro" className="flex items-center gap-2.5 rounded-lg" aria-label="FacePass, início">
          <Logo />
          <span className="text-lg font-semibold tracking-[-0.035em]" translate="no">
            FacePass
          </span>
        </a>
        <nav aria-label="Seções" className="w-full sm:w-auto">
          <ul className="grid grid-cols-2 gap-6 sm:flex sm:gap-8">
            {TABS.map(({ id, label }) => {
              const active = tab === id
              return (
                <li key={id}>
                  <a
                    href={`#/${id}`}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-12 items-center justify-center border-b-2 px-1 text-sm font-medium transition-colors duration-150 sm:min-h-18 ${
                      active ? 'border-action text-action' : 'border-transparent text-muted hover:border-line-strong hover:text-ink'
                    }`}
                  >
                    {label}
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>
    </header>
  )
}
