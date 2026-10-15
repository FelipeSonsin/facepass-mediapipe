import { Check, Pencil, Trash2, X } from 'lucide-react'
import { useId, useState } from 'react'
import { dateFormat } from '../lib/compat'
import { normalizeName, sameName, validateName } from '../lib/names'
import type { PersonRecord } from '../storage/db'
import { isCompatible, peopleStore, usePeople } from '../storage/peopleStore'
import { Button } from './Button'
import { ConfirmDialog } from './ConfirmDialog'

export function PeopleList() {
  const { status, people, error } = usePeople()
  const [editing, setEditing] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<PersonRecord | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const headingId = useId()

  const confirmDelete = async () => {
    if (!toDelete) return
    setBusy(true)
    try {
      await peopleStore.remove(toDelete.id)
      setNotice(`Cadastro de ${toDelete.name} excluído.`)
      setToDelete(null)
    } catch {
      setNotice('Não foi possível excluir o cadastro. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby={headingId} className="overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-panel)]">
      <div className="flex items-baseline gap-3 border-b border-line px-5 py-4 sm:px-6">
        <h2 id={headingId} className="text-sm font-semibold">
          Pessoas cadastradas
        </h2>
        {status === 'ready' ? <span className="text-xs tabular-nums text-muted">{people.length}</span> : null}
      </div>
      <p className="sr-only" aria-live="polite">
        {notice}
      </p>
      {status === 'loading' ? <p className="px-4 py-4 text-sm text-muted sm:px-5">Carregando cadastros…</p> : null}
      {status === 'error' ? (
        <p className="px-4 py-4 text-sm text-attn sm:px-5">
          Os cadastros não puderam ser lidos: {error}
        </p>
      ) : null}
      {status === 'ready' && people.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted sm:px-6">Nenhuma pessoa cadastrada ainda.</p>
      ) : null}
      {people.length > 0 ? (
        <ul className="max-h-[22rem] divide-y divide-line overflow-y-auto">
          {people.map((p) =>
            editing === p.id ? (
              <EditRow key={p.id} person={p} others={people} onDone={(msg) => { setEditing(null); if (msg) setNotice(msg) }} />
            ) : (
              <li key={p.id} className="flex items-center gap-3 px-5 py-4 sm:px-6">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={p.name}>
                    {p.name}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted" title={p.updatedAt !== p.createdAt ? `Atualizado em ${dateFormat.format(p.updatedAt)}` : undefined}>
                    Cadastrado em <time dateTime={new Date(p.createdAt).toISOString()}>{dateFormat.format(p.createdAt)}</time>
                  </p>
                  {!isCompatible(p) ? <p className="text-sm text-attn">Cadastro de uma versão anterior. Exclua e cadastre de novo.</p> : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" aria-label={`Editar nome de ${p.name}`} onClick={() => setEditing(p.id)} className="w-11 sm:w-9 !px-0">
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                  <Button variant="ghost" size="sm" aria-label={`Excluir cadastro de ${p.name}`} onClick={() => setToDelete(p)} className="w-11 sm:w-9 !px-0 hover:!text-danger">
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              </li>
            ),
          )}
        </ul>
      ) : null}
      <ConfirmDialog
        open={!!toDelete}
        title="Excluir cadastro?"
        confirmLabel="Excluir cadastro"
        tone="danger"
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setToDelete(null)}
      >
        <p>
          As amostras faciais de <strong className="font-medium text-ink">{toDelete?.name}</strong> serão apagadas do banco local. Essa ação não pode ser desfeita.
        </p>
      </ConfirmDialog>
    </section>
  )
}

function EditRow({ person, others, onDone }: { person: PersonRecord; others: PersonRecord[]; onDone: (message?: string) => void }) {
  const [value, setValue] = useState(person.name)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const inputId = useId()
  const errorId = useId()
  const duplicate = !validateName(value) && others.some((o) => o.id !== person.id && sameName(o.name, value))

  const save = async () => {
    const err = validateName(value)
    if (err) {
      setError(err)
      return
    }
    setSaving(true)
    try {
      const name = normalizeName(value)
      await peopleStore.rename(person.id, name)
      onDone(`Nome alterado para ${name}.`)
    } catch {
      setError('Não foi possível salvar o nome. Tente de novo.')
      setSaving(false)
    }
  }

  return (
    <li className="px-4 py-3 sm:px-5">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
        className="flex flex-col gap-2"
      >
        <label htmlFor={inputId} className="text-sm text-muted">
          Novo nome
        </label>
        <div className="flex gap-2">
          <input
            id={inputId}
            name="nome"
            value={value}
            autoComplete="off"
            spellCheck={false}
            maxLength={80}
            // Foco movido para o campo que a pessoa acabou de pedir para editar.
            autoFocus
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => {
              setValue(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onDone()
            }}
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-sunken px-3 text-ink placeholder:text-faint focus-visible:border-focus"
          />
          <Button type="submit" size="sm" disabled={saving} aria-label="Salvar nome" className="w-11 !px-0">
            <Check className="size-4" aria-hidden />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onDone()} aria-label="Cancelar edição" className="w-11 !px-0">
            <X className="size-4" aria-hidden />
          </Button>
        </div>
        {error ? (
          <p id={errorId} className="text-sm text-attn">
            {error}
          </p>
        ) : duplicate ? (
          <p className="text-sm text-muted">Já existe outro cadastro com este nome. Os dois continuarão separados.</p>
        ) : null}
      </form>
    </li>
  )
}
