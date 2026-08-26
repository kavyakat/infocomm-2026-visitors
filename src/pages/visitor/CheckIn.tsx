import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { db } from '../../lib/db'
import { flushVisitQueue } from '../../lib/sync'
import { verifyPin } from '../../lib/pins'
import { getCurrentEventDay } from '../../lib/eventDay'
import NumPad from '../../components/NumPad'
import StarRating from '../../components/StarRating'
import SocialFooter from '../../components/SocialFooter'

type Step = 'pin' | 'rating' | 'confirmation'

export default function CheckIn() {
  const { exhibitorId } = useParams<{ exhibitorId: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [pin, setPin] = useState('')
  const [step, setStep] = useState<Step>('pin')
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [confirmedExhibitorName, setConfirmedExhibitorName] = useState('')
  const [visitId] = useState(() => crypto.randomUUID())
  const [visitTime] = useState(() => new Date())

  async function handleConfirmPin() {
    if (!exhibitorId || !profile || confirming) return
    setConfirming(true)
    setError('')

    const exhibitor = await db.exhibitors.get(exhibitorId)
    if (!exhibitor) { setError('Exhibitor not found'); setConfirming(false); return }

    const valid = await verifyPin(pin, exhibitor.pin_hash)
    if (!valid) { setError('Incorrect PIN. Please try again.'); setPin(''); setConfirming(false); return }

    const existing = await db.visits
      .where('visitor_id').equals(profile.id)
      .and(v => v.exhibitor_id === exhibitorId)
      .first()

    if (existing) {
      const date = new Date(existing.visited_at).toLocaleDateString()
      setError(`You already visited this exhibitor on ${date}.`)
      setConfirming(false)
      return
    }

    setConfirmedExhibitorName(exhibitor.name)
    setConfirming(false)
    setStep('rating')
  }

  async function saveVisit(rating: number | null) {
    if (!exhibitorId || !profile) return

    await db.visits.put({
      id: visitId,
      visitor_id: profile.id,
      exhibitor_id: exhibitorId,
      visited_at: visitTime.toISOString(),
      day: getCurrentEventDay(),
      rating,
      synced: false,
    })

    flushVisitQueue()
    setStep('confirmation')
  }

  if (step === 'confirmation') {
    return (
      <div className="min-h-screen bg-primary flex flex-col items-center justify-center p-8 text-white text-center">
        <div className="text-6xl mb-6">✓</div>
        <h2 className="text-2xl font-bold mb-2">Visit Recorded!</h2>
        <p className="text-lg font-medium opacity-90">{confirmedExhibitorName}</p>
        <p className="text-sm opacity-70 mt-1">
          {visitTime.toLocaleDateString()} · {visitTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
        <button
          onClick={() => navigate('/')}
          className="mt-10 bg-white text-primary rounded-xl px-8 py-3 font-semibold"
        >
          Back to Exhibitor List
        </button>
      </div>
    )
  }

  if (step === 'rating') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8">
        <StarRating onRate={stars => saveVisit(stars)} onSkip={() => saveVisit(null)} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white p-6 pb-20">
      <button onClick={() => navigate(-1)} className="text-primary text-sm mb-6">← Back</button>
      <h2 className="text-xl font-bold text-gray-800 mb-2">Enter Exhibitor PIN</h2>
      <p className="text-sm text-gray-500 mb-8">Ask the exhibitor to enter their 4-digit PIN</p>
      <NumPad value={pin} onChange={setPin} onConfirm={handleConfirmPin} error={error} disabled={confirming} />
      <SocialFooter />
    </div>
  )
}
