import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import Builder from './Builder'
import Documents from './Documents'
import Login from './Login'
import Stores from './Stores'
import { useToast } from './Toast'
import { ADMIN_EMAIL, DEMO, demoStores, supabase, type DocRow, type StoreRow } from './lib/supabase'

type Tab = 'new' | 'docs' | 'stores'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined) // undefined = still checking
  useEffect(() => {
    if (DEMO || !supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (DEMO && location.search.includes('login')) return <Login /> // preview the sign-in screen
  if (DEMO) return <Shell session={{ user: { email: ADMIN_EMAIL } } as Session} />
  if (!supabase) {
    return (
      <main className="login">
        <h1>Setup needed</h1>
        <p>This build has no Supabase connection. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see README).</p>
      </main>
    )
  }
  if (session === undefined) return <main className="container page"><p className="muted">Loading…</p></main>
  if (!session) return <Login />
  return <Shell session={session} />
}

function Shell({ session }: { session: Session }) {
  const toast = useToast()
  const email = (session.user.email ?? '').toLowerCase()
  const isAdmin = email === ADMIN_EMAIL
  const [tab, setTab] = useState<Tab>('new')
  const [allStores, setAllStores] = useState<StoreRow[] | null>(null)
  const [openDoc, setOpenDoc] = useState<DocRow | null>(null)
  const [builderKey, setBuilderKey] = useState(0)
  const [refresh, setRefresh] = useState(0)

  const loadStores = useCallback(async () => {
    if (DEMO) return setAllStores(demoStores())
    const { data } = await supabase!.from('stores').select('*').order('name')
    setAllStores((data ?? []) as StoreRow[])
  }, [])
  useEffect(() => { loadStores() }, [loadStores])

  const active = (allStores ?? []).filter((s) => s.active)
  const go = (t: Tab) => { setTab(t); if (t === 'new') { setOpenDoc(null); setBuilderKey((k) => k + 1) } }
  const open = (d: DocRow) => { setOpenDoc(d); setBuilderKey((k) => k + 1); setTab('new') }

  const noAccess = allStores && !isAdmin && active.length === 0

  return (
    <>
      <header className="topbar">
        <div className="container bar">
          <img className="logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="Howards Storage World" width="120" height="32" />
          <nav aria-label="Main">
            <button type="button" className="tab" aria-current={tab === 'new' ? 'page' : undefined} onClick={() => go('new')}>New</button>
            <button type="button" className="tab" aria-current={tab === 'docs' ? 'page' : undefined} onClick={() => go('docs')}>Documents</button>
            {isAdmin && <button type="button" className="tab" aria-current={tab === 'stores' ? 'page' : undefined} onClick={() => go('stores')}>Stores</button>}
          </nav>
          <div className="who">
            <span><span className="who-name">{isAdmin ? 'Admin' : active[0]?.name ?? ''}</span><small>{email}</small></span>
            <button type="button" className="quiet" onClick={() => (DEMO ? toast.info('Demo mode: there is no sign-in.') : supabase!.auth.signOut())}>Sign out</button>
          </div>
        </div>
      </header>
      <main className="container page">
        {!allStores ? <p className="muted">Loading…</p>
          : noAccess ? <p className="note bad">This email is not linked to an active store. Ask the admin ({ADMIN_EMAIL}).</p>
          : tab === 'new' ? (
            <Builder key={builderKey} email={email} isAdmin={isAdmin} stores={active} openDoc={openDoc}
              onSaved={() => setRefresh((r) => r + 1)} onNew={() => go('new')} />
          ) : tab === 'docs' ? (
            <Documents isAdmin={isAdmin} refreshKey={refresh} onOpen={open} />
          ) : isAdmin ? (
            <Stores stores={allStores} onChanged={loadStores} />
          ) : null}
      </main>
    </>
  )
}
