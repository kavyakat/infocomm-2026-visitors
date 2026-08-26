import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

export default function Settings() {
  const { signOut } = useAuth()
  const [minDays, setMinDays] = useState(2)
  const [minPlatinum, setMinPlatinum] = useState(3)
  const [minCheckins, setMinCheckins] = useState(0)
  const [eventDay, setEventDay] = useState<1 | 2 | 3>(1)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('settings')
      .select('key, value')
      .in('key', ['min_qualifying_days', 'min_platinum_visits', 'min_total_checkins', 'current_event_day'])
      .then(({ data }) => {
        if (!data) return
        const m = new Map(data.map(r => [r.key, r.value]))
        setMinDays(Number(m.get('min_qualifying_days') ?? 2))
        setMinPlatinum(Number(m.get('min_platinum_visits') ?? 3))
        setMinCheckins(Number(m.get('min_total_checkins') ?? 0))
        const d = Number(m.get('current_event_day') ?? 1)
        setEventDay((d >= 1 && d <= 3 ? d : 1) as 1 | 2 | 3)
      })
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setError('')

    const { error: upsertErr } = await supabase.from('settings').upsert([
      { key: 'min_qualifying_days', value: String(minDays) },
      { key: 'min_platinum_visits', value: String(minPlatinum) },
      { key: 'min_total_checkins', value: String(minCheckins) },
      { key: 'current_event_day', value: String(eventDay) },
    ])

    if (upsertErr) {
      setError(upsertErr.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-primary text-white px-6 py-3 flex items-center justify-between">
        <span className="font-bold">InfoComm India 2026 — Organizer</span>
        <div className="flex items-center gap-4 text-sm">
          <Link to="/organizer" className="hover:underline">Exhibitors</Link>
          <Link to="/organizer/feed" className="hover:underline">Feed</Link>
          <Link to="/organizer/analytics" className="hover:underline">Analytics</Link>
          <Link to="/organizer/draw" className="hover:underline">Lucky Draw</Link>
          <Link to="/organizer/settings" className="underline">Settings</Link>
          <Link to="/leaderboard" className="hover:underline">Leaderboard</Link>
          <button onClick={signOut} className="bg-white text-primary font-semibold px-3 py-1 rounded">Sign Out</button>
        </div>
      </nav>

      <div className="max-w-lg mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Draw Settings</h1>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <form onSubmit={handleSave} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Minimum qualifying days
            </label>
            <input
              type="number"
              min={1}
              max={3}
              required
              value={minDays}
              onChange={e => setMinDays(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-gray-400 mt-1">Number of distinct event days with at least one check-in (1–3)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Minimum Platinum Partner visits
            </label>
            <input
              type="number"
              min={0}
              required
              value={minPlatinum}
              onChange={e => setMinPlatinum(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Minimum total check-ins
            </label>
            <input
              type="number"
              min={0}
              required
              value={minCheckins}
              onChange={e => setMinCheckins(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-gray-400 mt-1">0 = no minimum</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Current event day
            </label>
            <div className="flex gap-3">
              {([1, 2, 3] as const).map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setEventDay(d)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                    eventDay === d
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Day {d}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">All new check-ins will be recorded against this day</p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-primary text-white rounded-lg py-3 font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Settings'}
          </button>
        </form>
      </div>
    </div>
  )
}
