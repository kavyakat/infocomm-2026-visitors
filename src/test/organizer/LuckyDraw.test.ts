import { describe, it, expect } from 'vitest'
import { buildCandidates, nextPrizeRank } from '../../lib/luckyDraw'
import { type EligibilityConfig } from '../../lib/eligibility'

const BASE_CONFIG: EligibilityConfig = {
  minQualifyingDays: 2,
  minPlatinumVisits: 3,
  minTotalCheckins: 0,
}

const platinumIds = new Set(['p1', 'p2', 'p3'])

function eligibleVisits(visitorId: string) {
  return [
    { visitor_id: visitorId, exhibitor_id: 'e1', hall: 'Jasmine Hall', day: 1 as const },
    { visitor_id: visitorId, exhibitor_id: 'e2', hall: 'Pavilion Hall', day: 2 as const },
    { visitor_id: visitorId, exhibitor_id: 'p1', hall: 'Jasmine Hall', day: 1 as const },
    { visitor_id: visitorId, exhibitor_id: 'p2', hall: 'Jasmine Hall', day: 2 as const },
    { visitor_id: visitorId, exhibitor_id: 'p3', hall: 'Pavilion Hall', day: 1 as const },
  ]
}

describe('buildCandidates', () => {
  it('includes eligible visitor in pool', () => {
    const profiles = new Map([['v1', { name: 'Alice', email: 'alice@example.com' }]])
    const social = new Map([['v1', true]])

    const result = buildCandidates(eligibleVisits('v1'), profiles, platinumIds, social, BASE_CONFIG)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('v1')
    expect(result[0].name).toBe('Alice')
    expect(result[0].email).toBe('alice@example.com')
  })

  it('excludes visitor missing a qualifying hall', () => {
    const visits = [
      { visitor_id: 'v2', exhibitor_id: 'e1', hall: 'Jasmine Hall', day: 1 as const },
      { visitor_id: 'v2', exhibitor_id: 'p1', hall: 'Jasmine Hall', day: 2 as const },
      { visitor_id: 'v2', exhibitor_id: 'p2', hall: 'Jasmine Hall', day: 1 as const },
      { visitor_id: 'v2', exhibitor_id: 'p3', hall: 'Jasmine Hall', day: 2 as const },
    ]
    const profiles = new Map([['v2', { name: 'Bob', email: 'bob@example.com' }]])
    const social = new Map([['v2', true]])

    const result = buildCandidates(visits, profiles, platinumIds, social, BASE_CONFIG)
    expect(result).toHaveLength(0)
  })

  it('excludes visitor with social not complete', () => {
    const profiles = new Map([['v3', { name: 'Carol', email: 'carol@example.com' }]])
    const social = new Map([['v3', false]])

    const result = buildCandidates(eligibleVisits('v3'), profiles, platinumIds, social, BASE_CONFIG)
    expect(result).toHaveLength(0)
  })

  it('includes eligible and excludes ineligible from mixed input', () => {
    const visits = [
      ...eligibleVisits('eligible'),
      { visitor_id: 'ineligible', exhibitor_id: 'e1', hall: 'Jasmine Hall', day: 1 as const },
    ]
    const profiles = new Map([
      ['eligible', { name: 'Eligible User', email: 'e@example.com' }],
      ['ineligible', { name: 'Ineligible User', email: 'i@example.com' }],
    ])
    const social = new Map([['eligible', true], ['ineligible', true]])

    const result = buildCandidates(visits, profiles, platinumIds, social, BASE_CONFIG)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('eligible')
  })

  it('excludes visitors with no profile entry', () => {
    const profiles = new Map<string, { name: string; email: string }>()
    const social = new Map([['v1', true]])

    const result = buildCandidates(eligibleVisits('v1'), profiles, platinumIds, social, BASE_CONFIG)
    expect(result).toHaveLength(0)
  })
})

describe('nextPrizeRank', () => {
  it('returns 1 when no winners drawn', () => {
    expect(nextPrizeRank([])).toBe(1)
  })

  it('returns 2 when rank 1 is drawn', () => {
    expect(nextPrizeRank([1])).toBe(2)
  })

  it('returns 3 when ranks 1 and 2 are drawn', () => {
    expect(nextPrizeRank([1, 2])).toBe(3)
  })

  it('returns null when all 3 ranks are drawn', () => {
    expect(nextPrizeRank([1, 2, 3])).toBeNull()
  })
})
