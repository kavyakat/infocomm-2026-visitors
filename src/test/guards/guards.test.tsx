import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Profile } from '../../lib/supabase'

// ── useAuth mock (OrganizerRoute + VisitorRoute) ──────────────────────────

const mockUseAuth = vi.hoisted(() => vi.fn())

vi.mock('../../hooks/useAuth', () => ({ useAuth: mockUseAuth }))

// ── react-router-dom Navigate mock ───────────────────────────────────────

vi.mock('react-router-dom', () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="redirect" data-to={to} />,
}))

// ── Supabase mock (SiteGate) ──────────────────────────────────────────────

type SettingsResult = { data: { value: string } | null; error: { message: string } | null }
let settingsPromise: Promise<SettingsResult> = Promise.resolve({ data: { value: 'true' }, error: null })

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => settingsPromise }),
      }),
    }),
  },
}))

// ── imports (after mocks) ─────────────────────────────────────────────────

import OrganizerRoute from '../../guards/OrganizerRoute'
import VisitorRoute from '../../guards/VisitorRoute'
import SiteGate from '../../guards/SiteGate'

// ── helpers ───────────────────────────────────────────────────────────────

function makeProfile(role: 'visitor' | 'organizer'): Profile {
  return {
    id: 'u1', name: 'Test User', email: 'test@test.com', mobile: '',
    role, company_name: '', designation: '',
    social_linkedin: false, social_instagram: false, social_facebook: false,
  }
}

beforeEach(() => {
  mockUseAuth.mockReset()
  settingsPromise = new Promise(() => {}) // deferred by default; override per test
})

// ── OrganizerRoute ────────────────────────────────────────────────────────

describe('OrganizerRoute', () => {
  it('shows spinner while auth is loading', () => {
    mockUseAuth.mockReturnValue({ profile: null, loading: true })
    const { container } = render(<OrganizerRoute><span>content</span></OrganizerRoute>)
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    expect(screen.queryByText('content')).not.toBeInTheDocument()
  })

  it('redirects to /organizer/login when there is no profile', () => {
    mockUseAuth.mockReturnValue({ profile: null, loading: false })
    render(<OrganizerRoute><span>content</span></OrganizerRoute>)
    expect(screen.getByTestId('redirect')).toHaveAttribute('data-to', '/organizer/login')
  })

  it('redirects to / when profile role is visitor', () => {
    mockUseAuth.mockReturnValue({ profile: makeProfile('visitor'), loading: false })
    render(<OrganizerRoute><span>content</span></OrganizerRoute>)
    expect(screen.getByTestId('redirect')).toHaveAttribute('data-to', '/')
  })

  it('renders children when profile role is organizer', () => {
    mockUseAuth.mockReturnValue({ profile: makeProfile('organizer'), loading: false })
    render(<OrganizerRoute><span>organizer content</span></OrganizerRoute>)
    expect(screen.getByText('organizer content')).toBeInTheDocument()
    expect(screen.queryByTestId('redirect')).not.toBeInTheDocument()
  })
})

// ── VisitorRoute ──────────────────────────────────────────────────────────

describe('VisitorRoute', () => {
  it('shows spinner while auth is loading', () => {
    mockUseAuth.mockReturnValue({ profile: null, loading: true })
    const { container } = render(<VisitorRoute><span>content</span></VisitorRoute>)
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    expect(screen.queryByText('content')).not.toBeInTheDocument()
  })

  it('redirects to /login when there is no profile', () => {
    mockUseAuth.mockReturnValue({ profile: null, loading: false })
    render(<VisitorRoute><span>content</span></VisitorRoute>)
    expect(screen.getByTestId('redirect')).toHaveAttribute('data-to', '/login')
  })

  it('redirects to /organizer when profile role is organizer', () => {
    mockUseAuth.mockReturnValue({ profile: makeProfile('organizer'), loading: false })
    render(<VisitorRoute><span>content</span></VisitorRoute>)
    expect(screen.getByTestId('redirect')).toHaveAttribute('data-to', '/organizer')
  })

  it('renders children when profile role is visitor', () => {
    mockUseAuth.mockReturnValue({ profile: makeProfile('visitor'), loading: false })
    render(<VisitorRoute><span>visitor content</span></VisitorRoute>)
    expect(screen.getByText('visitor content')).toBeInTheDocument()
    expect(screen.queryByTestId('redirect')).not.toBeInTheDocument()
  })
})

// ── SiteGate ──────────────────────────────────────────────────────────────

describe('SiteGate', () => {
  it('shows spinner while the settings query is in flight', () => {
    // settingsPromise is a never-resolving deferred from beforeEach
    const { container } = render(<SiteGate><span>content</span></SiteGate>)
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    expect(screen.queryByText('content')).not.toBeInTheDocument()
  })

  it('renders children when registration_open is true', async () => {
    settingsPromise = Promise.resolve({ data: { value: 'true' }, error: null })
    render(<SiteGate><span>gated content</span></SiteGate>)
    await screen.findByText('gated content')
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument()
  })

  it('shows the closed message when registration_open is false', async () => {
    settingsPromise = Promise.resolve({ data: { value: 'false' }, error: null })
    render(<SiteGate><span>gated content</span></SiteGate>)
    await screen.findByText('Coming soon')
    expect(screen.queryByText('gated content')).not.toBeInTheDocument()
  })

  it('renders children when the settings query errors (fail-open)', async () => {
    settingsPromise = Promise.resolve({ data: null, error: { message: 'network error' } })
    render(<SiteGate><span>gated content</span></SiteGate>)
    await screen.findByText('gated content')
  })
})
