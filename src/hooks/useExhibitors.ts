import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { db, type LocalExhibitor } from '../lib/db'
import { hashPin } from '../lib/pins'

export function useExhibitors() {
  const [exhibitors, setExhibitors] = useState<LocalExhibitor[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadExhibitors() {
      // Load from Dexie first (instant, works offline)
      const local = await db.exhibitors.toArray()
      if (local.length > 0) {
        setExhibitors(local)
        setLoading(false)
      }

      // Fetch from Supabase in background to refresh
      try {
        const { data } = await supabase.from('exhibitors').select('*').order('name')
        if (!data) return

        // Hash PINs before caching locally
        const localExhibitors: LocalExhibitor[] = await Promise.all(
          data.map(async e => ({
            id: e.id,
            name: e.name,
            booth_number: e.booth_number,
            hall: e.hall,
            pin_hash: await hashPin(e.pin),
            is_platinum: e.is_platinum ?? false,
          }))
        )

        await db.exhibitors.bulkPut(localExhibitors)
        setExhibitors(localExhibitors)
      } catch {
        // Offline — Dexie cache is already loaded
      } finally {
        setLoading(false)
      }
    }

    loadExhibitors()
  }, [])

  return { exhibitors, loading }
}
