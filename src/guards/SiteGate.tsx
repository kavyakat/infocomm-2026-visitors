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
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Coming soon</h1>
        <p className="text-gray-500 text-sm max-w-xs">
          Registration for InfoComm India 2026 is not open yet. Check back closer to the event.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
