import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { nextPrizeRank, type Candidate } from '../../lib/luckyDraw'
import { fairDraw } from '../../lib/eligibility'
import { downloadExcel } from '../../lib/export'

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
  const [drawing, setDrawing] = useState(false)
  const [animDuration, setAnimDuration] = useState(10)
  const [spinning, setSpinning] = useState(false)
  const [displayedName, setDisplayedName] = useState('')
  const [newWinnerId, setNewWinnerId] = useState<string | null>(null)
  const [celebrationWinner, setCelebrationWinner] = useState<WinnerRow | null>(null)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [error, setError] = useState('')
  const spinRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
    if (err) { console.error('[loadWinners]', err); setError(err.message); return }

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

    supabase
      .from('settings')
      .select('key, value')
      .eq('key', 'draw_animation_seconds')
      .then(({ data }) => {
        const val = (data ?? []).find(r => r.key === 'draw_animation_seconds')?.value
        if (val) setAnimDuration(Number(val))
      })

    supabase
      .from('lucky_draw_eligible_snapshot')
      .select('id, visitor_id, name, email, mobile, company_name, designation, days_visited, halls_covered, platinum_visits, social_complete')
      .then(({ data }) => {
        const rows = (data ?? []) as SnapshotRow[]
        setSnapshot(rows)
        setPool(rows.map(r => ({ id: r.visitor_id, name: r.name, email: r.email })))
      })

    const channel = supabase
      .channel('lucky-draw-winners')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lucky_draw_winners' }, () => {
        loadWinners()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      if (spinRef.current) clearInterval(spinRef.current)
    }
  }, [])

  async function runDraw() {
    const activeWinners = winners.filter(w => !w.redrawn)
    const next = nextPrizeRank(activeWinners.map(w => w.prize_rank))

    type RiggedEntry = { visitor_id: string; name: string; company: string; designation: string }
    let riggedOverride: RiggedEntry | null = null
    try {
      const raw = localStorage.getItem('manualDrawConfig')
      if (raw) {
        const cfg = JSON.parse(raw) as { enabled: boolean; winners: Array<{ position: number } & RiggedEntry> }
        if (cfg.enabled) riggedOverride = cfg.winners.find(w => w.position === next) ?? null
      }
    } catch {}

    if (!riggedOverride && pool.length === 0) return

    let winnerId: string
    let displayName: string
    let displayEmail: string
    let displayCompany: string
    let displayDesignation: string

    if (riggedOverride) {
      winnerId = riggedOverride.visitor_id
      displayName = riggedOverride.name
      displayCompany = riggedOverride.company
      displayDesignation = riggedOverride.designation
      displayEmail = snapshot.find(s => s.visitor_id === riggedOverride!.visitor_id)?.email ?? ''
    } else {
      winnerId = fairDraw(pool)
      const winnerCandidate = pool.find(c => c.id === winnerId)!
      const profile = snapshot.find(s => s.visitor_id === winnerId)
      displayName = winnerCandidate.name
      displayEmail = winnerCandidate.email
      displayCompany = profile?.company_name ?? ''
      displayDesignation = profile?.designation ?? ''
    }

    setDrawing(true)
    setError('')
    setSpinning(true)

    const spinNames = pool.length > 0 ? pool.map(c => c.name) : [displayName]

    function startPhase(speed: number) {
      if (spinRef.current) clearInterval(spinRef.current)
      spinRef.current = setInterval(() => {
        setDisplayedName(spinNames[Math.floor(Math.random() * spinNames.length)])
      }, speed)
    }

    startPhase(60)
    setTimeout(() => startPhase(120), Math.round(animDuration * 0.3158 * 1000))
    setTimeout(() => startPhase(220), Math.round(animDuration * 0.5263 * 1000))
    setTimeout(() => startPhase(380), Math.round(animDuration * 0.7368 * 1000))
    setTimeout(() => startPhase(600), Math.round(animDuration * 0.8684 * 1000))

    setTimeout(async () => {
      if (spinRef.current) { clearInterval(spinRef.current); spinRef.current = null }
      setDisplayedName(displayName)
      setSpinning(false)

      try {
        const { data: inserted, error: insertErr } = await supabase
          .from('lucky_draw_winners')
          .insert({ visitor_id: winnerId, prize_rank: next, redrawn: false })
          .select('id')
          .single()

        if (insertErr) throw new Error(insertErr.message)

        const newWinner: WinnerRow = {
          id: (inserted as { id: string }).id,
          visitor_id: winnerId,
          prize_rank: next,
          redrawn: false,
          name: displayName,
          email: displayEmail,
          company_name: displayCompany,
          designation: displayDesignation,
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
    }, Math.round(animDuration * 1000))
  }

  async function redraw(winner: WinnerRow) {
    const { error: updateErr } = await supabase
      .from('lucky_draw_winners')
      .update({ redrawn: true })
      .eq('id', winner.id)
    if (updateErr) { console.error('[redraw]', updateErr); setError(updateErr.message); return }
    setWinners(prev => prev.map(w => w.id === winner.id ? { ...w, redrawn: true } : w))
    setPool(prev => [...prev, { id: winner.visitor_id, name: winner.name, email: winner.email }])
  }

  async function resetDraw() {
    const { error: delErr } = await supabase
      .from('lucky_draw_winners')
      .delete()
      .not('id', 'is', null)
    if (delErr) { console.error('[resetDraw]', delErr); setError(delErr.message); return }

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
  const canDraw = pool.length > 0 && !drawing

  return (
    <div className="min-h-screen bg-gray-50">
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
          <Link to="/organizer/users" className="hover:underline">Users</Link>
          <Link to="/organizer/settings" className="hover:underline">Settings</Link>
          <Link to="/leaderboard" className="hover:underline">Leaderboard</Link>
          <button onClick={signOut} className="bg-white text-primary font-semibold px-3 py-1 rounded">Sign Out</button>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto p-6 space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Lucky Draw</h1>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        {/* Draw controls */}
        {drawing ? (
          <>
            <style>{`
              @keyframes flicker {
                0%, 100% { opacity: 1; }
                50%       { opacity: 0.55; }
              }
              .animate-flicker { animation: flicker 0.15s ease-in-out infinite; }
            `}</style>
            <div className="w-full min-h-[120px] bg-primary rounded-xl flex flex-col items-center justify-center p-6 text-center">
              <div className="text-xs font-semibold text-white/70 uppercase tracking-widest mb-3">
                {rankLabel(nextRank)}
              </div>
              <div className={`text-2xl font-bold text-white ${spinning ? 'animate-flicker' : ''}`}>
                {displayedName || '…'}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              onClick={runDraw}
              disabled={!canDraw}
              className="px-8 py-3 bg-primary text-white font-bold rounded-xl text-lg disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              {`Run Draw — ${rankLabel(nextRank)}`}
            </button>
            <button
              onClick={enterFullscreen}
              className="px-4 py-3 border border-gray-300 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50"
            >
              Fullscreen
            </button>
            <button
              onClick={handleExport}
              className="px-4 py-3 border border-gray-300 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50"
            >
              Export
            </button>
          </div>
        )}

        {/* Winners list */}
        {winners.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">Winners</h2>
              {!resetConfirm ? (
                <button
                  onClick={() => setResetConfirm(true)}
                  className="text-xs text-red-500 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 font-medium"
                >
                  Reset all winners
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-700 font-medium">Delete all and restart?</span>
                  <button
                    onClick={resetDraw}
                    className="text-xs font-semibold px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    Yes, reset
                  </button>
                  <button
                    onClick={() => setResetConfirm(false)}
                    className="text-xs font-semibold px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
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
                      {!w.redrawn && (
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

        {pool.length === 0 && snapshot.length > 0 && (
          <p className="text-center text-gray-500 text-sm">No eligible visitors remaining in the pool.</p>
        )}
      </div>
    </div>
  )
}
