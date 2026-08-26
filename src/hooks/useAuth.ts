import { useEffect, useState } from 'react'
import { supabase, type Profile } from '../lib/supabase'

type AuthState = {
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
  setProfile: (p: Profile) => void
}

export function useAuth(): AuthState {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(id: string) {
    const { data } = await supabase.from('profiles').select('*').eq('id', id).single()
    setProfile(data)
    setLoading(false)
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) loadProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
  }

  return { profile, loading, signOut, setProfile }
}
