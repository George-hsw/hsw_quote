import { describe, expect, it } from 'vitest'
import { toSuggestion } from './address'

describe('toSuggestion', () => {
  it('builds the street and the suburb STATE postcode lines', () => {
    const s = toSuggestion({ properties: { housenumber: '1128', street: 'Nepean Highway', district: 'Mornington', city: 'Melbourne', state: 'Victoria', postcode: '3931' } })
    expect(s).toEqual({ street: '1128 Nepean Highway', suburb: 'Mornington VIC 3931', label: '1128 Nepean Highway, Mornington VIC 3931' })
  })

  it('falls back to locality and keeps an unknown state as given', () => {
    const s = toSuggestion({ properties: { street: 'Main Rd', locality: 'Kew', state: 'Elsewhere' } })
    expect(s?.suburb).toBe('Kew Elsewhere')
  })

  it('skips results with no street or place name', () => {
    expect(toSuggestion({ properties: { city: 'Mornington' } })).toBeNull()
  })
})
