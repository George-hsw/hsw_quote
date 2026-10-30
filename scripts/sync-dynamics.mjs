// Scheduler 1: Dynamics NAV / Business Central / LS Central  ->  Supabase `items`, incrementally.
// Runs in GitHub Actions (see .github/workflows/sync-dynamics.yml). Node 20+.
//
// Each run compares what Dynamics returns with what Supabase already holds and writes ONLY the items that are
// new or changed (a fingerprint per item). A night with no price changes writes nothing.
//
// Connection (the published web service that returns the item list as OData JSON):
//   DYN_ODATA_URL        the full URL of the item list service, for example
//                        NAV on a server:  https://nav.example.com:7048/NAV/ODataV4/Company('Name')/ItemList
//                        Business Central: https://api.businesscentral.dynamics.com/v2.0/<tenant>/<env>/ODataV4/Company('Name')/ItemList
//   Sign-in, either:
//     DYN_USER + DYN_ACCESS_KEY            NAV "Web Service Access Key" (HTTP Basic: user name + key)
//     DYN_TENANT_ID + DYN_CLIENT_ID + DYN_CLIENT_SECRET   Business Central online (Entra app, client credentials)
//   Always: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Optional:
//   DYN_FIELD_MAP        JSON mapping our column -> the service's field name (see --discover)
//   DYN_FILTER           extra OData $filter, e.g. "Blocked eq false"
//   DYN_MODIFIED_FIELD   a "last modified" field on the service, e.g. Last_Date_Modified. Enables delta passes.
//   DYN_MODIFIED_FORMAT  date (default) or iso, how that field is written in a filter
//   SYNC_MODE            auto (default), full or delta
//   DYN_SCOPE            OAuth scope, default https://api.businesscentral.dynamics.com/.default
//
// First run on a new setup:  node scripts/sync-dynamics.mjs --discover   prints the real field names.
import { createClient } from '@supabase/supabase-js'
import { modifiedFilter, pickMode, planChanges, removalLooksWrong, toItem } from './sync-lib.mjs'

const env = (k, req = true) => {
  const v = process.env[k]
  if (!v && req) throw new Error(`Missing env ${k}`)
  return v
}

// Our column -> the field name on YOUR web service. Override with DYN_FIELD_MAP after running --discover.
const FIELDS = {
  code: 'No',
  description: 'Description',
  price: 'Price',
  status: 'Status_Code',
  division: 'Division_Code',
  category: 'Item_Category_Code',
  barcode: 'Barcode_No',
  ...JSON.parse(process.env.DYN_FIELD_MAP || '{}'),
}

