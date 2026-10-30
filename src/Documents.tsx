import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from './Toast'
import { dateAU, money, parseDate } from './lib/quote'
import { DEMO, demoDocs, isoDate, supabase, type DocRow } from './lib/supabase'

interface Props {
  isAdmin: boolean
  refreshKey: number
  onOpen: (d: DocRow) => void
}

const paidOf = (d: DocRow) => d.payments.reduce((a, p) => a + p.amount_cents, 0)
const STATUS: Record<DocRow['status'], string> = { open: 'Open', part_paid: 'Part paid', paid: 'Paid', void: 'Void' }
const TYPES: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'Quote', label: 'Quotes' },
  { value: 'Tax Invoice', label: 'Invoices' },
]

export default function Documents({ isAdmin, refreshKey, onOpen }: Props) {
  const toast = useToast()
  const [docs, setDocs] = useState<DocRow[] | null>(null)
  const [failed, setFailed] = useState('')
  const [filter, setFilter] = useState('')
  const [type, setType] = useState('')
  const [storeFilter, setStoreFilter] = useState('')
  const [paying, setPaying] = useState<DocRow | null>(null)

  const load = useCallback(async () => {
    setFailed('')
    if (DEMO) return setDocs(demoDocs())
    if (!supabase) return
    const { data, error } = await supabase
      .from('documents')
      .select('id,store_id,doc_type,doc_number,customer_name,total_cents,due_date,status,created_at,payload,stores(name),payments(amount_cents,kind,paid_on)')
      .order('created_at', { ascending: false })
      .limit(300)
    if (error) {
      setFailed(error.message)
      toast.error(error.message)
    } else setDocs(data as unknown as DocRow[])
  }, [toast])
  useEffect(() => { load() }, [load, refreshKey])

  const shown = useMemo(() => {
    const t = filter.trim().toLowerCase()
    return (docs ?? []).filter(
      (d) => (!type || d.doc_type === type) && (!storeFilter || d.stores?.name === storeFilter) &&
        (!t || `${d.doc_number} ${d.customer_name} ${d.stores?.name ?? ''}`.toLowerCase().includes(t)),
    )
  }, [docs, filter, type, storeFilter])
  const storeNames = useMemo(() => [...new Set((docs ?? []).map((d) => d.stores?.name).filter((n): n is string => !!n))].sort(), [docs])

  const today = isoDate(new Date())

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Documents</h1>
          {docs && <p className="muted">{docs.length} saved {docs.length === 1 ? 'document' : 'documents'}</p>}
        </div>
      </div>
      <div className="filters">
        <input type="search" name="search" aria-label="Search documents" placeholder="Search number, customer or store…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        {isAdmin && (
          <select name="storeFilter" aria-label="Filter by store" value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)} style={{ width: 'auto' }}>
            <option value="">All stores</option>
            {storeNames.map((n) => <option key={n}>{n}</option>)}
          </select>
        )}
        <div className="segmented" role="group" aria-label="Document type">
          {TYPES.map((t) => (
            <button key={t.value} type="button" aria-pressed={type === t.value} onClick={() => setType(t.value)}>{t.label}</button>
          ))}
        </div>
      </div>

      {failed ? (
        <div className="state error" role="alert">
          <p>Documents could not be loaded.</p>
          <p className="muted">{failed}</p>
          <div className="actions"><button type="button" className="btn" onClick={load}>Try again</button></div>
        </div>
      ) : !docs ? (
        <div className="skeleton" aria-busy="true" aria-label="Loading documents"><i /><i /><i /><i /></div>
      ) : shown.length === 0 ? (
        <div className="state">
          <p>{docs.length === 0 ? 'No documents yet' : 'Nothing matches that search'}</p>
          <p className="muted">{docs.length === 0 ? 'Quotes and invoices you save appear here. Start one from the New tab.' : 'Try a different number, customer or type.'}</p>
        </div>
      ) : (
        <div className="tablewrap">
          <table className="book">
            <thead>
              <tr><th>Number</th>{isAdmin && <th>Store</th>}<th>Customer</th><th className="r">Total</th><th className="r">Paid</th><th className="r">Balance</th><th>Due</th><th>Status</th><th><span className="visually-hidden">Actions</span></th></tr>
            </thead>
            <tbody>
              {shown.map((d) => {
                const paid = paidOf(d)
                const bal = d.total_cents - paid
                const inv = d.doc_type === 'Tax Invoice'
                const overdue = inv && bal > 0 && d.due_date && d.due_date < today
                return (
                  <tr key={d.id}>
                    <td data-label="Number"><b className="num">{d.doc_number}</b><br /><small>{dateAU(new Date(d.created_at))}</small></td>
                    {isAdmin && <td data-label="Store">{d.stores?.name}</td>}
                    <td data-label="Customer">{d.customer_name}</td>
                    <td data-label="Total" className="r">{money(d.total_cents)}</td>
                    <td data-label="Paid" className="r">{inv ? money(paid) : '–'}</td>
                    <td data-label="Balance" className="r">{inv ? money(bal) : '–'}</td>
                    <td data-label="Due">{inv && d.due_date ? dateAU(parseDate(d.due_date)!) : '–'}</td>
                    <td data-label="Status">{inv ? <span className={'chip ' + (overdue ? 'overdue' : d.status)}>{overdue ? 'Overdue' : STATUS[d.status]}</span> : <span className="chip quote">Quote</span>}</td>
                    <td className="rowactions">
                      <button type="button" className="btn" onClick={() => onOpen(d)}>{inv && paid > 0 ? 'View' : 'Open'}</button>
                      {inv && bal > 0 && d.status !== 'void' && <button type="button" className="btn primary" onClick={() => setPaying(d)}>Record payment</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {paying && <PaymentDialog doc={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); load() }} />}
    </>
  )
}

function PaymentDialog({ doc, onClose, onDone }: { doc: DocRow; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const balance = doc.total_cents - paidOf(doc)
  const [kind, setKind] = useState<'deposit' | 'payment'>(paidOf(doc) === 0 ? 'deposit' : 'payment')
  const [amount, setAmount] = useState((balance / 100).toFixed(2))
  const [paidOn, setPaidOn] = useState(isoDate(new Date()))
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ balance_cents: number; emailed_to: string | null; warning: string } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const amt = Math.round(Number(amount.replace(/[$,]/g, '')) * 100)
  const valid = Number.isFinite(amt) && amt > 0 && amt <= balance

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (DEMO) return setResult({ balance_cents: balance - amt, emailed_to: 'owner@example.com (demo, not sent)', warning: '' })
    if (!supabase || !valid) return
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('record-payment', {
      body: { document_id: doc.id, kind, amount: amt / 100, paid_on: paidOn, reference },
    })
    setBusy(false)
    if (error || data?.error) {
      let msg = data?.error as string | undefined
      if (!msg && error && 'context' in error) msg = (await (error as { context: Response }).context.json().catch(() => null))?.error
      return toast.error(msg ?? 'Could not record the payment.')
    }
    setResult(data)
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pay-title">
      <div className="modalbox">
        <h2 id="pay-title">Record payment for {doc.doc_number}</h2>
        {result ? (
          <>
            <p className="note">Recorded. Balance due is now {money(result.balance_cents)}.</p>
            {result.emailed_to && <p>Notification emailed to <b>{result.emailed_to}</b>.</p>}
            {result.warning && <p className="note bad">{result.warning}</p>}
            <div className="actions"><button type="button" className="btn primary" autoFocus onClick={onDone}>Done</button></div>
          </>
        ) : (
          <form onSubmit={submit}>
            <p className="muted">{doc.customer_name}. Total {money(doc.total_cents)}, balance due {money(balance)}.</p>
            <div className="grid one">
              <label>Type
                <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as 'deposit' | 'payment')}>
                  <option value="deposit">Deposit received</option>
                  <option value="payment">Payment received</option>
                </select>
              </label>
              <label>Amount received (AUD)<input name="amount" inputMode="decimal" autoComplete="off" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
              <label>Date received<input name="paidOn" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></label>
              <label>Reference <small>optional, e.g. POS receipt no.</small><input name="reference" autoComplete="off" value={reference} onChange={(e) => setReference(e.target.value)} /></label>
            </div>
            <p className="muted">Confirm the money has been taken through the store POS. The franchise owner will be emailed the amount, the balance still due and the due date.</p>
            {!valid && amount !== '' && <p className="bad">Enter an amount between $0.01 and {money(balance)}.</p>}
            <div className="actions">
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn primary" disabled={!valid || busy}>{busy ? 'Recording…' : 'Record & notify owner'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
