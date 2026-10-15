import { TriangleAlert } from 'lucide-react'
import { useEffect, useSyncExternalStore } from 'react'
import { EnrollView } from './components/EnrollView'
import { Header, type Tab } from './components/Header'
import { InteractionView } from './components/InteractionView'
import { checkCompatibility } from './lib/compat'
import { peopleStore } from './storage/peopleStore'

function readTab(): Tab {
  return window.location.hash.startsWith('#/interacao') ? 'interacao' : 'cadastro'
}

function subscribeHash(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

const compat = checkCompatibility()

export default function App() {
  const tab = useSyncExternalStore(subscribeHash, readTab)

  useEffect(() => {
    void peopleStore.load()
  }, [])

  useEffect(() => {
    document.title = tab === 'interacao' ? 'Testar acesso · FacePass' : 'Cadastrar rosto · FacePass'
  }, [tab])

  return (
    <div className="min-h-dvh">
      <a
        href="#conteudo"
        onClick={(e) => {
          // A navegação usa o hash; o salto apenas move o foco para o conteúdo.
          e.preventDefault()
          document.getElementById('conteudo')?.focus()
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-action focus:px-4 focus:py-2 focus:text-white"
      >
        Pular para o conteúdo
      </a>
      <Header tab={tab} />
      <main id="conteudo" tabIndex={-1} className="outline-none mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
        {compat ? (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-attn-line bg-attn-bg p-4" role="alert">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-attn" aria-hidden />
            <div>
              <p className="font-medium">{compat.title}</p>
              <p className="text-sm text-muted">{compat.action}</p>
            </div>
          </div>
        ) : null}
        {/* Só a aba visível fica montada: ela registra o vídeo e o consumidor da análise. */}
        {tab === 'cadastro' ? <EnrollView /> : <InteractionView />}
      </main>
    </div>
  )
}
