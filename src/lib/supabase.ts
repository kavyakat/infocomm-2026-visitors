import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

export type Profile = {
  id: string
  name: string
  email: string
  mobile: string
  role: 'visitor' | 'organizer'
  company_name: string
  designation: string
  social_linkedin: boolean
  social_instagram: boolean
  social_facebook: boolean
  social_youtube: boolean
}

export type Exhibitor = {
  id: string
  name: string
  booth_number: string
  hall: string
  pin: string
  is_platinum: boolean
  created_at: string
}

export type Visit = {
  id: string
  visitor_id: string
  exhibitor_id: string
  visited_at: string
  day: 1 | 2 | 3
  rating: number | null
}
