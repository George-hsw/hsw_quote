import { describe, expect, it } from 'vitest'
import { hashItem, modifiedFilter, pickMode, planChanges, removalLooksWrong, toItem } from './sync-lib.mjs'

const FIELDS = { code: 'No', description: 'Description', price: 'Price', status: 'Status_Code', division: 'Division_Code', category: 'Item_Category_Code', barcode: 'Barcode_No' }
const row = (over = {}) => ({ No: 'ANA0001', Description: ' TOWEL ', Price: 59.95, Status_Code: 'ACTIVE', Division_Code: 'ON_THE_GO', Item_Category_Code: 'OTG', Barcode_No: 8595734100000, ...over })

describe('toItem', () => {
  it('trims, rounds and stringifies', () => {
    expect(toItem(row(), FIELDS)).toEqual({ code: 'ANA0001', description: 'TOWEL', price: 59.95, status: 'ACTIVE', division: 'ON_THE_GO', category: 'OTG', barcode: '8595734100000' })
  })
  it('accepts a price that arrives as text and treats junk as no price', () => {
    expect(toItem(row({ Price: '12.345' }), FIELDS).price).toBe(12.35)
    expect(toItem(row({ Price: '' }), FIELDS).price).toBeNull()
    expect(toItem(row({ Price: 'n/a' }), FIELDS).price).toBeNull()
  })
})

describe('planChanges', () => {
  const a = toItem(row(), FIELDS)
  const b = toItem(row({ No: 'ANA0002' }), FIELDS)
  const existing = new Map([
    ['ANA0001', { hash: hashItem(a), removed: false }],
    ['OLD1', { hash: 'x', removed: false }],
    ['GONE', { hash: 'y', removed: true }],
  ])

  it('writes only new and changed items, and counts the rest as unchanged', () => {
    const changed = { ...a, price: 64.95 }
    const plan = planChanges([a, b], existing, { fullPull: true })
    expect(plan.toUpsert.map((i) => i.code)).toEqual(['ANA0002']) // new; ANA0001 is identical
    expect(plan.unchanged).toBe(1)
    expect(planChanges([changed], existing, { fullPull: false }).toUpsert[0].price).toBe(64.95)
  })

  it('nothing to write when nothing changed', () => {
    const plan = planChanges([a], new Map([['ANA0001', { hash: hashItem(a), removed: false }]]), { fullPull: true })
    expect(plan.toUpsert).toEqual([])
    expect(plan.toRemove).toEqual([])
  })

  it('marks items missing from a full pull as removed, but never on a delta pull', () => {
    expect(planChanges([a], existing, { fullPull: true }).toRemove).toEqual(['OLD1']) // GONE is already removed
    expect(planChanges([a], existing, { fullPull: false }).toRemove).toEqual([])
  })

  it('brings back an item that was removed and has returned', () => {
    const plan = planChanges([toItem(row({ No: 'GONE' }), FIELDS)], existing, { fullPull: false })
    expect(plan.toUpsert.map((i) => i.code)).toEqual(['GONE'])
  })
})

describe('guards and modes', () => {
  it('flags a mass removal as suspicious', () => {
    expect(removalLooksWrong(10, 9000)).toBe(false)
    expect(removalLooksWrong(3000, 9000)).toBe(true)
    expect(removalLooksWrong(40, 100)).toBe(false) // small catalogues: under the 50 floor
  })

  it('auto uses delta only with a modified field and a recent full pass', () => {
    const now = new Date('2026-11-10T00:00:00Z')
    expect(pickMode({ requested: 'auto', hasModifiedField: false, lastFullAt: '2026-11-09T00:00:00Z', now })).toBe('full')
    expect(pickMode({ requested: 'auto', hasModifiedField: true, lastFullAt: null, now })).toBe('full')
    expect(pickMode({ requested: 'auto', hasModifiedField: true, lastFullAt: '2026-11-08T00:00:00Z', now })).toBe('delta')
    expect(pickMode({ requested: 'auto', hasModifiedField: true, lastFullAt: '2026-10-20T00:00:00Z', now })).toBe('full') // a week has passed
    expect(pickMode({ requested: 'full', hasModifiedField: true, lastFullAt: '2026-11-09T00:00:00Z', now })).toBe('full')
  })

  it('builds the modified-since filter', () => {
    expect(modifiedFilter('Last_Date_Modified', '2026-11-09T13:00:00Z')).toBe('Last_Date_Modified ge 2026-11-09')
    expect(modifiedFilter('lastModifiedDateTime', '2026-11-09T13:00:00Z', 'iso')).toBe('lastModifiedDateTime ge 2026-11-09T13:00:00.000Z')
  })
})
