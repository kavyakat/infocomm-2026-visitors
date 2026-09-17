import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { buildCandidates } from '../../lib/luckyDraw'
import { checkEligibility, type EligibilityConfig } from '../../lib/eligibility'

export default function Settings() {
  const { signOut } = useAuth()
  const [minDays, setMinDays] = useState(2)
  const [minPlatinum, setMinPlatinum] = useState(3)
  const [minCheckins, setMinCheckins] = useState(0)
  const [eventDay, setEventDay] = useState<1 | 2 | 3>(1)
  const [overrideDay, setOverrideDay] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [siteOpen, setSiteOpen] = useState(false)
  const [siteOpenSaving, setSiteOpenSaving] = useState(false)
  const [animSeconds, setAnimSeconds] = useState(10)

  const [poolCount, setPoolCount] = useState<number | null>(null)
  const [poolBuilding, setPoolBuilding] = useState(false)
  const [poolBuildError, setPoolBuildError] = useState('')
  const [poolSearch, setPoolSearch] = useState('')
  const [poolResults, setPoolResults] = useState<Array<{ id: string; name: string; email: string; company_name: string; designation: string }>>([])
  const [poolSearching, setPoolSearching] = useState(false)
  const [poolAdding, setPoolAdding] = useState<Set<string>>(new Set())

  useEffect(() => {
    supabase
      .from('settings')
      .select('key, value')
      .in('key', ['min_qualifying_days', 'min_platinum_visits', 'min_total_checkins', 'current_event_day', 'event_day_override_enabled', 'registration_open', 'draw_animation_seconds'])
      .then(({ data }) => {
        if (!data) return
        const m = new Map(data.map(r => [r.key, r.value]))
        setMinDays(Number(m.get('min_qualifying_days') ?? 2))
        setMinPlatinum(Number(m.get('min_platinum_visits') ?? 3))
        setMinCheckins(Number(m.get('min_total_checkins') ?? 0))
        const d = Number(m.get('current_event_day') ?? 1)
        setEventDay((d >= 1 && d <= 3 ? d : 1) as 1 | 2 | 3)
        setOverrideDay(m.get('event_day_override_enabled') === 'true')
        setSiteOpen(m.get('registration_open') === 'true')
        setAnimSeconds(Number(m.get('draw_animation_seconds') ?? 10))
      })
  }, [])

  useEffect(() => {
    supabase.from('lucky_draw_eligible_snapshot').select('id').then(({ data }) => {
      setPoolCount((data ?? []).length)
    })
  }, [])

  async function toggleSiteOpen() {
    const next = !siteOpen
    setSiteOpenSaving(true)
    const { error: err } = await supabase.from('settings').upsert([{ key: 'registration_open', value: String(next) }])
    if (!err) setSiteOpen(next)
    setSiteOpenSaving(false)
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError('')

    const { error: upsertErr } = await supabase.from('settings').upsert([
      { key: 'min_qualifying_days', value: String(minDays) },
      { key: 'min_platinum_visits', value: String(minPlatinum) },
      { key: 'min_total_checkins', value: String(minCheckins) },
      { key: 'current_event_day', value: String(eventDay) },
      { key: 'event_day_override_enabled', value: String(overrideDay) },
      { key: 'draw_animation_seconds', value: String(animSeconds) },
    ])

    if (upsertErr) {
      setError(upsertErr.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
    setSaving(false)
  }

  async function buildPool() {
    setPoolBuilding(true)
    setPoolBuildError('')
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
      const byVisitor = new Map<string, Array<{ exhibitor_id: string; hall: string; day: 1|2|3 }>>()
      for (const v of flatVisits) {
        if (!byVisitor.has(v.visitor_id)) byVisitor.set(v.visitor_id, [])
        byVisitor.get(v.visitor_id)!.push({ exhibitor_id: v.exhibitor_id, hall: v.hall, day: v.day })
      }

      const candidates = buildCandidates(flatVisits, profileMap, platinumIds, socialByVisitor, config)
      const snapshotRows = candidates.map(c => {
        const visits = byVisitor.get(c.id) ?? []
        const result = checkEligibility({ visits, platinumIds, socialComplete: socialByVisitor.get(c.id) ?? false, config })
        const profile = profiles.find(p => p.id === c.id)
        return {
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
        }
      })

      await supabase.from('lucky_draw_eligible_snapshot').delete().gte('created_at', '1970-01-01')
      if (snapshotRows.length > 0) {
        const { error: insertErr } = await supabase.from('lucky_draw_eligible_snapshot').insert(snapshotRows)
        if (insertErr) throw new Error(insertErr.message)
      }
      setPoolCount(snapshotRows.length)
    } catch (e) {
      setPoolBuildError(String(e))
    } finally {
      setPoolBuilding(false)
    }
  }

  async function searchPoolVisitors() {
    if (!poolSearch.trim()) return
    setPoolSearching(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, name, email, company_name, designation')
      .eq('role', 'visitor')
      .or(`name.ilike.%${poolSearch.trim()}%,email.ilike.%${poolSearch.trim()}%`)
      .limit(8)
    setPoolResults((data ?? []) as Array<{ id: string; name: string; email: string; company_name: string; designation: string }>)
    setPoolSearching(false)
  }

  async function manualAddToPool(v: { id: string; name: string; email: string; company_name: string; designation: string }) {
    setPoolAdding(prev => new Set(prev).add(v.id))
    setPoolBuildError('')
    try {
      const { error: insertErr } = await supabase
        .from('lucky_draw_eligible_snapshot')
        .insert({
          visitor_id: v.id, name: v.name, email: v.email, mobile: '',
          company_name: v.company_name, designation: v.designation,
          days_visited: 0, halls_covered: 'Manual override', platinum_visits: 0, social_complete: false,
        })
      if (insertErr) { setPoolBuildError(insertErr.message); return }
      setPoolCount(prev => (prev ?? 0) + 1)
      setPoolResults(prev => prev.filter(r => r.id !== v.id))
    } finally {
      setPoolAdding(prev => { const n = new Set(prev); n.delete(v.id); return n })
    }
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
          <Link to="/organizer/users" className="hover:underline">Users</Link>
          <Link to="/organizer/settings" className="underline">Settings</Link>
          <Link to="/leaderboard" className="hover:underline">Leaderboard</Link>
          <button onClick={signOut} className="bg-white text-primary font-semibold px-3 py-1 rounded">Sign Out</button>
        </div>
      </nav>

      <div className="max-w-lg mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

        <div className={`rounded-xl border-2 p-5 flex items-center justify-between gap-4 ${siteOpen ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-white'}`}>
          <div>
            <p className="font-semibold text-gray-900">Visitor registration</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {siteOpen
                ? 'Site is live — visitors can register, log in, and check in.'
                : 'Site is closed — visitors see a "coming soon" page.'}
            </p>
          </div>
          <button
            onClick={toggleSiteOpen}
            disabled={siteOpenSaving}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${siteOpen ? 'bg-green-500' : 'bg-gray-300'}`}
          >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform duration-200 ${siteOpen ? 'translate-x-5' : 'translate-x-0'}`}
            />
          </button>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-800">Draw settings</h2>
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
            <label className="flex items-center gap-2 mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={overrideDay}
                onChange={e => setOverrideDay(e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm text-gray-600">Override event day</span>
            </label>
            <div className={`flex gap-3 transition-opacity ${overrideDay ? '' : 'opacity-40 pointer-events-none'}`}>
              {([1, 2, 3] as const).map(d => (
                <button
                  key={d}
                  type="button"
                  disabled={!overrideDay}
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
            <p className="text-xs text-gray-400 mt-1">
              {overrideDay
                ? 'All new check-ins will be recorded against this day'
                : 'Event day is auto-detected from the date — check the box to override'}
            </p>
          </div>

        </div>

        {/* Draw Pool */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-800">Draw Pool</h2>
            <span className="text-sm text-gray-500">
              {poolCount === null ? '…' : `${poolCount} visitor${poolCount !== 1 ? 's' : ''} in pool`}
            </span>
          </div>

          {poolBuildError && <p className="text-sm text-red-600">{poolBuildError}</p>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Draw animation duration (seconds)
            </label>
            <input
              type="number"
              min={3}
              max={30}
              value={animSeconds}
              onChange={e => setAnimSeconds(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-gray-400 mt-1">Slot-machine spin duration (3–30 s). Save Settings to apply.</p>
          </div>

          <button
            onClick={buildPool}
            disabled={poolBuilding}
            className="w-full bg-primary text-white rounded-lg py-2.5 font-semibold text-sm disabled:opacity-50 hover:opacity-90"
          >
            {poolBuilding ? 'Building…' : 'Build Eligible Pool'}
          </button>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Add Visitor Manually</p>
            <div className="flex gap-2">
              <input
                type="search"
                placeholder="Search by name or email…"
                value={poolSearch}
                onChange={e => setPoolSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') searchPoolVisitors() }}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                onClick={searchPoolVisitors}
                disabled={poolSearching || !poolSearch.trim()}
                className="bg-primary text-white text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {poolSearching ? '…' : 'Search'}
              </button>
            </div>
            {poolResults.length > 0 && (
              <div className="mt-2 divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
                {poolResults.map(v => {
                  const adding = poolAdding.has(v.id)
                  return (
                    <div key={v.id} className="flex items-center justify-between px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{v.name}</div>
                        <div className="text-xs text-gray-500 truncate">{v.email}{v.company_name ? ` · ${v.company_name}` : ''}</div>
                      </div>
                      <button
                        onClick={() => manualAddToPool(v)}
                        disabled={adding}
                        className="ml-3 shrink-0 text-xs font-semibold px-3 py-1 rounded bg-primary text-white border-primary hover:opacity-90 disabled:opacity-50"
                      >
                        {adding ? '…' : '+ Add'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            {poolResults.length === 0 && poolSearch && !poolSearching && (
              <p className="text-xs text-gray-400 mt-2">No results. Try a different name or email.</p>
            )}
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-primary text-white rounded-lg py-3 font-semibold disabled:opacity-50"
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Settings'}
        </button>

      </div>
    </div>
  )
}
