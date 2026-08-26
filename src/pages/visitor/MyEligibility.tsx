import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useVisits } from '../../hooks/useVisits'
import { useExhibitors } from '../../hooks/useExhibitors'
import { checkEligibility, type EligibilityConfig } from '../../lib/eligibility'
import SocialFooter from '../../components/SocialFooter'

const SOCIAL_CHANNELS = [
  { key: 'social_linkedin' as const, label: 'LinkedIn' },
  { key: 'social_instagram' as const, label: 'Instagram' },
  { key: 'social_facebook' as const, label: 'Facebook' },
  { key: 'social_youtube' as const, label: 'YouTube' },
]

function Row({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
      <span className={`text-lg ${done ? 'text-green-500' : 'text-red-400'}`}>{done ? '✅' : '❌'}</span>
      <span className="text-sm text-gray-800">{label}</span>
    </div>
  )
}

export default function MyEligibility() {
  const { profile } = useAuth()
  const { visits } = useVisits(profile?.id ?? '')
  const { exhibitors } = useExhibitors()
  const navigate = useNavigate()
  const [config, setConfig] = useState<EligibilityConfig>({ minQualifyingDays: 2, minPlatinumVisits: 3, minTotalCheckins: 0 })

  useEffect(() => {
    supabase
      .from('settings')
      .select('key, value')
      .in('key', ['min_qualifying_days', 'min_platinum_visits', 'min_total_checkins'])
      .then(({ data }) => {
        if (!data) return
        const m = new Map(data.map(r => [r.key, r.value]))
        setConfig({
          minQualifyingDays: Number(m.get('min_qualifying_days') ?? 2),
          minPlatinumVisits: Number(m.get('min_platinum_visits') ?? 3),
          minTotalCheckins: Number(m.get('min_total_checkins') ?? 0),
        })
      })
  }, [])

  const platinumIds = new Set(exhibitors.filter(e => e.is_platinum).map(e => e.id))
  const exhibitorHallMap = new Map(exhibitors.map(e => [e.id, e.hall]))

  const visitInput = visits.map(v => ({
    exhibitor_id: v.exhibitor_id,
    hall: exhibitorHallMap.get(v.exhibitor_id) ?? '',
    day: v.day,
  }))

  const socialComplete = profile
    ? profile.social_linkedin && profile.social_instagram && profile.social_facebook && profile.social_youtube
    : false

  const result = checkEligibility({
    visits: visitInput,
    platinumIds,
    socialComplete,
    config,
  })

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-primary text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate('/')} className="text-white opacity-80 text-sm">← Back</button>
        <h1 className="text-lg font-bold">My Eligibility</h1>
      </header>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Overall status */}
        <div className={`rounded-xl border p-4 text-center font-semibold ${
          result.eligible
            ? 'bg-green-50 border-green-300 text-green-800'
            : 'bg-amber-50 border-amber-300 text-amber-800'
        }`}>
          {result.eligible
            ? 'You are eligible for the lucky draw!'
            : 'Complete the steps below to qualify'}
        </div>

        {/* Checklist */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <Row
            done={result.daysVisited >= config.minQualifyingDays}
            label={`Days attended: ${result.daysVisited} of ${config.minQualifyingDays} required`}
          />
          <Row
            done={result.hallsCovered.includes('Jasmine Halls')}
            label={`Jasmine Halls visited${result.hallsCovered.includes('Jasmine Halls') ? '' : ' (not yet)'}`}
          />
          <Row
            done={result.hallsCovered.includes('Pavilion Halls')}
            label={`Pavilion Halls visited${result.hallsCovered.includes('Pavilion Halls') ? '' : ' (not yet)'}`}
          />
          <Row
            done={result.platinumVisits >= config.minPlatinumVisits}
            label={`Platinum Partners: ${result.platinumVisits} of ${config.minPlatinumVisits} required`}
          />
          {SOCIAL_CHANNELS.map(({ key, label }) => (
            <Row
              key={key}
              done={profile ? !!profile[key] : false}
              label={`Follow on ${label}`}
            />
          ))}
        </div>
      </div>

      <SocialFooter />
    </div>
  )
}
