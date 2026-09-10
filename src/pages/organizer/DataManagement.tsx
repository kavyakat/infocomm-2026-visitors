import { useState, useEffect, Fragment } from 'react'
import { Link } from 'react-router-dom'
import { supabase, type Profile } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

type VisitRow = {
  id: string
  visitor_id: string
  exhibitor_id: string
  visited_at: string
  day: 1 | 2 | 3
  rating: number | null
  exhibitor_name: string
  exhibitor_hall: string
}

export default function DataManagement() {
  const { signOut } = useAuth()
  const [users, setUsers] = useState<Profile[]>([])
  const [visits, setVisits] = useState<VisitRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<string | null>(null)
  const [confirmDeleteVisit, setConfirmDeleteVisit] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const [profilesRes, visitsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'visitor').order('name'),
      supabase
        .from('visits')
        .select('id, visitor_id, exhibitor_id, visited_at, day, rating, exhibitors(name, hall)')
        .order('visited_at', { ascending: false }),
    ])

    const raw = (visitsRes.data ?? []) as unknown as Array<{
      id: string
      visitor_id: string
      exhibitor_id: string
      visited_at: string
      day: 1 | 2 | 3
      rating: number | null
      exhibitors: { name: string; hall: string } | null
    }>

    setUsers(profilesRes.data ?? [])
    setVisits(raw.map(v => ({
      id: v.id,
      visitor_id: v.visitor_id,
      exhibitor_id: v.exhibitor_id,
      visited_at: v.visited_at,
      day: v.day,
      rating: v.rating,
      exhibitor_name: v.exhibitors?.name ?? '(unknown)',
      exhibitor_hall: v.exhibitors?.hall ?? '',
    })))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function deleteUser(userId: string) {
    setDeleting(true)
    setError('')
    const { error: visitErr } = await supabase.from('visits').delete().eq('visitor_id', userId)
    if (visitErr) { setError(visitErr.message); setDeleting(false); return }
    const { error: profileErr } = await supabase.from('profiles').delete().eq('id', userId)
    if (profileErr) { setError(profileErr.message); setDeleting(false); return }
    setConfirmDeleteUser(null)
    if (expandedUser === userId) setExpandedUser(null)
    await load()
    setDeleting(false)
  }

  async function deleteVisit(visitId: string) {
    setDeleting(true)
    setError('')
    const { error: err } = await supabase.from('visits').delete().eq('id', visitId)
    if (err) { setError(err.message); setDeleting(false); return }
    setConfirmDeleteVisit(null)
    setVisits(prev => prev.filter(v => v.id !== visitId))
    setDeleting(false)
  }

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.company_name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-primary text-white px-6 py-3 flex items-center justify-between">
        <span className="font-bold">InfoComm India 2026 — Organizer</span>
        <div className="flex items-center gap-4 text-sm">
          <Link to="/organizer" className="hover:underline">Exhibitors</Link>
          <Link to="/organizer/feed" className="hover:underline">Feed</Link>
          <Link to="/organizer/analytics" className="hover:underline">Analytics</Link>
          <Link to="/organizer/draw" className="hover:underline">Lucky Draw</Link>
          <Link to="/organizer/users" className="underline">Users</Link>
          <Link to="/organizer/settings" className="hover:underline">Settings</Link>
          <Link to="/leaderboard" className="hover:underline">Leaderboard</Link>
          <button onClick={signOut} className="bg-white text-primary font-semibold px-3 py-1 rounded">Sign Out</button>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          {!loading && (
            <span className="text-sm text-gray-500">
              {users.length} registered visitor{users.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        {!loading && users.length > 0 && (
          <input
            type="search"
            placeholder="Search by name, email, or company…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <p className="text-gray-500 text-center py-12">
            {users.length === 0 ? 'No visitors registered yet.' : 'No users match your search.'}
          </p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Email</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Company</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Visits</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => {
                  const userVisits = visits.filter(v => v.visitor_id === user.id)
                  const isExpanded = expandedUser === user.id
                  return (
                    <Fragment key={user.id}>
                      <tr className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{user.name}</td>
                        <td className="px-4 py-3 text-gray-600">{user.email}</td>
                        <td className="px-4 py-3 text-gray-600">{user.company_name}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => setExpandedUser(isExpanded ? null : user.id)}
                            className="text-primary font-semibold hover:underline tabular-nums"
                          >
                            {userVisits.length} {isExpanded ? '▲' : '▼'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {confirmDeleteUser === user.id ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => deleteUser(user.id)}
                                disabled={deleting}
                                className="text-xs text-white bg-red-500 hover:bg-red-600 rounded px-2 py-1 disabled:opacity-50"
                              >
                                {deleting ? '…' : 'Confirm'}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteUser(null)}
                                className="text-xs text-gray-500 border border-gray-200 rounded px-2 py-1"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteUser(user.id)}
                              className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded px-2 py-1"
                            >
                              Delete user
                            </button>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-t border-gray-100 bg-gray-50">
                          <td colSpan={5} className="px-6 py-3">
                            {userVisits.length === 0 ? (
                              <p className="text-gray-400 text-xs text-center py-2">No visits recorded.</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-gray-500">
                                    <th className="text-left pb-1.5 pr-4 font-medium">Exhibitor</th>
                                    <th className="text-left pb-1.5 pr-4 font-medium">Hall</th>
                                    <th className="text-left pb-1.5 pr-4 font-medium">Day</th>
                                    <th className="text-left pb-1.5 pr-4 font-medium">Time</th>
                                    <th />
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {userVisits.map(visit => (
                                    <tr key={visit.id}>
                                      <td className="py-1.5 pr-4 text-gray-700">{visit.exhibitor_name}</td>
                                      <td className="py-1.5 pr-4 text-gray-500">{visit.exhibitor_hall}</td>
                                      <td className="py-1.5 pr-4 text-gray-500">Day {visit.day}</td>
                                      <td className="py-1.5 pr-4 text-gray-500">
                                        {new Date(visit.visited_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                      </td>
                                      <td className="py-1.5 text-right">
                                        {confirmDeleteVisit === visit.id ? (
                                          <div className="flex items-center justify-end gap-2">
                                            <button
                                              onClick={() => deleteVisit(visit.id)}
                                              disabled={deleting}
                                              className="text-white bg-red-500 hover:bg-red-600 rounded px-2 py-0.5 disabled:opacity-50"
                                            >
                                              {deleting ? '…' : 'Confirm'}
                                            </button>
                                            <button
                                              onClick={() => setConfirmDeleteVisit(null)}
                                              className="text-gray-500 border border-gray-200 rounded px-2 py-0.5"
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        ) : (
                                          <button
                                            onClick={() => setConfirmDeleteVisit(visit.id)}
                                            className="text-red-400 hover:text-red-600 border border-red-200 rounded px-2 py-0.5"
                                          >
                                            Delete
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
