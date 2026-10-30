// Sends the 6-digit login code, but only to the admin or an active store's login email.
// Supabase Auth only generates the code (no email is sent by Supabase); this function emails it through Resend,
// so Supabase's own SMTP settings and email templates are not needed.
// Signups are disabled in Supabase Auth, so the auth user for an allowed email is created here on first use.
// The response is always the same so it can't be used to discover which emails are registered.
// Needs secrets: RESEND_API_KEY, MAIL_FROM (e.g. "Howards Quote <quotes@mail.hsw.com.au>")
import { createClient } from 'npm:@supabase/supabase-js@2'
import { ADMIN_EMAIL, cors, json } from '../_shared/cors.ts'

const MAX_PER_WINDOW = 5 // codes per email address ...
const WINDOW_MINUTES = 10 // ... in this many minutes, so nobody can flood a store's inbox

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const { email } = await req.json().catch(() => ({}))
  const e = String(email ?? '').trim().toLowerCase()
  const generic = json({ ok: true })
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return generic

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  let allowed = e === ADMIN_EMAIL
  if (!allowed) {
    const { data } = await admin.from('stores').select('id').eq('active', true).ilike('email', e).limit(1)
    allowed = !!data?.length
  }
  if (!allowed) return generic

  // Per-address limit (silent: the caller sees the same response either way)
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString()
  const { count } = await admin.from('auth_code_requests').select('id', { count: 'exact', head: true })
    .eq('email', e).gte('requested_at', since)
  if ((count ?? 0) >= MAX_PER_WINDOW) return generic
  await admin.from('auth_code_requests').insert({ email: e })

  // Make sure the auth user exists (an "already registered" error is expected and fine), then mint a code.
  await admin.auth.admin.createUser({ email: e, email_confirm: true })
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: e })
  const code = link?.properties?.email_otp
  if (linkError || !code) {
    console.error('generateLink failed', linkError?.message)
    return json({ ok: false, error: 'Could not create a sign-in code. Try again shortly.' }, 500)
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('MAIL_FROM'),
      to: [e],
      subject: 'Your Howards quote sign-in code',
      text: `Your sign-in code is ${code}\n\nIt is valid for 10 minutes. If you did not ask for it, you can ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;color:#262626;max-width:480px">
  <div style="border-bottom:3px solid #0092A9;padding-bottom:8px;font-size:18px">Howards Storage World</div>
  <p>Your sign-in code is:</p>
  <p style="font-size:32px;letter-spacing:6px;font-weight:700;margin:8px 0">${code}</p>
  <p style="color:#6D6E71;font-size:13px">It is valid for 10 minutes. If you did not ask for it, you can ignore this email.</p></div>`,
    }),
  })
  if (!res.ok) {
    console.error('Resend failed', res.status, (await res.text()).slice(0, 300))
    return json({ ok: false, error: 'Could not send the code. Try again shortly.' }, 502)
  }
  return generic
})
