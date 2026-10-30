import { useState } from 'react'
import { useToast } from './Toast'
import { supabase } from './lib/supabase'

/** Sign in with the store email and password. "Email me a code" is the backup if the password is forgotten. */
export default function Login() {
  const toast = useToast()
  const [how, setHow] = useState<'password' | 'code'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [busy, setBusy] = useState(false)

  const signInWithPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    setBusy(false)
    if (error) toast.error(error.status === 429 ? 'Too many attempts. Wait a few minutes and try again.' : 'That email or password is not right.')
  }

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('request-code', { body: { email: email.trim() } })
    setBusy(false)
    if (error || data?.ok === false) return toast.error(data?.error ?? 'Could not send the code. Try again shortly.')
    setCodeSent(true)
    toast.info('If that email is registered, a 6-digit code is on its way. It is valid for 10 minutes.')
  }

  const verifyCode = async (e: React.FormEvent) => {
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

  const emailField = (
    <label>Store email
      <input name="email" type="email" autoComplete="username" inputMode="email" required autoFocus value={email}
        onChange={(e) => setEmail(e.target.value)} placeholder="store@hsw.com.au" />
    </label>
  )

  return (
    <div className="loginwrap">
      <div className="hero">
        <img className="logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="Howards Storage World" width="241" height="64" />
      </div>
      <main className="login">
        <h2>{how === 'code' && codeSent ? 'Enter your code' : 'Sign in'}</h2>
        <p className="muted">
          {how === 'password'
            ? 'Use your store email and password.'
            : codeSent ? `We emailed a 6-digit code to ${email.trim()}.` : 'We will email a one-time code to your store email.'}
        </p>

        {how === 'password' ? (
          <form onSubmit={signInWithPassword}>
            {emailField}
            <label>Password
              <input name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button type="submit" className="btn primary wide" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
            <button type="button" className="quiet" onClick={() => { setHow('code'); setCodeSent(false); setCode('') }}>Forgot password? Get a code</button>
          </form>
        ) : !codeSent ? (
          <form onSubmit={sendCode}>
            {emailField}
            <button type="submit" className="btn primary wide" disabled={busy}>{busy ? 'Sending…' : 'Email me a code'}</button>
            <button type="button" className="quiet" onClick={() => setHow('password')}>Back to password sign-in</button>
          </form>
        ) : (
          <form onSubmit={verifyCode}>
            <label>6-digit code
              <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="otp" />
            </label>
            <button type="submit" className="btn primary wide" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Sign in'}</button>
            <button type="button" className="quiet" onClick={() => { setCodeSent(false); setCode('') }}>Use a different email</button>
          </form>
        )}
      </main>
    </div>
  )
}
