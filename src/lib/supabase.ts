import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** null when the build has no Supabase settings (the app then shows a setup message). */
export const supabase = url && key ? createClient(url, key) : null

/** `npm run demo`: no login, sample data, nothing is saved. For looking at the UI locally. */
export const DEMO = import.meta.env.VITE_DEMO === '1'

// UI hint only. The real check is Row Level Security in the database.
export const ADMIN_EMAIL = 'george.mridun@hsw.com.au'
export const MAX_STORES = 25

export interface StoreRow {
  id: string
  name: string
  code: string
  address: string
  suburb: string
  phone: string
  email: string | null
  owner_email: string | null
  legal_name: string
  abn: string
  bank_name: string
  bsb: string
  account: string
  active: boolean
}

export interface PaymentRow {
  amount_cents: number
  kind: 'payment' | 'deposit'
  paid_on: string
}

export interface DocRow {
  id: string
  store_id: string
  doc_type: 'Quote' | 'Tax Invoice'
  doc_number: string
  customer_name: string
  total_cents: number
  due_date: string | null
  status: 'open' | 'part_paid' | 'paid' | 'void'
  created_at: string
  payload: unknown
  stores: { name: string } | null
  payments: PaymentRow[]
}

import storesJson from '../data/stores.json'
export const demoStores = (): StoreRow[] =>
  storesJson.map((s, i) => ({
    id: 'demo-' + i, ...s, email: i < 3 ? s.code.toLowerCase() + '@hsw.com.au' : null,
    owner_email: i < 3 ? 'owner.' + s.code.toLowerCase() + '@example.com' : null,
    legal_name: i < 3 ? 'Demo Pty Ltd t/a Howards Storage World' : '', abn: i < 3 ? '12 345 678 901' : '',
    bank_name: '', bsb: '', account: '', active: true,
  }))
const dayAgo = (n: number) => new Date(Date.now() - n * 864e5)
export const demoDocs = (): DocRow[] => [
  { id: 'd1', store_id: 'demo-0', doc_type: 'Tax Invoice', doc_number: 'INV-MPK-1001', customer_name: 'Jo Smith', total_cents: 247187,
    due_date: isoDate(dayAgo(-4)), status: 'part_paid', created_at: dayAgo(3).toISOString(), payload: {}, stores: { name: 'Moore Park' },
    payments: [{ amount_cents: 50000, kind: 'deposit', paid_on: isoDate(dayAgo(3)) }] },
  { id: 'd2', store_id: 'demo-1', doc_type: 'Tax Invoice', doc_number: 'INV-NTB-2040', customer_name: 'A. Nguyen', total_cents: 89900,
    due_date: isoDate(dayAgo(2)), status: 'open', created_at: dayAgo(9).toISOString(), payload: {}, stores: { name: 'Northbridge' }, payments: [] },
  { id: 'd3', store_id: 'demo-0', doc_type: 'Quote', doc_number: 'Q-MPK-1002', customer_name: 'Pat Lee', total_cents: 129500,
    due_date: null, status: 'open', created_at: dayAgo(1).toISOString(), payload: {}, stores: { name: 'Moore Park' }, payments: [] },
]

/** yyyy-mm-dd in local time (what <input type=date> and Postgres `date` use). */
export const isoDate = (d: Date) => d.toLocaleDateString('en-CA')
