import { useState } from 'react'
import { useToast } from './Toast'
import { DEMO, MAX_STORES, supabase, type AppUser, type StoreRow } from './lib/supabase'

interface Props {
  stores: StoreRow[] // all stores, including inactive
  people: AppUser[] // everyone, so each store can show its managers
  onChanged: () => void
}

type Draft = Omit<StoreRow, 'id'> & { id?: string }
const blank = (): Draft => ({
  name: '', code: '', address: '', suburb: '', phone: '', email: '', owner_email: null,
  legal_name: '', abn: '', bank_name: '', bsb: '', account: '', active: true, password_set_at: null,
})

export default function Stores({ stores, people, onChanged }: Props) {
  const toast = useToast()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const activeCount = stores.filter((s) => s.active).length
  const managersOf = (id: string) => people.filter((p) => p.store_id === id && p.role === 'manager' && p.active)

  const f = (k: keyof Draft, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label>{label}
      <input name={String(k)} autoComplete="off" {...props} value={String(draft?.[k] ?? '')} onChange={(e) => setDraft((d) => d && { ...d, [k]: e.target.value })} />
    </label>
  )

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (DEMO) { toast.info('Demo mode: changes are not saved.'); return }
    if (!supabase || !draft) return
    setBusy(true)
    const row = {
      ...draft,
      code: draft.code.trim().toUpperCase(),
      email: draft.email?.trim().toLowerCase() || null,
    }
    const { id, password_set_at: _kept, ...fields } = row // the password date is set by the server, never from this form
    const { error } = id ? await supabase.from('stores').update(fields).eq('id', id) : await supabase.from('stores').insert(fields)
    setBusy(false)
    if (error) {
      toast.error(
        error.code === '23505' ? 'That name, code or email is already used by another store.'
          : error.message.includes('Store limit') ? `Limit reached: only ${MAX_STORES} active stores are allowed.`
            : error.message,
      )
      return
    }
    toast.success(`${draft.name} saved.`)
    setDraft(null); onChanged()
  }

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Stores</h1>
          <p className="muted">Using {activeCount} of {MAX_STORES} active stores. The <b>store email</b> is the shop’s own mailbox, shown on documents. Whoever runs a store is its <b>manager</b>: add them on the Users tab and they receive its payment notices, so there is nothing to type twice.</p>
        </div>
        <div className="actions">
          <button type="button" className="btn primary" disabled={activeCount >= MAX_STORES} onClick={() => setDraft(blank())}>Add store</button>
        </div>
      </div>

      {draft && (
        <section className="sheet block" style={{ marginBottom: 'var(--space-lg)' }}>
          <h2>{draft.id ? `Edit ${draft.name}` : 'New store'}</h2>
          <form onSubmit={save}>
            <div className="grid">
              {f('name', 'Store name', { required: true })}
              {f('code', 'Store code, 2 to 6 letters or digits', { required: true, pattern: '[A-Za-z0-9]{2,6}', maxLength: 6 })}
              {f('email', 'Store email', { type: 'email' })}
              {f('phone', 'Phone', { type: 'tel' })}
              {f('address', 'Address line')}
              {f('suburb', 'Suburb STATE Postcode')}
              {f('legal_name', 'Legal entity name')}
              {f('abn', 'ABN')}
              {f('bank_name', 'Bank account name')}
              {f('bsb', 'BSB')}
              {f('account', 'Account number')}
              <label className="inline">
                <input name="active" type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Active (can log in)
              </label>
            </div>
            <div className="actions" style={{ marginTop: 'var(--space-md)' }}>
              <button type="button" className="btn" onClick={() => setDraft(null)}>Cancel</button>
              <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save store'}</button>
            </div>
          </form>
        </section>
      )}

      <div className="tablewrap">
        <table className="book">
          <thead><tr><th>Store</th><th>Code</th><th>Store email</th><th>Managers</th><th>ABN</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
          <tbody>
            {stores.map((s) => (
              <tr key={s.id} className={s.active ? '' : 'inactive'}>
                <td data-label="Store"><b>{s.name}</b>{!s.active && <small> (inactive)</small>}</td>
                <td data-label="Code"><span className="num">{s.code}</span></td>
                <td data-label="Store email">{s.email ?? <span className="chip warn">Not set</span>}</td>
                <td data-label="Managers">{managersOf(s.id).length === 0 ? <span className="chip warn">No manager yet</span> : managersOf(s.id).map((m) => <div key={m.user_id}><b>{m.full_name}</b> <small>{m.email}</small></div>)}</td>
                <td data-label="ABN">{s.abn ? <span className="num">{s.abn}</span> : <span className="chip warn">Not set</span>}</td>
                <td className="rowactions">
                  <button type="button" className="btn" onClick={() => setDraft({ ...s })}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
