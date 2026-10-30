// Pure helpers for the Dynamics sync (no network, so they are unit-tested in sync-lib.test.mjs).
import { createHash } from 'node:crypto'

export const str = (v) => (v === null || v === undefined ? null : String(v).trim() || null)

/** One OData row -> our item shape, using the field names of the published web service. */
export function toItem(row, fields) {
  const price = row[fields.price]
  const num = typeof price === 'number' ? price : typeof price === 'string' && price.trim() !== '' ? Number(price) : NaN
  return {
    code: String(row[fields.code] ?? '').trim(),
    description: str(row[fields.description]) ?? '',
    price: Number.isFinite(num) ? Math.round(num * 100) / 100 : null,
    status: str(row[fields.status]) ?? '',
    division: str(row[fields.division]),
    category: str(row[fields.category]),
    barcode: str(row[fields.barcode]),
  }
}

/** A fingerprint of everything we store, so "did this item change?" is one string comparison. */
export const hashItem = (i) =>
  createHash('sha1')
    .update(JSON.stringify([i.code, i.description, i.price, i.status, i.division, i.category, i.barcode]))
    .digest('hex')

/**
 * Works out the smallest set of writes.
 * existing: Map of code -> { hash, removed } as currently held in Supabase.
 * fullPull: true when `items` is the whole catalogue, so anything missing has been removed in Dynamics.
 */
export function planChanges(items, existing, { fullPull }) {
  const toUpsert = []
  const seen = new Set()
  let unchanged = 0
  for (const item of items) {
    seen.add(item.code)
    const hash = hashItem(item)
    const old = existing.get(item.code)
    if (!old || old.hash !== hash || old.removed) toUpsert.push({ ...item, hash })
    else unchanged++
  }
  const toRemove = fullPull ? [...existing].filter(([code, e]) => !seen.has(code) && !e.removed).map(([code]) => code) : []
  return { toUpsert, unchanged, toRemove }
}

/** A sudden mass removal is far more likely a partial response than a real clear-out. */
export const removalLooksWrong = (removeCount, activeCount) =>
  activeCount > 0 && removeCount > Math.max(50, activeCount * 0.2)

/**
 * full  = fetch everything and reconcile removals.
 * delta = fetch only items modified since the last sync (needs a modified-date field on the web service).
 * auto  = delta when that is possible and a full pass ran within the last 7 days, otherwise full.
 */
export function pickMode({ requested = 'auto', hasModifiedField, lastFullAt, now = new Date() }) {
  if (requested === 'full') return 'full'
  if (!hasModifiedField) return 'full'
  if (requested === 'delta') return 'delta'
  if (!lastFullAt) return 'full'
  return now.getTime() - new Date(lastFullAt).getTime() < 7 * 86_400_000 ? 'delta' : 'full'
}

/** OData $filter for "modified on or after" the given moment (one day of safety margin is added by the caller). */
export function modifiedFilter(field, sinceIso, format = 'date') {
  return format === 'iso' ? `${field} ge ${new Date(sinceIso).toISOString()}` : `${field} ge ${new Date(sinceIso).toISOString().slice(0, 10)}`
}
