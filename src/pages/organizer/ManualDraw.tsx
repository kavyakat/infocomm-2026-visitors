import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

type VisitorRow = {
  id: string
  name: string
  company_name: string
  designation: string
  visitCount: number
}

type ConfigWinner = {
  position: number
  visitor_id: string
  name: string
  company: string
  designation: string
}

const POSITIONS = [1, 2, 3] as const
const LABELS: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd' }

function persistConfig(enabled: boolean, picks: Record<string, number>, visitors: VisitorRow[]) {
  const winners: ConfigWinner[] = Object.entries(picks).map(([vid, pos]) => {
    const v = visitors.find(r => r.id === vid)
    return { position: pos, visitor_id: vid, name: v?.name ?? '', company: v?.company_name ?? '', designation: v?.designation ?? '' }
  })
  localStorage.setItem('manualDrawConfig', JSON.stringify({ enabled, winners }))
}

export default function ManualDraw() {
  const [visitors, setVisitors] = useState<VisitorRow[]>([])
  const [picks, setPicks] = useState<Record<string, number>>({})
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const [profilesRes, visitsRes] = await Promise.all([
        supabase.from('profiles').select('id, name, company_name, designation').eq('role', 'visitor'),
        supabase.from('visits').select('visitor_id'),
      ])
      if (profilesRes.error) { setError(profilesRes.error.message); setLoading(false); return }

      const countMap = new Map<string, number>()
      for (const v of (visitsRes.data ?? []) as { visitor_id: string }[]) {
        countMap.set(v.visitor_id, (countMap.get(v.visitor_id) ?? 0) + 1)
      }

      const rows = ((profilesRes.data ?? []) as { id: string; name: string; company_name: string; designation: string }[])
        .map(p => ({ ...p, visitCount: countMap.get(p.id) ?? 0 }))
        .sort((a, b) => b.visitCount - a.visitCount)

      setVisitors(rows)

      try {
        const raw = localStorage.getItem('manualDrawConfig')
        if (raw) {
          const cfg = JSON.parse(raw) as { enabled: boolean; winners: ConfigWinner[] }
          const restored: Record<string, number> = {}
          for (const w of cfg.winners ?? []) restored[w.visitor_id] = w.position
          setPicks(restored)
          setEnabled(cfg.enabled ?? false)
        }
      } catch {}

      setLoading(false)
    }
    load()
  }, [])

  function save() {
    persistConfig(enabled, picks, visitors)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function assign(visitorId: string, position: number) {
    setPicks(prev => {
      const next = { ...prev }
      for (const [vid, pos] of Object.entries(next)) {
        if (pos === position) delete next[vid]
      }
      if (prev[visitorId] !== position) next[visitorId] = position
      return next
    })
  }

  function clearAll() {
    setPicks({})
    setEnabled(false)
    localStorage.removeItem('manualDrawConfig')
  }

  const assignedCount = Object.keys(picks).length
  const filtered = visitors
    .filter(v =>
      !search.trim() ||
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      v.company_name.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const pa = picks[a.id] ?? Infinity
      const pb = picks[b.id] ?? Infinity
      if (pa !== pb) return pa - pb
      return b.visitCount - a.visitCount
    })

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-primary text-white px-6 py-3 flex items-center justify-between">
        <span className="font-semibold text-sm">Lucky Draw</span>
        <Link to="/organizer/draw" className="text-xs opacity-75 hover:opacity-100">← Live Draw</Link>
      </nav>

      <div className="max-w-2xl mx-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Select Winners</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-white hover:opacity-90"
            >
              {saved ? 'Saved ✓' : 'Save'}
            </button>
            {assignedCount > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-gray-500 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 font-medium"
              >
                Clear All
              </button>
            )}
          </div>
        </div>

        {assignedCount > 0 && (
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none bg-white border border-gray-200 rounded-xl px-4 py-3">
            <input
              type="checkbox"
              checked={enabled}
              onChange={e => {
                setEnabled(e.target.checked)
              }}
              className="rounded accent-primary"
            />
            Use selected winners for live draw
          </label>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <input
          type="search"
          placeholder="Search by name or company…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />

        {loading ? (
          <p className="text-sm text-gray-400 text-center py-8">Loading visitors…</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {filtered.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No visitors found.</p>
            )}
            {filtered.map(v => {
              const currentPos = picks[v.id]
              return (
                <div key={v.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{v.name}</div>
                    <div className="text-xs text-gray-400 truncate">
                      {v.company_name}{v.designation ? ` · ${v.designation}` : ''}
                    </div>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${v.visitCount > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                    {v.visitCount} visit{v.visitCount !== 1 ? 's' : ''}
                  </span>
                  <div className="flex gap-1 shrink-0">
                    {POSITIONS.map(pos => (
                      <button
                        key={pos}
                        onClick={() => assign(v.id, pos)}
                        className={`text-xs font-semibold px-2 py-1 rounded transition-colors ${
                          currentPos === pos
                            ? 'bg-primary text-white'
                            : 'border border-gray-300 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {LABELS[pos]}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
