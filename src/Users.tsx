import { useState } from 'react'
import PasswordDialog from './PasswordDialog'
import { useToast } from './Toast'
import { DEMO, ROLE_LABEL, supabase, type AppUser, type StoreRow } from './lib/supabase'

interface Props {
  users: AppUser[]
  stores: StoreRow[] // all stores, including inactive, so every person's store can be named
  onChanged: () => void
}

type Draft = { user_id?: string; email: string; full_name: string; role: AppUser['role']; store_id: string }
const blank = (storeId: string): Draft => ({ email: '', full_name: '', role: 'staff', store_id: storeId })

/** Admin only: the people who sign in. Each has their own login, one store and one role. */
export default function Users({ users, stores, onChanged }: Props) {
  const toast = useToast()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [creating, setCreating] = useState<Draft | null>(null) // passed on to the password dialog
  const [resetFor, setResetFor] = useState<AppUser | null>(null)
  const [busy, setBusy] = useState(false)
  const active = stores.filter((s) => s.active)
  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? 'Unknown store'

  const call = async (body: Record<string, unknown>): Promise<boolean> => {
    if (DEMO) { toast.info('Demo mode: changes are not saved.'); return false }
    if (!supabase) return false
    const { data, error } = await supabase.functions.invoke('manage-user', { body })
    if (error || data?.error) {
      let msg = data?.error as string | undefined
      if (!msg && error && 'context' in error) msg = (await (error as { context: Response }).context.json().catch(() => null))?.error
      toast.error(msg ?? 'Could not save. Try again.')
      return false
    }
    return true
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft) return
    if (!draft.user_id) { setCreating(draft); setDraft(null); return } // the password dialog does the create
    setBusy(true)
    const ok = await call({ action: 'update', user_id: draft.user_id, full_name: draft.full_name, role: draft.role, store_id: draft.store_id })
    setBusy(false)
    if (!ok) return
    toast.success(`${draft.full_name} saved.`)
    setDraft(null); onChanged()
  }

  const setActive = async (u: AppUser, next: boolean) => {
    if (!next && !window.confirm(`Stop ${u.full_name} signing in? Their documents stay. You can turn them back on later.`)) return
    const ok = await call({ action: 'update', user_id: u.user_id, active: next })
    if (!ok) return
    toast.success(next ? `${u.full_name} can sign in again.` : `${u.full_name} can no longer sign in.`)
    onChanged()
  }

  const field = (k: 'full_name' | 'email', label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label>{label}
      <input name={k} autoComplete="off" required {...props} value={draft?.[k] ?? ''} onChange={(e) => setDraft((d) => d && { ...d, [k]: e.target.value })} />
    </label>
  )

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Users</h1>
          <p className="muted">Each person signs in with their own email and password. A <b>manager</b> sees every quote and invoice at their store, and the reports. <b>Staff</b> see only the documents they create.</p>
        </div>
        <div className="actions">
          <button type="button" className="btn primary" disabled={active.length === 0} onClick={() => setDraft(blank(active[0]?.id ?? ''))}>Add user</button>
        </div>
      </div>

      {draft && (
        <section className="sheet block" style={{ marginBottom: 'var(--space-lg)' }}>
          <h2>{draft.user_id ? `Edit ${draft.full_name}` : 'New user'}</h2>
          <form onSubmit={submit}>
            <div className="grid">
              {field('full_name', 'Full name')}
              {field('email', 'Email (their login)', { type: 'email', disabled: !!draft.user_id })}
              <label>Role
                <select name="role" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as AppUser['role'] })}>
                  <option value="staff">Staff: sees only their own documents</option>
                  <option value="manager">Manager: sees the whole store, and reports</option>
                </select>
              </label>
              <label>Store
                <select name="store" required value={draft.store_id} onChange={(e) => setDraft({ ...draft, store_id: e.target.value })}>
                  {active.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            </div>
            <div className="actions" style={{ marginTop: 'var(--space-md)' }}>
              <button type="button" className="btn" onClick={() => setDraft(null)}>Cancel</button>
              <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving…' : draft.user_id ? 'Save user' : 'Next: set a password'}</button>
            </div>
          </form>
        </section>
      )}

      {users.length === 0 ? (
        <div className="state"><p>No users yet</p><p className="muted">Add a manager or staff member to give them their own login.</p></div>
      ) : (
        <div className="tablewrap">
          <table className="book">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Store</th><th>Status</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id} className={u.active ? '' : 'inactive'}>
                  <td data-label="Name"><b>{u.full_name}</b></td>
                  <td data-label="Email">{u.email}</td>
                  <td data-label="Role"><span className="chip">{ROLE_LABEL[u.role]}</span></td>
                  <td data-label="Store">{storeName(u.store_id)}</td>
                  <td data-label="Status">{u.active ? <span className="chip paid">Active</span> : <span className="chip warn">Cannot sign in</span>}</td>
                  <td className="rowactions">
                    <button type="button" className="btn" onClick={() => setResetFor(u)}>Reset password</button>
                    <button type="button" className="btn" onClick={() => setDraft({ user_id: u.user_id, email: u.email, full_name: u.full_name, role: u.role, store_id: u.store_id })}>Edit</button>
                    <button type="button" className="btn" onClick={() => setActive(u, !u.active)}>{u.active ? 'Turn off' : 'Turn on'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <PasswordDialog name={creating.full_name} email={creating.email} fn="manage-user"
          body={{ action: 'create', email: creating.email, full_name: creating.full_name, role: creating.role, store_id: creating.store_id }}
          onClose={() => setCreating(null)} onDone={onChanged} />
      )}
      {resetFor && (
        <PasswordDialog name={resetFor.full_name} email={resetFor.email} fn="manage-user"
          body={{ action: 'reset_password', user_id: resetFor.user_id }}
          onClose={() => setResetFor(null)} onDone={onChanged} />
      )}
    </>
  )
}
