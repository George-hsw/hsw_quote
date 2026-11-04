// Address suggestions from Photon (komoot.io), a free search service built on OpenStreetMap. No account or key.
// Only what is typed in the address box is sent, and only once it is long enough to be worth searching.

export interface Suggestion {
  street: string // "12 Smith St" or the place name
  suburb: string // "Mornington VIC 3931", the format the quote and PDF already use
  label: string // the full line shown in the list
}

const STATES: Record<string, string> = {
  'new south wales': 'NSW', victoria: 'VIC', queensland: 'QLD', 'south australia': 'SA',
  'western australia': 'WA', tasmania: 'TAS', 'northern territory': 'NT', 'australian capital territory': 'ACT',
}

interface Feature { properties: Record<string, string | undefined> }

/** Turns one Photon result into the two lines the quote uses. Returns null for results with no street or place. */
export function toSuggestion(f: Feature): Suggestion | null {
  const p = f.properties
  const road = p.street ? [p.housenumber, p.street].filter(Boolean).join(' ') : (p.name ?? '')
  if (!road) return null
  const place = p.district ?? p.locality ?? p.city ?? ''
  const state = p.state ? (STATES[p.state.toLowerCase()] ?? p.state) : ''
  const suburb = [place, state, p.postcode].filter(Boolean).join(' ')
  return { street: road, suburb, label: [road, suburb].filter(Boolean).join(', ') }
}

/** Up to five Australian address suggestions for what has been typed so far. */
export async function searchAddress(text: string, signal?: AbortSignal): Promise<Suggestion[]> {
  const q = text.trim()
  if (q.length < 4) return []
  // bbox is Australia, so overseas matches are left out
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=en&bbox=112,-44,154,-9`
  const res = await fetch(url, { signal })
  if (!res.ok) return []
  const body = (await res.json()) as { features?: Feature[] }
  const seen = new Set<string>()
  const out: Suggestion[] = []
  for (const f of body.features ?? []) {
    const s = toSuggestion(f)
    if (!s || seen.has(s.label)) continue
    seen.add(s.label)
    out.push(s)
  }
  return out.slice(0, 5)
}
