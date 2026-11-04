// Admin only. Creates and manages the people who sign in: managers and staff, each tied to one store.
//   create          { email, full_name, role: 'manager'|'staff', store_id, password? }
//   update          { user_id, full_name?, role?, store_id?, active? }
//   reset_password  { user_id, password? }
// With no password in the request a strong random one is generated and returned ONCE, to hand to the person.
// Supabase Auth hashes and stores it; this function never keeps or logs it.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { ADMIN_EMAIL, cors, json } from '../_shared/cors.ts'
import { checkPassword, generatePassword } from '../_shared/password.ts'

const EMAIL = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/
const ROLES = new Set(['manager', 'staff'])
const BAN_FOREVER = '876000h' // about 100 years; 'none' lifts it

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    })

    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer /i, '')
    const { data: u } = await admin.auth.getUser(token)
    const callerEmail = u.user?.email?.toLowerCase()
    if (!callerEmail) return json({ error: 'Not signed in' }, 401)
    if (callerEmail !== ADMIN_EMAIL) return json({ error: 'Only the admin can manage users' }, 403)

    const b = await req.json()

    const chosenPassword = (): { password: string; generated: boolean } | { error: string } => {
      if (typeof b.password === 'string' && b.password !== '') {
        const problem = checkPassword(b.password)
        return problem ? { error: problem } : { password: b.password, generated: false }
      }
      return { password: generatePassword(), generated: true }
    }

    if (b.action === 'create') {
      const email = String(b.email ?? '').trim().toLowerCase()
      const fullName = String(b.full_name ?? '').trim().slice(0, 80)
      if (!EMAIL.test(email)) return json({ error: 'Enter a valid email address.' }, 400)
      if (!fullName) return json({ error: 'Enter the person’s name.' }, 400)
      if (!ROLES.has(b.role)) return json({ error: 'Choose a role: manager or staff.' }, 400)
      if (email === ADMIN_EMAIL) return json({ error: 'That is the admin address.' }, 400)

      const { data: store } = await admin.from('stores').select('id,name,active').eq('id', b.store_id).maybeSingle()
      if (!store?.active) return json({ error: 'Choose an active store.' }, 400)
      // A shared store login and a person must never share an address, or the two would be confused.
      const { data: stores } = await admin.from('stores').select('email')
      if ((stores ?? []).some((s) => String(s.email ?? '').toLowerCase() === email))
        return json({ error: 'That address is already a store login. Use a personal email for a person.' }, 400)
      const { data: dup } = await admin.from('app_users').select('user_id').ilike('email', email).maybeSingle()
      if (dup) return json({ error: 'That person already has a login.' }, 409)

      const pw = chosenPassword()
      if ('error' in pw) return json({ error: pw.error }, 400)

      let userId: string | undefined
      const created = await admin.auth.admin.createUser({ email, password: pw.password, email_confirm: true })
      if (created.error) {
        if (!/already|registered|exists/i.test(created.error.message)) throw created.error
        // An auth user already exists for this address (for example an earlier sign-in): reuse it.
        const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
        userId = link?.user?.id
        if (linkError || !userId) throw linkError ?? new Error('Could not find the existing user')
        const { error: updateError } = await admin.auth.admin.updateUserById(userId, { password: pw.password, email_confirm: true, ban_duration: 'none' })
        if (updateError) throw updateError
      } else userId = created.data.user.id

      const { error } = await admin.from('app_users').insert({
        user_id: userId, email, full_name: fullName, role: b.role, store_id: store.id, active: true,
        password_set_at: new Date().toISOString(),
      })
      if (error) throw error
      return json({ ok: true, generated: pw.generated, password: pw.generated ? pw.password : undefined })
    }

    if (b.action === 'update') {
      const { data: person } = await admin.from('app_users').select('user_id').eq('user_id', b.user_id).maybeSingle()
      if (!person) return json({ error: 'User not found' }, 404)
      const patch: Record<string, unknown> = {}
      if (typeof b.full_name === 'string') {
        if (!b.full_name.trim()) return json({ error: 'Enter the person’s name.' }, 400)
        patch.full_name = b.full_name.trim().slice(0, 80)
      }
      if (b.role !== undefined) {
        if (!ROLES.has(b.role)) return json({ error: 'Choose a role: manager or staff.' }, 400)
        patch.role = b.role
      }
      if (b.store_id !== undefined) {
        const { data: store } = await admin.from('stores').select('id,active').eq('id', b.store_id).maybeSingle()
        if (!store?.active) return json({ error: 'Choose an active store.' }, 400)
        patch.store_id = store.id
      }
      if (typeof b.active === 'boolean') {
        patch.active = b.active
        // Also block sign-in itself, so a deactivated person cannot even start a new session.
        const { error } = await admin.auth.admin.updateUserById(b.user_id, { ban_duration: b.active ? 'none' : BAN_FOREVER })
        if (error) throw error
      }
      if (Object.keys(patch).length) {
        const { error } = await admin.from('app_users').update(patch).eq('user_id', b.user_id)
        if (error) throw error
      }
      return json({ ok: true })
    }

    if (b.action === 'reset_password') {
      const { data: person } = await admin.from('app_users').select('user_id,full_name').eq('user_id', b.user_id).maybeSingle()
      if (!person) return json({ error: 'User not found' }, 404)
      const pw = chosenPassword()
      if ('error' in pw) return json({ error: pw.error }, 400)
      const { error } = await admin.auth.admin.updateUserById(person.user_id, { password: pw.password })
      if (error) throw error
      await admin.from('app_users').update({ password_set_at: new Date().toISOString() }).eq('user_id', person.user_id)
      return json({ ok: true, generated: pw.generated, password: pw.generated ? pw.password : undefined })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    console.error('manage-user failed', e instanceof Error ? e.message : e)
    return json({ error: 'Could not complete that. Try again.' }, 500)
  }
})
