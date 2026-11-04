import { useEffect, useState } from 'react'

interface Prepared { fileName: string; blob: Blob }

interface Props {
  docLabel: string // "Quote Q-MOR-1001"
  customerName: string
  customerEmail: string
  storeEmail: string | null
  subject: string
  body: string
  /** True when the current PDF was just downloaded, so opening the mail app need not download it again. */
  alreadyDownloaded: boolean
  /** Saves the document and builds the PDF. Resolves null (after telling the user why) when it cannot. */
  prepare: () => Promise<Prepared | null>
  onDownloaded: () => void
  onClose: () => void
  /** Sends from the app itself (through the send-document function). Resolves true when it went out. */
  onSend: (to: 'customer' | 'store', toEmail: string, message: string) => Promise<boolean>
}

const EMAIL = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/

export default function EmailDialog({
  docLabel, customerName, customerEmail, storeEmail, subject, body, alreadyDownloaded, prepare, onDownloaded, onClose, onSend,
}: Props) {
  const [mode, setMode] = useState<'mine' | 'app'>('mine')
  const [prepared, setPrepared] = useState<Prepared | null>(null)
  const [to, setTo] = useState(customerEmail)
  const [subj, setSubj] = useState(subject)
  const [text, setText] = useState(body)
  const [appTo, setAppTo] = useState<'customer' | 'store'>('customer')
  const [appMessage, setAppMessage] = useState('')
  const [busy, setBusy] = useState(false)

  // Save the document and build the PDF as soon as the dialog opens, so the buttons below are instant clicks.
  useEffect(() => {
    let live = true
    prepare().then((r) => { if (!live) return; if (r) setPrepared(r); else onClose() })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const toOk = EMAIL.test(to.trim())
  const ready = !!prepared && toOk

  const mailtoHref = `mailto:${to.trim()}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(text.replace(/\n/g, '\r\n'))}`

  const downloadPdf = () => {
    if (!prepared) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(prepared.blob)
    a.download = prepared.fileName
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    onDownloaded()
  }
  // The compose links open in the same click that downloads the PDF, so the file is ready to attach.
  const launch = (e: React.MouseEvent) => {
    if (!ready) { e.preventDefault(); return }
    if (!alreadyDownloaded) downloadPdf()
  }
  const appValid = appTo === 'customer' ? EMAIL.test(to.trim()) : !!storeEmail
  const sendFromApp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!appValid) return
    setBusy(true)
    const sent = await onSend(appTo, to.trim(), appMessage.trim())
    setBusy(false)
    if (sent) onClose()
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="email-title">
      <div className="modalbox wide">
        <button type="button" className="modal-x" aria-label="Close" onClick={onClose} disabled={busy}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
        <h2 id="email-title">Email {docLabel}</h2>
        <div className="segmented" role="group" aria-label="How to send">
          <button type="button" aria-pressed={mode === 'mine'} onClick={() => setMode('mine')}>From my email</button>
          <button type="button" aria-pressed={mode === 'app'} onClick={() => setMode('app')}>From the app</button>
        </div>

        {mode === 'mine' ? (
          <div style={{ marginTop: 'var(--space-md)' }}>
            <div className="grid one">
              <label>To <small>{customerName}</small>
                <input name="to" type="email" inputMode="email" autoComplete="off" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
              <label>Subject
                <input name="subject" value={subj} onChange={(e) => setSubj(e.target.value)} />
              </label>
              <label>Message
                <textarea name="body" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
              </label>
            </div>
            <p className="muted" style={{ marginTop: 'var(--space-sm)' }}>
              {!prepared
                ? 'Saving the document and preparing the PDF…'
                : alreadyDownloaded
                  ? `The PDF is downloaded as ${prepared.fileName}. Attach it to the email.`
                  : `Opening the email, in Outlook or your mail app, also downloads the PDF as ${prepared.fileName}. Attach it to the email.`}
            </p>
            {!toOk && to.trim() !== '' && <p className="bad">That email address is not valid.</p>}
            <div className="actions" style={{ marginTop: 'var(--space-md)' }}>
              <a className={'btn primary' + (ready ? '' : ' blocked')} href={mailtoHref} aria-disabled={!ready} onClick={launch}>Open in email</a>
              <button type="button" className="btn" onClick={downloadPdf} disabled={!prepared}>Download PDF</button>
            </div>
          </div>
        ) : (
          <form onSubmit={sendFromApp} style={{ marginTop: 'var(--space-md)' }}>
            <div className="segmented" role="group" aria-label="Send to">
              <button type="button" aria-pressed={appTo === 'customer'} onClick={() => setAppTo('customer')}>To the customer</button>
              <button type="button" aria-pressed={appTo === 'store'} onClick={() => setAppTo('store')}>To the store only</button>
            </div>
            <div className="grid one" style={{ marginTop: 'var(--space-md)' }}>
              {appTo === 'customer' ? (
                <label>Customer email <small>{customerName}</small>
                  <input name="appTo" type="email" inputMode="email" autoComplete="off" value={to} onChange={(e) => setTo(e.target.value)} />
                </label>
              ) : (
                <label>Store email<input name="appTo" readOnly value={storeEmail ?? 'No store email set'} /></label>
              )}
              <label>Message <small>optional, added to the email</small>
                <textarea name="appMessage" rows={3} value={appMessage} onChange={(e) => setAppMessage(e.target.value)} />
              </label>
            </div>
            <p className="muted">
              {appTo === 'customer'
                ? `The PDF is attached. A copy goes to ${storeEmail ?? 'the store'} and replies come back to the store.`
                : 'The PDF is sent to the store only, and the store can forward it from its own mailbox.'}
            </p>
            {appTo === 'store' && !storeEmail && <p className="bad">This store has no email set. Ask the admin to add it.</p>}
            <div className="actions" style={{ marginTop: 'var(--space-md)' }}>
              <button type="submit" className="btn primary" disabled={!appValid || busy}>{busy ? 'Sending…' : 'Send from the app'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
