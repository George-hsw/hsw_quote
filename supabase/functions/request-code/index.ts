// Sends the 6-digit login code, but only to the admin or an active store's login email.
// Signups are disabled in Supabase Auth, so this function creates the auth user for an allowed
// email on first use. The response is always the same so it can't be used to discover emails.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { ADMIN_EMAIL, cors, json } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const { email } = await req.json().catch(() => ({}))
  const e = String(email ?? '').trim().toLowerCase()
  const generic = json({ ok: true })
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return generic

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  let allowed = e === ADMIN_EMAIL
  if (!allowed) {
    const { data } = await admin.from('stores').select('id').eq('active', true).ilike('email', e).limit(1)
    allowed = !!data?.length
  }
  if (!allowed) return generic

  // Create the user if needed (an "already registered" error is expected and fine).
  await admin.auth.admin.createUser({ email: e, email_confirm: true })
  const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } })
  const { error } = await anon.auth.signInWithOtp({ email: e, options: { shouldCreateUser: false } })
  if (error) {
    console.error('signInWithOtp failed', error.message)
    return json({ ok: false, error: 'Could not send the code. Try again shortly.' }, 429)
  }
  return generic
})
