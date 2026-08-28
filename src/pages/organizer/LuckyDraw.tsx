import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { buildCandidates, nextPrizeRank, type Candidate } from '../../lib/luckyDraw'
import { fairDraw } from '../../lib/eligibility'
import { downloadExcel } from '../../lib/export'
import { type EligibilityConfig } from '../../lib/eligibility'

type SnapshotRow = {
  id: string
  visitor_id: string
  name: string
  email: string
  mobile: string
  company_name: string
  designation: string
  days_visited: number
  halls_covered: string
  platinum_visits: number
  social_complete: boolean
}

type WinnerRow = {
  id: string
  visitor_id: string
  prize_rank: number
  name: string
  email: string
  company_name: string
  designation: string
  redrawn: boolean
}

function rankBadge(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `#${rank}`
}

function rankLabel(rank: number): string {
  if (rank === 1) return '1st Prize'
  if (rank === 2) return '2nd Prize'
  if (rank === 3) return '3rd Prize'
  const suffixes = ['th', 'st', 'nd', 'rd']
  const suffix = rank % 100 >= 11 && rank % 100 <= 13 ? 'th' : (suffixes[rank % 10] ?? 'th')
  return `${rank}${suffix} Place`
}

export default function LuckyDraw() {
  const { signOut } = useAuth()
  const [pool, setPool] = useState<Candidate[]>([])
  const [snapshot, setSnapshot] = useState<SnapshotRow[]>([])
  const [winners, setWinners] = useState<WinnerRow[]>([])
  const [poolBuilt, setPoolBuilt] = useState(false)
  const [building, setBuilding] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [newWinnerId, setNewWinnerId] = useState<string | null>(null)
  const [celebrationWinner, setCelebrationWinner] = useState<WinnerRow | null>(null)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [error, setError] = useState('')
  const [manualSearch, setManualSearch] = useState('')
  const [manualResults, setManualResults] = useState<Array<{ id: string; name: string; email: string; company_name: string; designation: string }>>([])
  const [manualSearching, setManualSearching] = useState(false)
  const [manualAdding, setManualAdding] = useState<Set<string>>(new Set())

  // Auto-dismiss celebration after 5 seconds
  useEffect(() => {
    if (!celebrationWinner) return
    const timer = setTimeout(() => setCelebrationWinner(null), 5000)
    return () => clearTimeout(timer)
  }, [celebrationWinner])

  async function loadWinners() {
    const { data, error: err } = await supabase
      .from('lucky_draw_winners')
      .select('id, visitor_id, prize_rank, redrawn, profiles(name, email, company_name, designation)')
      .order('prize_rank')
    if (err) { setError(err.message); return }

    setWinners((data ?? []).map(w => {
      const wr = w as unknown as {
        id: string
        visitor_id: string
        prize_rank: number
        redrawn: boolean
        profiles: { name: string; email: string; company_name: string; designation: string } | null
      }
      return {
        id: wr.id,
        visitor_id: wr.visitor_id,
        prize_rank: wr.prize_rank,
        redrawn: wr.redrawn,
        name: wr.profiles?.name ?? 'Unknown',
        email: wr.profiles?.email ?? '',
        company_name: wr.profiles?.company_name ?? '',
        designation: wr.profiles?.designation ?? '',
      }
    }))
  }

  useEffect(() => {
    loadWinners()

    const channel = supabase
      .channel('lucky-draw-winners')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lucky_draw_winners' }, () => {
        loadWinners()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  async function buildPool() {
    setBuilding(true)
    setError('')
    try {
      const [visitsRes, profilesRes, exhibitorsRes, settingsRes] = await Promise.all([
        supabase.from('visits').select('visitor_id, exhibitor_id, day, exhibitors(hall)'),
        supabase.from('profiles').select('id, name, email, mobile, company_name, designation, social_linkedin, social_instagram, social_facebook, social_youtube').eq('role', 'visitor'),
        supabase.from('exhibitors').select('id, hall, is_platinum'),
        supabase.from('settings').select('key, value').in('key', ['min_qualifying_days', 'min_platinum_visits', 'min_total_checkins']),
      ])

      if (visitsRes.error) throw new Error(visitsRes.error.message)
      if (profilesRes.error) throw new Error(profilesRes.error.message)
      if (exhibitorsRes.error) throw new Error(exhibitorsRes.error.message)

      const settingsRows = (settingsRes.data ?? []) as Array<{ key: string; value: string }>
      const settingsMap = new Map(settingsRows.map(r => [r.key, r.value]))
      const config: EligibilityConfig = {
        minQualifyingDays: Number(settingsMap.get('min_qualifying_days') ?? 2),
        minPlatinumVisits: Number(settingsMap.get('min_platinum_visits') ?? 3),
        minTotalCheckins: Number(settingsMap.get('min_total_checkins') ?? 0),
      }

      const allExhibitors = (exhibitorsRes.data ?? []) as Array<{ id: string; hall: string; is_platinum: boolean }>
      const platinumIds = new Set(allExhibitors.filter(e => e.is_platinum).map(e => e.id))
      const exhibitorHallMap = new Map(allExhibitors.map(e => [e.id, e.hall]))

      type RawVisit = { visitor_id: string; exhibitor_id: string; day: 1|2|3; exhibitors: { hall: string } | null }
      const rawVisits = (visitsRes.data ?? []) as unknown as RawVisit[]
      const flatVisits = rawVisits.map(v => ({
        visitor_id: v.visitor_id,
        exhibitor_id: v.exhibitor_id,
        day: v.day,
        hall: v.exhibitors?.hall ?? exhibitorHallMap.get(v.exhibitor_id) ?? '',
      }))

      type ProfileRow = {
        id: string; name: string; email: string; mobile: string
        company_name: string; designation: string
        social_linkedin: boolean; social_instagram: boolean
        social_facebook: boolean; social_youtube: boolean
      }
      const profiles = (profilesRes.data ?? []) as ProfileRow[]

      const profileMap = new Map(profiles.map(p => [p.id, { name: p.name, email: p.email }]))
      const socialByVisitor = new Map(profiles.map(p => [
        p.id,
        p.social_linkedin && p.social_instagram && p.social_facebook && p.social_youtube,
      ]))

      const { checkEligibility } = await import('../../lib/eligibility')

      const byVisitor = new Map<string, Array<{ exhibitor_id: string; hall: string; day: 1|2|3 }>>()
      for (const v of flatVisits) {
        if (!byVisitor.has(v.visitor_id)) byVisitor.set(v.visitor_id, [])
        byVisitor.get(v.visitor_id)!.push({ exhibitor_id: v.exhibitor_id, hall: v.hall, day: v.day })
      }

      const snapshotRows: Omit<SnapshotRow, 'id'>[] = []
      const candidates = buildCandidates(flatVisits, profileMap, platinumIds, socialByVisitor, config)

      for (const c of candidates) {
        const visits = byVisitor.get(c.id) ?? []
        const result = checkEligibility({ visits, platinumIds, socialComplete: socialByVisitor.get(c.id) ?? false, config })
        const profile = profiles.find(p => p.id === c.id)
        snapshotRows.push({
          visitor_id: c.id,
          name: c.name,
          email: profile?.email ?? '',
          mobile: profile?.mobile ?? '',
          company_name: profile?.company_name ?? '',
          designation: profile?.designation ?? '',
          days_visited: result.daysVisited,
          halls_covered: result.hallsCovered.join(', '),
          platinum_visits: result.platinumVisits,
          social_complete: result.eligible,
        })
      }

      await supabase.from('lucky_draw_eligible_snapshot').delete().gte('created_at', '1970-01-01')
      if (snapshotRows.length > 0) {
        const { error: insertErr } = await supabase.from('lucky_draw_eligible_snapshot').insert(snapshotRows)
        if (insertErr) throw new Error(insertErr.message)
      }

      const { data: freshSnap } = await supabase.from('lucky_draw_eligible_snapshot').select('*')
      setSnapshot((freshSnap ?? []) as SnapshotRow[])
      setPool(candidates)
      setPoolBuilt(true)
    } catch (e) {
      setError(String(e))
    } finally {
      setBuilding(false)
    }
  }

  async function runDraw() {
    if (pool.length === 0) return

    const activeWinners = winners.filter(w => !w.redrawn)
    const next = nextPrizeRank(activeWinners.map(w => w.prize_rank))

    setDrawing(true)
    setError('')
    try {
      const winnerId = fairDraw(pool)
      const winnerCandidate = pool.find(c => c.id === winnerId)!

      const { data: inserted, error: insertErr } = await supabase
        .from('lucky_draw_winners')
        .insert({ visitor_id: winnerId, prize_rank: next, redrawn: false })
        .select('id')
        .single()

      if (insertErr) throw new Error(insertErr.message)

      const profile = snapshot.find(s => s.visitor_id === winnerId)
      const newWinner: WinnerRow = {
        id: (inserted as { id: string }).id,
        visitor_id: winnerId,
        prize_rank: next,
        redrawn: false,
        name: winnerCandidate.name,
        email: winnerCandidate.email,
        company_name: profile?.company_name ?? '',
        designation: profile?.designation ?? '',
      }

      setWinners(prev => [...prev, newWinner].sort((a, b) => a.prize_rank - b.prize_rank))
      setPool(prev => prev.filter(c => c.id !== winnerId))
      setNewWinnerId((inserted as { id: string }).id)
      setCelebrationWinner(newWinner)
    } catch (e) {
      setError(String(e))
    } finally {
      setDrawing(false)
    }
  }

  async function redraw(winner: WinnerRow) {
    const { error: updateErr } = await supabase
      .from('lucky_draw_winners')
      .update({ redrawn: true })
      .eq('id', winner.id)
    if (updateErr) { setError(updateErr.message); return }

    setWinners(prev => prev.map(w => w.id === winner.id ? { ...w, redrawn: true } : w))
    setPool(prev => [...prev, { id: winner.visitor_id, name: winner.name, email: winner.email }])
  }

  async function resetDraw() {
    const { error: delErr } = await supabase
      .from('lucky_draw_winners')
      .delete()
      .gte('created_at', '1970-01-01')
    if (delErr) { setError(delErr.message); return }

    const prevActive = winners.filter(w => !w.redrawn)
    setPool(prev => [
      ...prev,
      ...prevActive.map(w => ({ id: w.visitor_id, name: w.name, email: w.email })),
    ])
    setWinners([])
    setNewWinnerId(null)
    setCelebrationWinner(null)
    setResetConfirm(false)
  }

  async function searchVisitors() {
    if (!manualSearch.trim()) return
    setManualSearching(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, name, email, company_name, designation')
      .eq('role', 'visitor')
      .or(`name.ilike.%${manualSearch.trim()}%,email.ilike.%${manualSearch.trim()}%`)
      .limit(8)
    setManualResults((data ?? []) as Array<{ id: string; name: string; email: string; company_name: string; designation: string }>)
    setManualSearching(false)
  }

  async function manualAddToPool(v: { id: string; name: string; email: string; company_name: string; designation: string }) {
    setManualAdding(prev => new Set(prev).add(v.id))
    setError('')
    try {
      const { error: insertErr } = await supabase
        .from('lucky_draw_eligible_snapshot')
        .insert({
          visitor_id: v.id,
          name: v.name,
          email: v.email,
          mobile: '',
          company_name: v.company_name,
          designation: v.designation,
          days_visited: 0,
          halls_covered: 'Manual override',
          platinum_visits: 0,
          social_complete: false,
        })
      if (insertErr) { setError(insertErr.message); return }
      setPool(prev => [...prev, { id: v.id, name: v.name, email: v.email }])
      setSnapshot(prev => [...prev, {
        id: crypto.randomUUID(),
        visitor_id: v.id,
        name: v.name,
        email: v.email,
        mobile: '',
        company_name: v.company_name,
        designation: v.designation,
        days_visited: 0,
        halls_covered: 'Manual override',
        platinum_visits: 0,
        social_complete: false,
      }])
      setPoolBuilt(true)
      setManualResults(prev => prev.filter(r => r.id !== v.id))
    } finally {
      setManualAdding(prev => { const n = new Set(prev); n.delete(v.id); return n })
    }
  }

  function enterFullscreen() {
    document.documentElement.requestFullscreen().catch(() => {})
  }

  function handleExport() {
    downloadExcel('infocomm-draw.xlsx', [
      {
        name: 'Eligible Pool',
        rows: snapshot.map(s => ({
          'Name': s.name,
          'Email': s.email,
          'Mobile': s.mobile,
          'Company': s.company_name,
          'Designation': s.designation,
          'Days Visited': s.days_visited,
          'Halls Covered': s.halls_covered,
          'Platinum Visits': s.platinum_visits,
          'Social Complete': s.social_complete ? 'Yes' : 'No',
        })),
      },
      {
        name: 'Winners',
        rows: winners.map(w => ({
          'Prize': rankLabel(w.prize_rank),
          'Name': w.name,
          'Email': w.email,
          'Company': w.company_name,
          'Designation': w.designation,
          'Redrawn': w.redrawn ? 'Yes' : 'No',
        })),
      },
    ])
  }

  const activeWinners = winners.filter(w => !w.redrawn)
  const nextRank = nextPrizeRank(activeWinners.map(w => w.prize_rank))
  const canDraw = poolBuilt && pool.length > 0 && !drawing

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Celebration overlay */}
      {celebrationWinner && (
        <>
          <style>{`
            @keyframes pop-in {
              0%   { transform: scale(0.4); opacity: 0; }
              70%  { transform: scale(1.06); }
              100% { transform: scale(1); opacity: 1; }
            }
            .animate-pop-in { animation: pop-in 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards; }
          `}</style>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75"
            onClick={() => setCelebrationWinner(null)}
          >
            <div
              className="animate-pop-in bg-white rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-6xl mb-3 animate-bounce">{rankBadge(celebrationWinner.prize_rank)}</div>
              <div className="text-sm font-semibold text-primary uppercase tracking-wide mb-1">
                {rankLabel(celebrationWinner.prize_rank)}
              </div>
              <div className="text-2xl font-bold text-gray-900 mb-1">{celebrationWinner.name}</div>
              <div className="text-sm text-gray-500 mb-1">{celebrationWinner.email}</div>
              {celebrationWinner.company_name && (
                <div className="text-xs text-gray-400">{celebrationWinner.company_name}</div>
              )}
              <button
                onClick={() => setCelebrationWinner(null)}
                className="mt-6 px-8 py-2.5 bg-primary text-white rounded-lg font-semibold hover:opacity-90"
              >
                Continue
              </button>
              <p className="mt-2 text-xs text-gray-400">Auto-closes in 5 s · tap anywhere to dismiss</p>
            </div>
          </div>
        </>
      )}

      <nav className="bg-primary text-white px-6 py-3 flex items-center justify-between">
        <span className="font-bold">InfoComm India 2026 — Organizer</span>
        <div className="flex items-center gap-4 text-sm">
          <Link to="/organizer" className="hover:underline">Exhibitors</Link>
          <Link to="/organizer/feed" className="hover:underline">Feed</Link>
          <Link to="/organizer/analytics" className="hover:underline">Analytics</Link>
          <Link to="/organizer/draw" className="underline">Lucky Draw</Link>
          <Link to="/organizer/settings" className="hover:underline">Settings</Link>
          <Link to="/leaderboard" className="hover:underline">Leaderboard</Link>
          <button onClick={signOut} className="bg-white text-primary font-semibold px-3 py-1 rounded">Sign Out</button>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto p-6 space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Lucky Draw</h1>
          {poolBuilt && (
            <span className="text-sm text-gray-500">{pool.length + activeWinners.length} eligible visitor{pool.length + activeWinners.length !== 1 ? 's' : ''}</span>
          )}
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        {/* Build pool */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-900">Eligible Pool</p>
            <p className="text-sm text-gray-500">
              {poolBuilt ? `${pool.length + activeWinners.length} visitors qualify` : 'Build the pool before drawing'}
            </p>
          </div>
          <button
            onClick={buildPool}
            disabled={building}
            className="bg-primary text-white text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {building ? 'Building…' : 'Build Eligible Pool'}
          </button>
        </div>

        {/* Manual add */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <p className="font-semibold text-gray-900 text-sm">Add Visitor Manually</p>
          <div className="flex gap-2">
            <input
              type="search"
              placeholder="Search by name or email…"
              value={manualSearch}
              onChange={e => setManualSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') searchVisitors() }}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={searchVisitors}
              disabled={manualSearching || !manualSearch.trim()}
              className="bg-primary text-white text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {manualSearching ? '…' : 'Search'}
            </button>
          </div>
          {manualResults.length > 0 && (
            <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
              {manualResults.map(v => {
                const alreadyIn = pool.some(c => c.id === v.id) || winners.some(w => w.visitor_id === v.id && !w.redrawn)
                const adding = manualAdding.has(v.id)
                return (
                  <div key={v.id} className="flex items-center justify-between px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{v.name}</div>
                      <div className="text-xs text-gray-500 truncate">{v.email}{v.company_name ? ` · ${v.company_name}` : ''}</div>
                    </div>
                    <button
                      onClick={() => manualAddToPool(v)}
                      disabled={alreadyIn || adding}
                      className={`ml-3 shrink-0 text-xs font-semibold px-3 py-1 rounded border transition-colors ${
                        alreadyIn
                          ? 'border-gray-200 text-gray-400 cursor-default'
                          : 'bg-primary text-white border-primary hover:opacity-90 disabled:opacity-50'
                      }`}
                    >
                      {adding ? '…' : alreadyIn ? 'In pool' : '+ Add'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          {manualResults.length === 0 && manualSearch && !manualSearching && (
            <p className="text-xs text-gray-400">No results. Try a different name or email.</p>
          )}
        </div>

        {/* Draw controls */}
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            onClick={runDraw}
            disabled={!canDraw}
            className="px-8 py-3 bg-primary text-white font-bold rounded-xl text-lg disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            {drawing ? 'Drawing…' : `Run Draw — ${rankLabel(nextRank)}`}
          </button>
          <button
            onClick={enterFullscreen}
            className="px-4 py-3 border border-gray-300 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50"
          >
            Fullscreen
          </button>
          {poolBuilt && (
            <button
              onClick={handleExport}
              className="px-4 py-3 border border-gray-300 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50"
            >
              Export
            </button>
          )}
          {winners.length > 0 && !resetConfirm && (
            <button
              onClick={() => setResetConfirm(true)}
              className="px-4 py-3 border border-red-300 text-red-600 text-sm font-semibold rounded-xl hover:bg-red-50"
            >
              Reset Draw
            </button>
          )}
          {resetConfirm && (
            <div className="w-full flex items-center justify-center gap-3 py-2 px-4 bg-red-50 border border-red-200 rounded-xl">
              <span className="text-sm text-red-700 font-medium">Delete all winners and restart?</span>
              <button
                onClick={resetDraw}
                className="text-sm font-semibold px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Yes, Reset
              </button>
              <button
                onClick={() => setResetConfirm(false)}
                className="text-sm font-semibold px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Winners list */}
        {winners.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">Winners</h2>
            {winners.map(w => {
              const isNew = w.id === newWinnerId
              return (
                <div
                  key={w.id}
                  className={`transition-opacity duration-500 ${isNew ? 'opacity-0' : 'opacity-100'}`}
                >
                  <div className={`bg-white rounded-xl border p-5 flex items-center gap-4 ${w.redrawn ? 'opacity-50' : 'border-gray-200'}`}>
                    <span className="text-3xl">{rankBadge(w.prize_rank)}</span>
                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold ${w.redrawn ? 'line-through text-gray-400' : 'text-gray-900'}`}>{w.name}</div>
                      <div className="text-sm text-gray-500 truncate">{w.email}</div>
                      {w.company_name && <div className="text-xs text-gray-400">{w.company_name} · {w.designation}</div>}
                      {w.redrawn && <span className="text-xs text-red-500 font-medium">Redrawn</span>}
                    </div>
                    <div className="text-right flex flex-col items-end gap-2">
                      <div className="text-xs text-gray-400">{rankLabel(w.prize_rank)}</div>
                      {!w.redrawn && poolBuilt && (
                        <button
                          onClick={() => redraw(w)}
                          className="text-xs text-red-500 border border-red-200 rounded px-2 py-0.5 hover:bg-red-50"
                        >
                          Redraw
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {poolBuilt && pool.length === 0 && (
          <p className="text-center text-gray-500 text-sm">No eligible visitors remaining in the pool.</p>
        )}
      </div>
    </div>
  )
}
