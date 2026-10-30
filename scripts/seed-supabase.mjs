// One-off: load the initial price list (public/items.json from the workbook) into Supabase,
// so the app has data before the first Dynamics sync. Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-supabase.mjs
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { items } = JSON.parse(readFileSync('public/items.json', 'utf8'))
const rows = items.map(([code, description, price, status, barcode]) => ({ code, description, price, status, barcode: barcode || null }))
for (let i = 0; i < rows.length; i += 1000) {
  const { error } = await sb.from('items').upsert(rows.slice(i, i + 1000), { onConflict: 'code' })
  if (error) throw error
  console.log(`seeded ${Math.min(i + 1000, rows.length)}/${rows.length}`)
}
