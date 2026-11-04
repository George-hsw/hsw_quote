// Who is calling, and what may they touch? The same rules as the database (migration 010), for the functions
// that use the service role and so bypass Row Level Security.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { ADMIN_EMAIL } from './cors.ts'

export type Role = 'admin' | 'manager' | 'staff' | 'store'
export interface Access { role: Role; storeId: string | null }

/** null = this person may not use the app (unknown, inactive, or their store is inactive). */
export async function accessOf(admin: SupabaseClient, userId: string | undefined, email: string): Promise<Access | null> {
  if (email === ADMIN_EMAIL) return { role: 'admin', storeId: null }
  if (userId) {
    const { data: person } = await admin.from('app_users').select('role,store_id,active,stores(active)').eq('user_id', userId).maybeSingle()
    if (person) {
      const storeActive = (person.stores as { active: boolean } | null)?.active
      return person.active && storeActive ? { role: person.role as Role, storeId: person.store_id } : null
    }
  }
  const { data: stores } = await admin.from('stores').select('id,email').eq('active', true)
  const shared = (stores ?? []).find((s) => String(s.email ?? '').toLowerCase() === email)
  return shared ? { role: 'store', storeId: shared.id } : null
}

/** Admin: any document. Manager and shared store login: any document in their store. Staff: only their own. */
export function canActOnDoc(a: Access | null, doc: { store_id: string; created_by: string | null }, email: string): boolean {
  if (!a) return false
  if (a.role === 'admin') return true
  if (a.storeId !== doc.store_id) return false
  return a.role !== 'staff' || String(doc.created_by ?? '').toLowerCase() === email
}
