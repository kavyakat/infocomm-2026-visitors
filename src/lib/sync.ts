import { db } from './db'
import { supabase } from './supabase'

let flushing = false

export async function flushVisitQueue(): Promise<void> {
  if (flushing) return
  flushing = true

  try {
    const pending = await db.visits.filter(v => !v.synced).toArray()
    if (pending.length === 0) return

    for (const visit of pending) {
      const { error } = await supabase.from('visits').insert({
        id: visit.id,
        visitor_id: visit.visitor_id,
        exhibitor_id: visit.exhibitor_id,
        visited_at: visit.visited_at,
        day: visit.day,
        rating: visit.rating,
      })

      if (!error || error.code === '23505') {
        // 23505 = unique constraint violation = already synced; safe to mark done
        await db.visits.update(visit.id, { synced: true })
      }
    }
  } finally {
    flushing = false
  }
}
