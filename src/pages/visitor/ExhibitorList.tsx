import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useExhibitors } from '../../hooks/useExhibitors'
import { useVisits } from '../../hooks/useVisits'
import { useAuth } from '../../hooks/useAuth'
import ExhibitorCard from '../../components/ExhibitorCard'
import HallProgress from '../../components/HallProgress'

export default function ExhibitorList() {
  const { profile, signOut } = useAuth()
  const { exhibitors, loading } = useExhibitors()
  const { hasVisited, getVisitedHalls } = useVisits(profile?.id ?? '')
  const [search, setSearch] = useState('')
  const [hallFilter, setHallFilter] = useState('')
  const navigate = useNavigate()

  const halls = [...new Set(exhibitors.map(e => e.hall))].sort()
  const hallProgress = getVisitedHalls(exhibitors)

  const filtered = exhibitors.filter(e => {
    const matchesSearch = e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.booth_number.toLowerCase().includes(search.toLowerCase())
    const matchesHall = hallFilter ? e.hall === hallFilter : true
    return matchesSearch && matchesHall
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-primary text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="font-bold text-sm">InfoComm India 2026</p>
          <p className="text-xs opacity-70">Hi, {profile?.name}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/leaderboard" className="text-xs opacity-70">Leaderboard</Link>
          <button onClick={signOut} className="text-xs opacity-70">Sign out</button>
        </div>
      </header>

      <div className="p-4 space-y-3">
        <HallProgress visited={hallProgress.visited} total={hallProgress.total} />

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
              subtle={i % 2 === 0}
              visited={hasVisited(e.id)}
              onCheckIn={id => navigate(`/check-in/${id}`)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
