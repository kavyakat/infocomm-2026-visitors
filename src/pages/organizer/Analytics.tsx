import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { toCsv, downloadCsv } from '../../lib/export'
import {
  eligibleCount,
  buildHallDistribution,
  buildHourlyDist,
  buildTopExhibitors,
  buildEngagementDist,
} from '../../lib/analytics'

type Stats = {
  totalVisits: number
  uniqueVisitors: number
  totalExhibitors: number
  eligible: number
  hallDist: Array<{ hall: string; exhibitorCount: number; visitCount: number }>
  leaderboardVisible: boolean
  hourlyDist: Array<{ hour: number; count: number }>
  dailyDist: Array<{ day: number; count: number }>
  topExhibitors: Array<{ name: string; booth: string; count: number }>
  ratingDist: Array<{ label: string; count: number }>
  engagementDist: Array<{ bucket: string; count: number }>
}

function StatCard({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
      <div className="text-3xl font-bold text-primary">{value}</div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
    </div>
  )
}

function HBar({ value, max, label, right }: { value: number; max: number; label: string; right?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="w-32 text-right text-gray-600 shrink-0 truncate">{label}</div>
      <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-10 text-gray-700 font-medium shrink-0">{right ?? value}</div>
    </div>
  )
}

const EXPORT_COLUMNS = [
  'visitor_name',
  'visitor_email',
  'exhibitor_name',
  'booth_number',
  'hall',
  'day',
  'visited_at',
  'rating',
]

function hourLabel(hour: number): string {
  if (hour === 0) return '12am'
  if (hour < 12) return `${hour}am`
  if (hour === 12) return '12pm'
  return `${hour - 12}pm`
}

