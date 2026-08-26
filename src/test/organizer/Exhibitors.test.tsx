import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { parseExhibitorCsv } from '../../lib/exhibitors'

// ── parseExhibitorCsv ──────────────────────────────────────────────────────

describe('parseExhibitorCsv', () => {
  it('parses a well-formed CSV, skipping the header', () => {
    const csv = 'name,booth_number,hall\nABSEN,TF10,Hall 1\nSamsung,TF20,Hall 2'
    const rows = parseExhibitorCsv(csv)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ name: 'ABSEN', booth_number: 'TF10', hall: 'Hall 1', is_platinum: false })
    expect(rows[1]).toEqual({ name: 'Samsung', booth_number: 'TF20', hall: 'Hall 2', is_platinum: false })
  })

  it('skips rows missing required fields', () => {
    const csv = 'name,booth_number,hall\nABSEN,TF10,Hall 1\n,TF20,Hall 2\nSamsung,,\n'
    const rows = parseExhibitorCsv(csv)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('ABSEN')
  })

  it('trims whitespace from fields', () => {
    const csv = 'name,booth_number,hall\n ABSEN , TF10 , Hall 1 '
    const rows = parseExhibitorCsv(csv)
    expect(rows[0]).toEqual({ name: 'ABSEN', booth_number: 'TF10', hall: 'Hall 1', is_platinum: false })
  })

  it('returns empty array when only header is present', () => {
    const csv = 'name,booth_number,hall'
    expect(parseExhibitorCsv(csv)).toHaveLength(0)
  })

  it('parses is_platinum column (true and 1 map to true; false and 0 map to false)', () => {
    const csv = 'name,booth_number,hall,is_platinum\nBenQ,A1,Jasmine Hall,true\nCrestron,A2,Pavilion Hall,1\nEpson,A3,Jasmine Hall,false\nHarman,A4,Pavilion Hall,0'
    const rows = parseExhibitorCsv(csv)
    expect(rows[0].is_platinum).toBe(true)
    expect(rows[1].is_platinum).toBe(true)
    expect(rows[2].is_platinum).toBe(false)
    expect(rows[3].is_platinum).toBe(false)
  })
})

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../lib/supabase', () => {
  const mockEq = vi.fn().mockResolvedValue({ error: null })
  const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null })
  const mockSelect = vi.fn(() => ({ order: mockOrder }))
  const mockInsert = vi.fn().mockResolvedValue({ error: null })
  const mockUpdate = vi.fn(() => ({ eq: mockEq }))
  const mockFrom = vi.fn(() => ({ select: mockSelect, insert: mockInsert, update: mockUpdate }))
  return {
    supabase: {
      from: mockFrom,
      auth: {
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      },
    },
  }
})

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ profile: { role: 'organizer' }, loading: false, signOut: vi.fn() }),
}))

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

// ── CSV import with PIN deduplication ─────────────────────────────────────

