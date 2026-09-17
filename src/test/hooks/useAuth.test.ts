import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { Profile } from '../../lib/supabase'

// ── Supabase mock ─────────────────────────────────────────────────────────

type Session = { user: { id: string } }
type AuthCb = (event: string, session: Session | null) => void

const authState = vi.hoisted(() => ({
  cb: null as AuthCb | null,
  unsubscribe: vi.fn(),
  signOut: vi.fn().mockResolvedValue({ error: null }),
  profileData: null as Profile | null,
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: AuthCb) => {
        authState.cb = cb
        return { data: { subscription: { unsubscribe: authState.unsubscribe } } }
      },
      signOut: authState.signOut,
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: authState.profileData, error: null }),
        }),
      }),
    }),
  },
}))

const { useAuth } = await import('../../hooks/useAuth')

// ── helpers ───────────────────────────────────────────────────────────────

function makeProfile(role: 'visitor' | 'organizer'): Profile {
  return {
    id: 'u1', name: 'Test User', email: 'test@test.com', mobile: '',
    role, company_name: '', designation: '',
    social_linkedin: false, social_instagram: false, social_facebook: false,
  }
}

beforeEach(() => {
  authState.cb = null
  authState.profileData = null
  authState.unsubscribe.mockReset()
  authState.signOut.mockReset()
  authState.signOut.mockResolvedValue({ error: null })
})

// ── tests ─────────────────────────────────────────────────────────────────

describe('useAuth', () => {
  it('starts in loading state before any auth event fires', () => {
    const { result } = renderHook(() => useAuth())
    expect(result.current.loading).toBe(true)
    expect(result.current.profile).toBeNull()
  })

  it('sets loading=false and profile=null when the session is absent', () => {
    const { result } = renderHook(() => useAuth())
    act(() => authState.cb?.('SIGNED_OUT', null))
    expect(result.current.loading).toBe(false)
    expect(result.current.profile).toBeNull()
  })

  it('loads the profile from Supabase when a session is present', async () => {
    const profile = makeProfile('visitor')
    authState.profileData = profile
    const { result } = renderHook(() => useAuth())
    act(() => authState.cb?.('SIGNED_IN', { user: { id: 'u1' } }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.profile).toEqual(profile)
  })

  it('updates profile and clears loading when a different session fires', async () => {
    const organizer = makeProfile('organizer')
    authState.profileData = organizer
    const { result } = renderHook(() => useAuth())
    act(() => authState.cb?.('SIGNED_IN', { user: { id: 'u1' } }))
    await waitFor(() => expect(result.current.profile?.role).toBe('organizer'))
    expect(result.current.loading).toBe(false)
  })

  it('calls supabase.auth.signOut when signOut is invoked', async () => {
    const { result } = renderHook(() => useAuth())
    await act(() => result.current.signOut())
    expect(authState.signOut).toHaveBeenCalledTimes(1)
  })

  it('calls subscription.unsubscribe when the hook unmounts', () => {
    const { unmount } = renderHook(() => useAuth())
    unmount()
    expect(authState.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('exposes setProfile for direct profile updates without a Supabase round-trip', () => {
    const { result } = renderHook(() => useAuth())
    const profile = makeProfile('organizer')
    act(() => result.current.setProfile(profile))
    expect(result.current.profile).toEqual(profile)
  })
})
