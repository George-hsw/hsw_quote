import { useState } from 'react'
import PasswordDialog from './PasswordDialog'
import { useToast } from './Toast'
import { DEMO, MAX_STORES, supabase, type StoreRow } from './lib/supabase'

interface Props {
  stores: StoreRow[] // all stores, including inactive
  onChanged: () => void
}

type Draft = Omit<StoreRow, 'id'> & { id?: string }
const blank = (): Draft => ({
  name: '', code: '', address: '', suburb: '', phone: '', email: '', owner_email: '',
  legal_name: '', abn: '', bank_name: '', bsb: '', account: '', active: true, password_set_at: null,
})

export default function Stores({ stores, onChanged }: Props) {
  const toast = useToast()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [pwStore, setPwStore] = useState<StoreRow | null>(null)
  const [busy, setBusy] = useState(false)
  const activeCount = stores.filter((s) => s.active).length

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
      owner_email: draft.owner_email?.trim().toLowerCase() || null,
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
          <p className="muted">Using {activeCount} of {MAX_STORES} active stores. A store’s <b>login email</b> receives the sign-in code; the <b>franchise owner email</b> receives payment notifications.</p>
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
              {f('code', 'Code, 2 to 4 letters', { required: true, pattern: '[A-Za-z]{2,4}', maxLength: 4 })}
              {f('email', 'Store login email', { type: 'email' })}
              {f('owner_email', 'Franchise owner email', { type: 'email' })}
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
          <thead><tr><th>Store</th><th>Code</th><th>Login email</th><th>Owner email</th><th>ABN</th><th>Password</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
          <tbody>
            {stores.map((s) => (
              <tr key={s.id} className={s.active ? '' : 'inactive'}>
                <td data-label="Store"><b>{s.name}</b>{!s.active && <small> (inactive)</small>}</td>
                <td data-label="Code"><span className="num">{s.code}</span></td>
                <td data-label="Login email">{s.email ?? <span className="chip warn">Not set</span>}</td>
                <td data-label="Owner email">{s.owner_email ?? <span className="chip warn">Not set</span>}</td>
                <td data-label="ABN">{s.abn ? <span className="num">{s.abn}</span> : <span className="chip warn">Not set</span>}</td>
                <td data-label="Password">{s.password_set_at ? <span className="chip paid">Set</span> : <span className="chip warn">Not set</span>}</td>
                <td className="rowactions">
                  <button type="button" className="btn" disabled={!s.email} title={s.email ? undefined : 'Add a login email first'} onClick={() => setPwStore(s)}>{s.password_set_at ? 'Reset password' : 'Set password'}</button>
                  <button type="button" className="btn" onClick={() => setDraft({ ...s })}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pwStore && <PasswordDialog store={pwStore} onClose={() => setPwStore(null)} onDone={onChanged} />}
    </>
  )
}