describe('CSV import deduplicates PINs', () => {
  it('assigns unique PINs when inserting multiple rows', async () => {
    const { supabase } = await import('../../lib/supabase')
    const mockFrom = vi.mocked(supabase.from)

    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn(() => ({ eq: mockEq }))
    const mockSelect = vi.fn(() => ({ order: mockOrder }))
    mockFrom.mockReturnValue({ select: mockSelect, insert: mockInsert, update: mockUpdate } as never)

    const { default: Exhibitors } = await import('../../pages/organizer/Exhibitors')
    const { container } = render(<Exhibitors />)

    await waitFor(() => expect(mockOrder).toHaveBeenCalled())

    const csv = 'name,booth_number,hall\nABSEN,TF10,Hall 1\nSamsung,TF20,Hall 2\nSony,TF30,Hall 3'
    const file = new File([csv], 'exhibitors.csv', { type: 'text/csv' })

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(mockInsert).toHaveBeenCalled())

    const [insertedRows] = mockInsert.mock.calls[0] as [Array<{ pin: string }>]
    const pins = insertedRows.map(r => r.pin)
    expect(new Set(pins).size).toBe(pins.length)
  })

  it('does not reuse PINs already held by existing exhibitors', async () => {
    const existingExhibitors = [
      { id: 'e1', name: 'ExistCo', booth_number: 'A1', hall: 'Hall 1', pin: '1234', created_at: '' },
    ]

    const { supabase } = await import('../../lib/supabase')
    const mockFrom = vi.mocked(supabase.from)

    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockOrder = vi.fn().mockResolvedValue({ data: existingExhibitors, error: null })
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn(() => ({ eq: mockEq }))
    const mockSelect = vi.fn(() => ({ order: mockOrder }))
    mockFrom.mockReturnValue({ select: mockSelect, insert: mockInsert, update: mockUpdate } as never)

    const { default: Exhibitors } = await import('../../pages/organizer/Exhibitors')
    const { container } = render(<Exhibitors />)

    await waitFor(() => {
      const tbody = document.querySelector('tbody')
      expect(within(tbody as HTMLElement).getByText('ExistCo')).toBeInTheDocument()
    })

    const csv = 'name,booth_number,hall\nNew Co,B2,Hall 2'
    const file = new File([csv], 'exhibitors.csv', { type: 'text/csv' })

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(mockInsert).toHaveBeenCalled())

    const [insertedRows] = mockInsert.mock.calls[0] as [Array<{ pin: string }>]
    expect(insertedRows[0].pin).not.toBe('1234')
    expect(insertedRows[0].pin).toMatch(/^\d{4}$/)
  })
})

// ── PIN regeneration ───────────────────────────────────────────────────────

describe('PIN regeneration', () => {
  it('updates the correct exhibitor and does not reuse other exhibitors PINs', async () => {
    const existing = [
      { id: 'e1', name: 'ABSEN', booth_number: 'TF10', hall: 'Hall 1', pin: '1111', created_at: '' },
      { id: 'e2', name: 'Samsung', booth_number: 'TF20', hall: 'Hall 2', pin: '2222', created_at: '' },
    ]

    const { supabase } = await import('../../lib/supabase')
    const mockFrom = vi.mocked(supabase.from)

    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockOrder = vi.fn().mockResolvedValue({ data: existing, error: null })
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn(() => ({ eq: mockEq }))
    const mockSelect = vi.fn(() => ({ order: mockOrder }))
    mockFrom.mockReturnValue({ select: mockSelect, insert: mockInsert, update: mockUpdate } as never)

    const { default: Exhibitors } = await import('../../pages/organizer/Exhibitors')
    render(<Exhibitors />)

    await waitFor(() => {
      const tbody = document.querySelector('tbody')
      expect(within(tbody as HTMLElement).getByText('ABSEN')).toBeInTheDocument()
    })

    const regenButtons = screen.getAllByText('Regen PIN')
    fireEvent.click(regenButtons[0])

    await waitFor(() => expect(mockEq).toHaveBeenCalledWith('id', 'e1'))

    const [{ pin: newPin }] = mockUpdate.mock.calls[0] as unknown as [{ pin: string }]
    expect(newPin).not.toBe('1111')
    expect(newPin).not.toBe('2222')
    expect(newPin).toMatch(/^\d{4}$/)
  })

  it('reloads the exhibitor list after regeneration', async () => {
    const existing = [
      { id: 'e1', name: 'ABSEN', booth_number: 'TF10', hall: 'Hall 1', pin: '1111', created_at: '' },
    ]

    const { supabase } = await import('../../lib/supabase')
    const mockFrom = vi.mocked(supabase.from)

    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockOrder = vi.fn().mockResolvedValue({ data: existing, error: null })
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn(() => ({ eq: mockEq }))
    const mockSelect = vi.fn(() => ({ order: mockOrder }))
    mockFrom.mockReturnValue({ select: mockSelect, insert: mockInsert, update: mockUpdate } as never)

    const { default: Exhibitors } = await import('../../pages/organizer/Exhibitors')
    render(<Exhibitors />)

    await waitFor(() => {
      const tbody = document.querySelector('tbody')
      expect(within(tbody as HTMLElement).getByText('ABSEN')).toBeInTheDocument()
    })

    const callsBefore = mockOrder.mock.calls.length
    fireEvent.click(screen.getByText('Regen PIN'))

    await waitFor(() => expect(mockOrder.mock.calls.length).toBeGreaterThan(callsBefore))
  })
})
