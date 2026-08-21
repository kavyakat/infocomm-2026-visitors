import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

type FeedVisit = {
  id: string
  visitor_id: string
  exhibitor_id: string
  visited_at: string
  day: 1 | 2 | 3
  rating: number | null
  profiles: { name: string }
  exhibitors: { name: string; booth_number: string; hall: string }
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${date}, ${time}`
}

function StarRating({ rating }: { rating: number | null }) {
  if (rating === null) return null
  return (
    <span className="text-yellow-500 text-sm">
      {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
    </span>
  )
}

export default function VisitFeed() {
  const { signOut } = useAuth()
  const [visits, setVisits] = useState<FeedVisit[]>([])
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadVisits() {
      const { data, error } = await supabase
        .from('visits')
        .select('*, profiles(name), exhibitors(name, booth_number, hall)')
        .order('visited_at', { ascending: false })
        .limit(50)
      if (error) { setError(error.message) }
      setVisits((data ?? []) as FeedVisit[])
      setLoading(false)
    }

    loadVisits()

    const channel = supabase
      .channel('visits-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'visits' },
        async (payload) => {
          const row = payload.new as { id: string; visitor_id: string; exhibitor_id: string; visited_at: string; day: 1 | 2 | 3; rating: number | null }

          const [profileRes, exhibitorRes] = await Promise.all([
            supabase.from('profiles').select('name').eq('id', row.visitor_id).single(),
            supabase.from('exhibitors').select('name, booth_number, hall').eq('id', row.exhibitor_id).single(),
          ])

          if (!profileRes.data || !exhibitorRes.data) return

          const enriched: FeedVisit = {
            ...row,
            profiles: profileRes.data,
            exhibitors: exhibitorRes.data,
          }

          setVisits(prev => [enriched, ...prev].slice(0, 50))
        }
      )
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="no-print bg-primary text-white px-6 py-3 flex items-center justify-between">
        <span className="font-bold">InfoComm India 2026 — Organizer</span>
        <div className="flex items-center gap-4 text-sm">
          <Link to="/organizer" className="hover:underline">Exhibitors</Link>
          <Link to="/organizer/feed" className="underline">Feed</Link>
          <Link to="/organizer/analytics" className="hover:underline">Analytics</Link>
          <Link to="/organizer/draw" className="hover:underline">Lucky Draw</Link>
          <Link to="/leaderboard" className="hover:underline">Leaderboard</Link>
          <button onClick={signOut} className="bg-white text-primary font-semibold px-3 py-1 rounded">Sign Out</button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Live Visit Feed</h1>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span
              className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}
            />
            {connected ? 'Live' : 'Connecting…'}
          </div>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : visits.length === 0 ? (
          <p className="text-gray-500 text-center py-12">No visits recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {visits.map(visit => (
              <div
                key={visit.id}
                className="odd:bg-primary-subtle bg-white rounded-lg border border-gray-200 px-5 py-3 flex items-center gap-4"
              >
                <span className="text-xs font-semibold bg-primary text-white rounded-full px-2 py-0.5 shrink-0">
                  Day {visit.day}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 truncate">{visit.profiles.name}</span>
                    <span className="text-gray-400 text-sm">→</span>
                    <span className="text-gray-700 truncate">{visit.exhibitors.name}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Booth {visit.exhibitors.booth_number} · {visit.exhibitors.hall}
                  </div>
                </div>
                <div className="shrink-0 text-right space-y-0.5">
                  <div className="text-sm font-mono text-gray-700">{formatTime(visit.visited_at)}</div>
                  <StarRating rating={visit.rating} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
