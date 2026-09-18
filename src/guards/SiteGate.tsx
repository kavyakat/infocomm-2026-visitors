import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function SiteGate({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<boolean | null>(null)

  useEffect(() => {
    supabase
      .from('settings')
      .select('value')
      .eq('key', 'registration_open')
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error('[SiteGate] could not read settings:', error.message)
        setOpen(error ? true : data?.value === 'true')
      })
  }, [])

  if (open === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!open) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3 uppercase tracking-wide">
          The InfoComm India 2026 Lucky Draw is now over!
        </h1>
        <p className="text-gray-600 text-sm max-w-sm mb-4">
          Thank you to everyone who participated and made their way across the show floor.
        </p>
        <p className="text-gray-500 text-sm max-w-sm mb-1">
          Missed your chance this time?<br />
          Come back to InfoComm India next year for another chance to win.
        </p>
        <p className="text-primary font-semibold text-sm mt-4">See you in 2027!</p>
      </div>
    )
  }

  return <>{children}</>
}
