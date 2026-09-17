import { vi, describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../lib/db'

// vi.hoisted runs before vi.mock factory — makes the spy available in the closure
const mockInsert = vi.hoisted(() => vi.fn())

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({ insert: mockInsert }),
  },
}))

const { flushVisitQueue } = await import('../../lib/sync')

function makeVisit(id: string, synced: boolean) {
  return {
    id,
    visitor_id: 'u1',
    exhibitor_id: 'e1',
    visited_at: '2026-01-15T10:00:00.000Z',
    day: 1 as const,
    rating: null,
    synced,
  }
}

beforeEach(async () => {
  await db.visits.clear()
  mockInsert.mockReset()
  mockInsert.mockResolvedValue({ error: null })
})

describe('flushVisitQueue', () => {
  it('makes no Supabase call when the queue is empty', async () => {
    await flushVisitQueue()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('makes no Supabase call when all visits are already synced', async () => {
    await db.visits.put(makeVisit('v1', true))
    await flushVisitQueue()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('inserts each unsynced visit and marks it synced in Dexie', async () => {
    await db.visits.bulkPut([makeVisit('v1', false), makeVisit('v2', false)])
    await flushVisitQueue()
    expect(mockInsert).toHaveBeenCalledTimes(2)
    expect((await db.visits.get('v1'))?.synced).toBe(true)
    expect((await db.visits.get('v2'))?.synced).toBe(true)
  })

  it('sends the correct payload fields and omits the local-only `synced` flag', async () => {
    await db.visits.put({
      id: 'v99',
      visitor_id: 'u42',
      exhibitor_id: 'ex7',
      visited_at: '2026-01-15T10:00:00.000Z',
      day: 2 as const,
      rating: 4,
      synced: false,
    })
    await flushVisitQueue()
    expect(mockInsert).toHaveBeenCalledWith({
      id: 'v99',
      visitor_id: 'u42',
      exhibitor_id: 'ex7',
      visited_at: '2026-01-15T10:00:00.000Z',
      day: 2,
      rating: 4,
    })
  })

  it('skips already-synced visits when mixed with unsynced ones', async () => {
    await db.visits.bulkPut([makeVisit('synced', true), makeVisit('pending', false)])
    await flushVisitQueue()
    expect(mockInsert).toHaveBeenCalledTimes(1)
    const [row] = mockInsert.mock.calls[0] as [{ id: string }]
    expect(row.id).toBe('pending')
  })

  it('leaves a visit unsynced when Supabase returns a non-23505 error', async () => {
    await db.visits.bulkPut([makeVisit('v1', false), makeVisit('v2', false), makeVisit('v3', false)])
    let call = 0
    mockInsert.mockImplementation(async () => {
      call++
      if (call === 2) return { error: { code: '500', message: 'server error' } }
      return { error: null }
    })
    await flushVisitQueue()
    expect((await db.visits.get('v1'))?.synced).toBe(true)
    expect((await db.visits.get('v2'))?.synced).toBe(false)
    expect((await db.visits.get('v3'))?.synced).toBe(true)
  })

  it('treats a 23505 unique-constraint error as success and marks the visit synced', async () => {
    await db.visits.put(makeVisit('v1', false))
    mockInsert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key value violates unique constraint' } })
    await flushVisitQueue()
    expect((await db.visits.get('v1'))?.synced).toBe(true)
  })

  it('second concurrent call is a no-op while the first flush is in flight', async () => {
    await db.visits.put(makeVisit('v1', false))
    let concurrentResult: Promise<void> | undefined
    mockInsert.mockImplementation(async () => {
      // flushing flag is true at this point — second call must return immediately
      concurrentResult = flushVisitQueue()
      return { error: null }
    })
    await flushVisitQueue()
    await concurrentResult
    // mockInsert called exactly once — concurrent call did not re-send
    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect((await db.visits.get('v1'))?.synced).toBe(true)
  })
})
