import Dexie, { type Table } from 'dexie'

export interface LocalExhibitor {
  id: string
  name: string
  booth_number: string
  hall: string
  pin_hash: string
  is_platinum: boolean
}

export interface LocalVisit {
  id: string
  visitor_id: string
  exhibitor_id: string
  visited_at: string
  day: 1 | 2 | 3
  rating: number | null
  synced: boolean
}

class AppDB extends Dexie {
  exhibitors!: Table<LocalExhibitor>
  visits!: Table<LocalVisit>

  constructor() {
    super('infocomm2026')
    this.version(1).stores({
      exhibitors: 'id, hall',
      visits: 'id, visitor_id, exhibitor_id, synced',
    })
    this.version(2).stores({
      exhibitors: 'id, hall',
      visits: 'id, visitor_id, exhibitor_id, synced',
    }).upgrade(tx => {
      return tx.table('exhibitors').toCollection().modify(e => {
        if (e.is_platinum === undefined) e.is_platinum = false
      })
    })
  }
}

export const db = new AppDB()
