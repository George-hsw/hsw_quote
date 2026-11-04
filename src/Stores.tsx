import { useState } from 'react'
import StorePanel from './StorePanel'
import { MAX_STORES, type AppUser, type Member, type StoreRow } from './lib/supabase'

interface Props {
  stores: StoreRow[] // all stores, including inactive
  people: AppUser[]
  members: Member[]
  onChanged: () => void
}

/** Admin only. Pick a store to see and change who is in it; add a person there and set their permission. */
export default function Stores({ stores, people, members, onChanged }: Props) {
  const [openId, setOpenId] = useState<string | 'new' | null>(null)
  const activeCount = stores.filter((s) => s.active).length
  const inStore = (id: string) => members.filter((m) => m.store_id === id)
  const managersOf = (id: string) =>
    inStore(id).filter((m) => m.role === 'manager').map((m) => people.find((p) => p.user_id === m.user_id)).filter((p): p is AppUser => !!p && p.active)
  const open = openId && openId !== 'new' ? stores.find((s) => s.id === openId) ?? null : null

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Stores</h1>
          <p className="muted">Using {activeCount} of {MAX_STORES} active stores. Open a store to add people, choose what each can do, and edit its details.</p>
        </div>
        <div className="actions">
          <button type="button" className="btn primary" disabled={activeCount >= MAX_STORES} onClick={() => setOpenId('new')}>Add store</button>
        </div>
      </div>

      <div className="tablewrap">
        <table className="book stores">
          <thead><tr><th>Store</th><th>Code</th><th>Managers</th><th>People</th><th>ABN</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
          <tbody>
            {stores.map((s) => {
              const mgrs = managersOf(s.id)
              return (
                <tr key={s.id} className={s.active ? '' : 'inactive'}>
                  <td data-label="Store"><b>{s.name}</b>{!s.active && <small> (inactive)</small>}</td>
                  <td data-label="Code"><span className="num">{s.code}</span></td>
                  <td data-label="Managers">{mgrs.length === 0 ? <span className="chip warn">No manager yet</span> : mgrs.map((m) => <div key={m.user_id}><b>{m.full_name}</b> <small>{m.email}</small></div>)}</td>
                  <td data-label="People"><span className="num">{inStore(s.id).length}</span></td>
                  <td data-label="ABN">{s.abn ? <span className="num">{s.abn}</span> : <span className="chip warn">Not set</span>}</td>
                  <td className="rowactions">
                    <button type="button" className="btn" onClick={() => setOpenId(s.id)}>Open</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {openId && (openId === 'new' || open) && (
        <StorePanel key={openId} store={open} stores={stores} people={people} members={members}
          onClose={() => setOpenId(null)} onChanged={onChanged} />
      )}
    </>
  )
}