async function authHeader() {
  if (process.env.DYN_USER && process.env.DYN_ACCESS_KEY) {
    return `Basic ${Buffer.from(`${process.env.DYN_USER}:${process.env.DYN_ACCESS_KEY}`).toString('base64')}`
  }
  const res = await fetch(`https://login.microsoftonline.com/${env('DYN_TENANT_ID')}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env('DYN_CLIENT_ID'),
      client_secret: env('DYN_CLIENT_SECRET'),
      scope: env('DYN_SCOPE', false) || 'https://api.businesscentral.dynamics.com/.default',
    }),
  })
  if (!res.ok) throw new Error(`Token request failed: ${res.status} ${await res.text()}`)
  return `Bearer ${(await res.json()).access_token}`
}

async function get(url, auth) {
  const res = await fetch(url, { headers: { authorization: auth, accept: 'application/json', 'odata.maxpagesize': '5000' } })
  if (res.status === 401 || res.status === 403) {
    throw new Error(`Dynamics refused the sign-in (${res.status}). Check the user and access key, or the Entra app permissions.`)
  }
  if (res.status === 400) {
    throw new Error(`Dynamics rejected the request (400): ${(await res.text()).slice(0, 300)}\nA field name is probably wrong. Run: node scripts/sync-dynamics.mjs --discover`)
  }
  if (!res.ok) throw new Error(`Dynamics request failed: ${res.status} ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

/** Prints the real field names so DYN_FIELD_MAP can be set without guessing. */
async function discover() {
  const url = new URL(env('DYN_ODATA_URL'))
  url.searchParams.set('$top', '3')
  const body = await get(url.toString(), await authHeader())
  const rows = body.value ?? []
  if (!rows.length) return console.log('Connected, but the service returned no rows.')
  console.log('Connected. Fields on the service:\n')
  for (const k of Object.keys(rows[0])) console.log(`  ${k.padEnd(36)} ${JSON.stringify(rows[0][k])}`)
  console.log('\nWhat the app expects, and whether that field exists:')
  for (const [ours, theirs] of Object.entries(FIELDS)) console.log(`  ${ours.padEnd(12)} <- ${theirs.padEnd(24)} ${theirs in rows[0] ? 'found' : 'NOT FOUND, set it in DYN_FIELD_MAP'}`)
  console.log('\nExample: DYN_FIELD_MAP={"price":"Unit_Price","barcode":"Barcodes"}')
}

async function fetchAll(auth, extraFilter) {
  const url = new URL(env('DYN_ODATA_URL'))
  url.searchParams.set('$select', Object.values(FIELDS).join(','))
  const filters = [process.env.DYN_FILTER, extraFilter].filter(Boolean).map((f) => `(${f})`)
  if (filters.length) url.searchParams.set('$filter', filters.join(' and '))
  const rows = []
  let next = url.toString()
  while (next) {
    const body = await get(next, auth)
    rows.push(...body.value)
    next = body['@odata.nextLink'] ?? body['odata.nextLink']
    console.log(`fetched ${rows.length}…`)
  }
  return rows
}

async function loadExisting(sb) {
  const existing = new Map()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('items').select('code,hash,removed').range(from, from + 999)
    if (error) throw error
    for (const r of data) existing.set(r.code, { hash: r.hash, removed: r.removed })
    if (data.length < 1000) break
  }
  return existing
}

async function main() {
  if (process.argv.includes('--discover')) return discover()

  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
  const modifiedField = env('DYN_MODIFIED_FIELD', false)

  // Which kind of pass? Delta only when a modified field exists and a full pass ran this week.
  const { data: lastOk } = await sb.from('sync_log').select('started_at,mode').eq('ok', true).order('started_at', { ascending: false }).limit(20)
  const lastFull = lastOk?.find((r) => r.mode === 'full' || !r.mode)
  const mode = pickMode({ requested: env('SYNC_MODE', false) || 'auto', hasModifiedField: !!modifiedField, lastFullAt: lastFull?.started_at })
  const since = lastOk?.[0] ? new Date(new Date(lastOk[0].started_at).getTime() - 86_400_000).toISOString() : null
  const extraFilter = mode === 'delta' && since ? modifiedFilter(modifiedField, since, env('DYN_MODIFIED_FORMAT', false) || 'date') : null
  console.log(`mode: ${mode}${extraFilter ? ` (${extraFilter})` : ''}`)

  const { data: log } = await sb.from('sync_log').insert({ mode }).select('id').single()
  const finish = (patch) => sb.from('sync_log').update({ finished_at: new Date().toISOString(), ...patch }).eq('id', log?.id)

  try {
    const raw = await fetchAll(await authHeader(), extraFilter)
    const items = raw.map((r) => toItem(r, FIELDS)).filter((i) => i.code)
    const full = mode === 'full'
    // A full pass that returns almost nothing is a broken response, not an empty catalogue.
    if (full && items.length < 100) throw new Error(`Only ${items.length} items returned, refusing to sync`)

    const existing = await loadExisting(sb)
    const plan = planChanges(items, existing, { fullPull: full })
    const activeCount = [...existing.values()].filter((e) => !e.removed).length
    if (removalLooksWrong(plan.toRemove.length, activeCount) && !process.env.FORCE_REMOVE) {
      throw new Error(`${plan.toRemove.length} of ${activeCount} items would be marked removed, which looks like a partial response. Set FORCE_REMOVE=1 if this is real.`)
    }

    const syncedAt = new Date().toISOString()
    for (let i = 0; i < plan.toUpsert.length; i += 1000) {
      const batch = plan.toUpsert.slice(i, i + 1000).map((r) => ({ ...r, synced_at: syncedAt, removed: false }))
      const { error } = await sb.from('items').upsert(batch, { onConflict: 'code' })
      if (error) throw error
    }
    for (let i = 0; i < plan.toRemove.length; i += 500) {
      const { error } = await sb.from('items').update({ removed: true, synced_at: syncedAt }).in('code', plan.toRemove.slice(i, i + 500))
      if (error) throw error
    }

    const summary = `${mode}: ${items.length} fetched, ${plan.toUpsert.length} written, ${plan.unchanged} unchanged, ${plan.toRemove.length} removed`
    await finish({ ok: true, fetched: raw.length, upserted: plan.toUpsert.length, unchanged: plan.unchanged, removed: plan.toRemove.length, message: summary })
    console.log(summary)
    if (plan.toUpsert.length === 0 && plan.toRemove.length === 0) console.log('No changes in Dynamics. Nothing written.')
  } catch (e) {
    await finish({ ok: false, message: String(e.message ?? e).slice(0, 1000) })
    // A rejected field name is the usual first-run problem: show the real names so the fix is one step.
    if (String(e.message).includes('Dynamics rejected')) await discover().catch(() => {})
    throw e
  }
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
