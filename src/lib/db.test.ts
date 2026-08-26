import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'

beforeEach(async () => {
  await db.exhibitors.clear()
  await db.visits.clear()
})

describe('db', () => {
  it('stores and retrieves an exhibitor', async () => {
    await db.exhibitors.put({
      id: 'e1', name: 'ABSEN', booth_number: 'TF10', hall: 'Hall 1', pin_hash: 'abc123', is_platinum: false
    })
    const found = await db.exhibitors.get('e1')
    expect(found?.name).toBe('ABSEN')
  })

  it('stores a visit with synced=false by default', async () => {
    await db.visits.put({
      id: 'v1', visitor_id: 'u1', exhibitor_id: 'e1',
      visited_at: new Date().toISOString(), day: 1, rating: null, synced: false
    })
    const found = await db.visits.get('v1')
    expect(found?.synced).toBe(false)
  })
})
