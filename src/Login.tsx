import { useState } from 'react'
import { useToast } from './Toast'
import { supabase } from './lib/supabase'

/** Two steps: enter the store email, then the 6-digit code that is emailed to it. */
export default function Login() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('request-code', { body: { email: email.trim() } })
    setBusy(false)
    if (error || data?.ok === false) return toast.error(data?.error ?? 'Could not send the code. Try again shortly.')
    setStep('code')
    toast.info('If that email is registered, a 6-digit code is on its way. It is valid for 10 minutes.')
  }

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    const who = { email: email.trim().toLowerCase(), token: code.trim() }
    // The code is minted as a magic-link token; Supabase accepts it as 'email', with 'magiclink' as the fallback.
    let { error } = await supabase.auth.verifyOtp({ ...who, type: 'email' })
    if (error) ({ error } = await supabase.auth.verifyOtp({ ...who, type: 'magiclink' }))
    setBusy(false)
    if (error) toast.error('That code is wrong or has expired.')
  }

  return (
    <div className="loginwrap">
      <div className="hero">
        <img className="logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="Howards Storage World" width="241" height="64" />
      </div>
      <main className="login">
        <h2>{step === 'email' ? 'Sign in' : 'Enter your code'}</h2>
        <p className="muted">
          {step === 'email' ? 'Use your store email. We will send you a one-time code.' : `We emailed a 6-digit code to ${email.trim()}.`}
        </p>
        {step === 'email' ? (
          <form onSubmit={sendCode}>
            <label>Store email
              <input name="email" type="email" autoComplete="email" inputMode="email" required autoFocus value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="store@hsw.com.au" />
            </label>
            <button type="submit" className="btn primary wide" disabled={busy}>{busy ? 'Sending…' : 'Email me a code'}</button>
          </form>
        ) : (
          <form onSubmit={verify}>
            <label>6-digit code
              <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="otp" />
            </label>
            <button type="submit" className="btn primary wide" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Sign in'}</button>
            <button type="button" className="quiet" onClick={() => { setStep('email'); setCode('') }}>Use a different email</button>
          </form>
        )}
      </main>
    </div>
  )
}
