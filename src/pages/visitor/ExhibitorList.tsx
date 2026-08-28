import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useExhibitors } from '../../hooks/useExhibitors'
import { useVisits } from '../../hooks/useVisits'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import ExhibitorCard from '../../components/ExhibitorCard'
import HallProgress from '../../components/HallProgress'
import SocialFooter from '../../components/SocialFooter'

export default function ExhibitorList() {
  const { profile, signOut } = useAuth()
  const { exhibitors, loading } = useExhibitors()
  const { visits, hasVisited, getVisitedHalls } = useVisits(profile?.id ?? '')
  const [search, setSearch] = useState('')
  const [hallFilter, setHallFilter] = useState('')
  const [minPlatinum, setMinPlatinum] = useState(3)
  const navigate = useNavigate()

  useEffect(() => {
    supabase
      .from('settings')
      .select('value')
      .eq('key', 'min_platinum_visits')
      .single()
      .then(({ data }) => {
        if (data?.value) setMinPlatinum(Number(data.value))
      })
  }, [])

  const halls = [...new Set(exhibitors.map(e => e.hall))].sort()
  const hallProgress = getVisitedHalls(exhibitors)

  const platinumIds = new Set(exhibitors.filter(e => e.is_platinum).map(e => e.id))
  const visitedIds = new Set(visits.map(v => v.exhibitor_id))
  const platinumVisited = [...platinumIds].filter(id => visitedIds.has(id)).length
  const platinumMet = platinumVisited >= minPlatinum

  const filtered = exhibitors
    .filter(e => {
      const matchesSearch = e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.booth_number.toLowerCase().includes(search.toLowerCase())
      const matchesHall = hallFilter ? e.hall === hallFilter : true
      return matchesSearch && matchesHall
    })
    .sort((a, b) => Number(b.is_platinum) - Number(a.is_platinum))

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-primary text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="font-bold text-sm">InfoComm India 2026</p>
          <p className="text-xs opacity-70">Hi, {profile?.name}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/my-eligibility" className="text-xs opacity-70">My Progress</Link>
          <button onClick={signOut} className="text-xs opacity-70">Sign out</button>
        </div>
      </header>

      <div className="p-4 space-y-3">
        <HallProgress visited={hallProgress.visited} total={hallProgress.total} />

        {platinumIds.size > 0 && (
          <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${
            platinumMet
              ? 'bg-green-50 border-green-300 text-green-700'
              : 'bg-amber-50 border-amber-300 text-amber-700'
          }`}>
            ★ Platinum Partners: {platinumVisited} / {minPlatinum} required
          </div>
        )}

        <input
          placeholder="Search exhibitors…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />

        <select
          value={hallFilter}
          onChange={e => setHallFilter(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
        >
          <option value="">All Halls</option>
          {halls.map(h => <option key={h} value={h}>{h}</option>)}
        </select>

        {loading && <p className="text-center text-sm text-gray-400 py-8">Loading…</p>}

        <div className="space-y-2">
          {filtered.map((e, i) => (
            <ExhibitorCard
              key={e.id}
              id={e.id}
              name={e.name}
              booth_number={e.booth_number}
              hall={e.hall}
              isPlatinum={e.is_platinum}
              subtle={i % 2 === 0}
              visited={hasVisited(e.id)}
              onCheckIn={id => navigate(`/check-in/${id}`)}
            />
          ))}
        </div>
      </div>

      <SocialFooter />
    </div>
  )
}