export default function Analytics() {
  const { signOut } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [togglingLeaderboard, setTogglingLeaderboard] = useState(false)
  const [error, setError] = useState('')

  async function handleExport() {
    setExporting(true)
    try {
      const { data, error: fetchError } = await supabase
        .from('visits')
        .select('*, profiles(name, email), exhibitors(name, booth_number, hall)')

      if (fetchError) { setError(fetchError.message); return }

      const rows = (data ?? []).map((v: Record<string, unknown>) => {
        const profile = v.profiles as Record<string, unknown> | null
        const exhibitor = v.exhibitors as Record<string, unknown> | null
        return {
          visitor_name: profile?.name ?? '',
          visitor_email: profile?.email ?? '',
          exhibitor_name: exhibitor?.name ?? '',
          booth_number: exhibitor?.booth_number ?? '',
          hall: exhibitor?.hall ?? '',
          day: v.day,
          visited_at: v.visited_at,
          rating: v.rating,
        }
      })

    const csv = toCsv(rows, EXPORT_COLUMNS)
    downloadCsv('visits.csv', csv)
    } finally {
      setExporting(false)
    }
  }

  async function handleToggleLeaderboard() {
    if (!stats) return
    setTogglingLeaderboard(true)
    const newValue = stats.leaderboardVisible ? 'false' : 'true'
    const { error: updateError } = await supabase
      .from('settings')
      .upsert({ key: 'leaderboard_visible', value: newValue })
    if (updateError) {
      setError(updateError.message)
    } else {
      setStats({ ...stats, leaderboardVisible: newValue === 'true' })
    }
    setTogglingLeaderboard(false)
  }

  useEffect(() => {
    async function load() {
      const [visitsRes, exhibitorsRes, settingsRes] = await Promise.all([
        supabase.from('visits').select('visitor_id, day, exhibitor_id, visited_at, rating'),
        supabase.from('exhibitors').select('id, hall, name, booth_number'),
        supabase.from('settings').select('value').eq('key', 'leaderboard_visible').single(),
      ])

      if (visitsRes.error) { setError(visitsRes.error.message); setLoading(false); return }
      if (exhibitorsRes.error) { setError(exhibitorsRes.error.message); setLoading(false); return }

      const allVisits = (visitsRes.data ?? []) as Array<{
        visitor_id: string
        day: 1 | 2 | 3
        exhibitor_id: string
        visited_at: string
        rating: number | null
      }>
      const allExhibitors = (exhibitorsRes.data ?? []) as Array<{
        id: string
        hall: string
        name: string
        booth_number: string
      }>

      const totalVisits = allVisits.length
      const uniqueVisitors = new Set(allVisits.map(v => v.visitor_id)).size
      const totalExhibitors = allExhibitors.length

      const visitsByVisitor = new Map<string, Array<{ day: 1 | 2 | 3 }>>()
      for (const v of allVisits) {
        if (!visitsByVisitor.has(v.visitor_id)) visitsByVisitor.set(v.visitor_id, [])
        visitsByVisitor.get(v.visitor_id)!.push({ day: v.day })
      }

      const eligible = eligibleCount(visitsByVisitor)
      const hallDist = buildHallDistribution(allExhibitors, allVisits)
      const leaderboardVisible = settingsRes.data?.value === 'true'

      const hourlyDist = buildHourlyDist(allVisits)

      const dayCounts = new Map<number, number>()
      for (const v of allVisits) {
        dayCounts.set(v.day, (dayCounts.get(v.day) ?? 0) + 1)
      }
      const dailyDist = [1, 2, 3].map(day => ({ day, count: dayCounts.get(day) ?? 0 }))

      const topExhibitors = buildTopExhibitors(allVisits, allExhibitors)

      const ratingCounts = new Map<number, number>()
      let noRating = 0
      for (const v of allVisits) {
        if (v.rating === null || v.rating === undefined) {
          noRating++
        } else {
          ratingCounts.set(v.rating, (ratingCounts.get(v.rating) ?? 0) + 1)
        }
      }
      const ratingDist = [
        { label: '★☆☆☆☆', count: ratingCounts.get(1) ?? 0 },
        { label: '★★☆☆☆', count: ratingCounts.get(2) ?? 0 },
        { label: '★★★☆☆', count: ratingCounts.get(3) ?? 0 },
        { label: '★★★★☆', count: ratingCounts.get(4) ?? 0 },
        { label: '★★★★★', count: ratingCounts.get(5) ?? 0 },
        { label: 'No rating', count: noRating },
      ]

      const visitorVisitCounts = new Map<string, number>()
      for (const v of allVisits) {
        visitorVisitCounts.set(v.visitor_id, (visitorVisitCounts.get(v.visitor_id) ?? 0) + 1)
      }
      const engagementDist = buildEngagementDist(visitorVisitCounts)

      setStats({
        totalVisits,
        uniqueVisitors,
        totalExhibitors,
        eligible,
        hallDist,
        leaderboardVisible,
        hourlyDist,
        dailyDist,
        topExhibitors,
        ratingDist,
        engagementDist,
      })
      setLoading(false)
    }

    load().catch(err => { setError(String(err)); setLoading(false) })
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-primary text-white px-6 py-3 flex items-center justify-between">
        <span className="font-bold">InfoComm India 2026 — Organizer</span>
        <div className="flex items-center gap-4 text-sm">
          <Link to="/organizer" className="hover:underline">Exhibitors</Link>
          <Link to="/organizer/feed" className="hover:underline">Feed</Link>
          <Link to="/organizer/analytics" className="underline">Analytics</Link>
          <Link to="/organizer/draw" className="hover:underline">Lucky Draw</Link>
          <Link to="/leaderboard" className="hover:underline">Leaderboard</Link>
          <button onClick={signOut} className="bg-white text-primary font-semibold px-3 py-1 rounded">Sign Out</button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto p-6 space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          {!loading && (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="bg-primary text-white text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {exporting ? 'Exporting…' : 'Export Visits CSV'}
            </button>
          )}
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : stats ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard value={stats.totalVisits} label="Total Visits" />
              <StatCard value={stats.uniqueVisitors} label="Unique Visitors" />
              <StatCard value={stats.totalExhibitors} label="Total Exhibitors" />
              <StatCard value={stats.eligible} label="Eligible Visitors" />
            </div>

            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">Hall Distribution</h2>
              {stats.hallDist.length === 0 ? (
                <p className="text-gray-500 text-sm">No hall data available.</p>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-5 py-3 font-semibold text-gray-700">Hall</th>
                        <th className="text-right px-5 py-3 font-semibold text-gray-700">Exhibitors</th>
                        <th className="text-right px-5 py-3 font-semibold text-gray-700">Visits</th>
                        <th className="px-5 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {stats.hallDist.map(row => {
                        const maxVisits = stats.hallDist[0].visitCount
                        const pct = maxVisits > 0 ? Math.round((row.visitCount / maxVisits) * 100) : 0
                        return (
                          <tr key={row.hall} className="odd:bg-primary-subtle">
                            <td className="px-5 py-3 font-medium text-gray-900">{row.hall}</td>
                            <td className="px-5 py-3 text-right text-gray-700">{row.exhibitorCount}</td>
                            <td className="px-5 py-3 text-right text-gray-700">{row.visitCount}</td>
                            <td className="px-5 py-3 w-32">
                              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary rounded-full"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Visits by Time of Day */}
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">Visits by Time of Day</h2>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                {(() => {
                  const maxCount = Math.max(...stats.hourlyDist.map(h => h.count), 1)
                  return (
                    <div className="flex items-end gap-1 h-24">
                      {stats.hourlyDist.map(({ hour, count }) => {
                        const heightPct = Math.round((count / maxCount) * 100)
                        return (
                          <div key={hour} className="flex-1 flex flex-col items-center gap-1">
                            <div className="w-full flex items-end justify-center" style={{ height: '80px' }}>
                              <div
                                className="w-full bg-primary rounded-t"
                                style={{ height: `${heightPct}%` }}
                              />
                            </div>
                            <div className="text-xs text-gray-500 leading-none">
                              {hour % 3 === 0 ? hourLabel(hour) : ''}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* Day-by-Day Traffic */}
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">Day-by-Day Traffic</h2>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                {(() => {
                  const maxCount = Math.max(...stats.dailyDist.map(d => d.count), 1)
                  return (
                    <div className="flex items-end gap-4 h-32">
                      {stats.dailyDist.map(({ day, count }) => {
                        const heightPct = Math.round((count / maxCount) * 100)
                        const isEmpty = count === 0
                        return (
                          <div key={day} className="flex-1 flex flex-col items-center gap-1">
                            <div className="text-xs font-medium text-gray-700">{count > 0 ? count : ''}</div>
                            <div className="w-full flex items-end justify-center" style={{ height: '96px' }}>
                              <div
                                className={`w-full rounded-t ${isEmpty ? 'bg-primary opacity-20' : 'bg-primary'}`}
                                style={{ height: `${isEmpty ? 100 : heightPct}%` }}
                              />
                            </div>
                            <div className="text-xs text-gray-500">Day {day}</div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* Most Visited Exhibitors */}
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">Most Visited Exhibitors</h2>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                {stats.topExhibitors.length === 0 ? (
                  <p className="text-gray-500 text-sm">No visit data available.</p>
                ) : (
                  <div className="space-y-3">
                    {(() => {
                      const maxCount = stats.topExhibitors[0].count
                      return stats.topExhibitors.map(ex => (
                        <HBar
                          key={`${ex.name}-${ex.booth}`}
                          value={ex.count}
                          max={maxCount}
                          label={`${ex.name} (${ex.booth})`}
                        />
                      ))
                    })()}
                  </div>
                )}
              </div>
            </div>

            {/* Rating Distribution */}
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">Rating Distribution</h2>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="space-y-3">
                  {(() => {
                    const maxCount = Math.max(...stats.ratingDist.map(r => r.count), 1)
                    return stats.ratingDist.map(r => (
                      <HBar key={r.label} value={r.count} max={maxCount} label={r.label} />
                    ))
                  })()}
                </div>
              </div>
            </div>

            {/* Visitor Engagement */}
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">Visitor Engagement</h2>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="space-y-3">
                  {(() => {
                    const maxCount = Math.max(...stats.engagementDist.map(e => e.count), 1)
                    return stats.engagementDist.map(e => (
                      <HBar key={e.bucket} value={e.count} max={maxCount} label={e.bucket} />
                    ))
                  })()}
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">Visitor Leaderboard</h2>
              <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">
                    Status: <span className={stats.leaderboardVisible ? 'text-green-600 font-semibold' : 'text-gray-700 font-semibold'}>
                      {stats.leaderboardVisible ? 'Shown to visitors' : 'Hidden from visitors'}
                    </span>
                  </p>
                </div>
                <button
                  onClick={handleToggleLeaderboard}
                  disabled={togglingLeaderboard}
                  className="bg-primary text-white text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {togglingLeaderboard
                    ? 'Saving…'
                    : stats.leaderboardVisible
                    ? 'Hide from Visitors'
                    : 'Show to Visitors'}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
