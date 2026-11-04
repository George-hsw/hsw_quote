import { useEffect, useRef } from 'react'
import { DEMO, supabase } from './supabase'

// Scan on a phone, add to the quote open on the computer. See migration 014_scans.sql.
const SOURCE = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Math.random()) // this browser, so it ignores its own scans
const FRESH_MS = 12 * 3600 * 1000 // a scan older than this is stale and is thrown away

/** The phone side: hand a barcode to the person's other devices. */
export async function sendScan(code: string): Promise<boolean> {
  if (DEMO || !supabase) return false
  const { data } = await supabase.auth.getUser()
  if (!data.user) return false
  const { error } = await supabase.from('scans').insert({ user_id: data.user.id, code: code.slice(0, 80), source: SOURCE })
  return !error
}

/**
 * The computer side. While `enabled`, scans sent from another device arrive in `onCode`, live, and also any that
 * were waiting when this page opened or came back into view. Each scan is claimed by deleting its row, so two open
 * tabs never both add it.
 */
export function useScanInbox(enabled: boolean, onCode: (code: string) => void) {
  const cb = useRef(onCode)
  cb.current = onCode

  useEffect(() => {
    if (!enabled || DEMO || !supabase) return
    const sb = supabase
    let stopped = false
    let channel: ReturnType<typeof sb.channel> | undefined

    const claim = async (id: string, code: string) => {
      const { data } = await sb.from('scans').delete().eq('id', id).select('id')
      if (!stopped && data?.length) cb.current(code)
    }
    const drain = async () => {
      const since = new Date(Date.now() - FRESH_MS).toISOString()
      await sb.from('scans').delete().lt('created_at', since)
      const { data } = await sb.from('scans').select('id,code').neq('source', SOURCE).gte('created_at', since).order('created_at')
      for (const r of data ?? []) await claim(r.id as string, r.code as string)
    }

    ;(async () => {
      const { data } = await sb.auth.getUser()
      if (!data.user || stopped) return
      channel = sb.channel(`scans-${data.user.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scans', filter: `user_id=eq.${data.user.id}` }, (p) => {
          const r = p.new as { id: string; code: string; source: string }
          if (r.source !== SOURCE) void claim(r.id, r.code)
        })
        .subscribe()
      void drain()
    })()

    const onVisible = () => { if (document.visibilityState === 'visible') void drain() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', onVisible)
      if (channel) void sb.removeChannel(channel)
    }
  }, [enabled])
}
