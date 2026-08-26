import { describe, it, expect } from 'vitest'
import { eligibleCount, buildHallDistribution } from '../../lib/analytics'
import { type EligibilityConfig } from '../../lib/eligibility'

const CONFIG: EligibilityConfig = { minQualifyingDays: 2, minPlatinumVisits: 3, minTotalCheckins: 0 }
const platinumIds = new Set(['p1', 'p2', 'p3'])

describe('eligibleCount', () => {
  it('counts eligible visitors using checkEligibility rules', () => {
    const eligibleVisits = [
      { exhibitor_id: 'e1', hall: 'Jasmine Halls', day: 1 as const },
      { exhibitor_id: 'e2', hall: 'Pavilion Halls', day: 2 as const },
      { exhibitor_id: 'p1', hall: 'Jasmine Halls', day: 1 as const },
      { exhibitor_id: 'p2', hall: 'Jasmine Halls', day: 2 as const },
      { exhibitor_id: 'p3', hall: 'Pavilion Halls', day: 1 as const },
    ]
    const ineligibleVisits = [
      { exhibitor_id: 'e1', hall: 'Jasmine Halls', day: 1 as const },
    ]

    const visitsByVisitor = new Map([
      ['eligible', eligibleVisits],
      ['ineligible', ineligibleVisits],
    ])
    const social = new Map([['eligible', true], ['ineligible', false]])

    expect(eligibleCount(visitsByVisitor, platinumIds, social, CONFIG)).toBe(1)
  })

  it('returns 0 when no visitors meet all criteria', () => {
    const visitsByVisitor = new Map([['v1', [{ exhibitor_id: 'e1', hall: 'Jasmine Halls', day: 1 as const }]]])
    const social = new Map([['v1', false]])

    expect(eligibleCount(visitsByVisitor, platinumIds, social, CONFIG)).toBe(0)
  })
})

describe('buildHallDistribution', () => {
  it('produces correct per-hall counts sorted by visit count descending', () => {
    const exhibitors = [
      { id: 'e1', hall: 'Hall 1' },
      { id: 'e2', hall: 'Hall 1' },
      { id: 'e3', hall: 'Hall 2' },
    ]
    const visits = [
      { exhibitor_id: 'e1' },
      { exhibitor_id: 'e1' },
      { exhibitor_id: 'e3' },
      { exhibitor_id: 'e3' },
      { exhibitor_id: 'e3' },
    ]

    const result = buildHallDistribution(exhibitors, visits)

    expect(result).toHaveLength(2)
    // Hall 2 has 3 visits so comes first
    expect(result[0].hall).toBe('Hall 2')
    expect(result[0].exhibitorCount).toBe(1)
    expect(result[0].visitCount).toBe(3)

    expect(result[1].hall).toBe('Hall 1')
    expect(result[1].exhibitorCount).toBe(2)
    expect(result[1].visitCount).toBe(2)
  })

  it('returns zero visitCount for halls with no visits', () => {
    const exhibitors = [{ id: 'e1', hall: 'Hall A' }]
    const visits: Array<{ exhibitor_id: string }> = []

    const result = buildHallDistribution(exhibitors, visits)
    expect(result).toHaveLength(1)
    expect(result[0].visitCount).toBe(0)
  })
})
