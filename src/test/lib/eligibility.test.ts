import { describe, it, expect } from 'vitest'
import { checkEligibility, fairDraw, type EligibilityConfig, type EligibilityInput } from '../../lib/eligibility'

const BASE_CONFIG: EligibilityConfig = {
  minQualifyingDays: 2,
  minPlatinumVisits: 3,
  minTotalCheckins: 0,
}

const platinumIds = new Set(['p1', 'p2', 'p3', 'p4'])

function makeInput(overrides: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    visits: [
      { exhibitor_id: 'e1', hall: 'Jasmine Hall', day: 1 },
      { exhibitor_id: 'e2', hall: 'Pavilion Hall', day: 2 },
      { exhibitor_id: 'p1', hall: 'Jasmine Hall', day: 1 },
      { exhibitor_id: 'p2', hall: 'Jasmine Hall', day: 2 },
      { exhibitor_id: 'p3', hall: 'Pavilion Hall', day: 1 },
    ],
    platinumIds,
    socialComplete: true,
    config: BASE_CONFIG,
    ...overrides,
  }
}

describe('checkEligibility', () => {
  it('returns eligible=true when all rules pass', () => {
    const result = checkEligibility(makeInput())
    expect(result.eligible).toBe(true)
    expect(result.daysVisited).toBe(2)
    expect(result.platinumVisits).toBe(3)
    expect(result.reasons).toHaveLength(0)
  })

  it('fails when not enough distinct days', () => {
    const input = makeInput({
      visits: [
        { exhibitor_id: 'e1', hall: 'Jasmine Hall', day: 1 },
        { exhibitor_id: 'p1', hall: 'Jasmine Hall', day: 1 },
        { exhibitor_id: 'p2', hall: 'Jasmine Hall', day: 1 },
        { exhibitor_id: 'p3', hall: 'Pavilion Hall', day: 1 },
      ],
    })
    const result = checkEligibility(input)
    expect(result.eligible).toBe(false)
    expect(result.daysVisited).toBe(1)
    expect(result.reasons.some(r => r.includes('day'))).toBe(true)
  })

  it('fails when Jasmine Hall not visited', () => {
    const input = makeInput({
      visits: [
        { exhibitor_id: 'e1', hall: 'Pavilion Hall', day: 1 },
        { exhibitor_id: 'e2', hall: 'Pavilion Hall', day: 2 },
        { exhibitor_id: 'p1', hall: 'Pavilion Hall', day: 1 },
        { exhibitor_id: 'p2', hall: 'Pavilion Hall', day: 2 },
        { exhibitor_id: 'p3', hall: 'Pavilion Hall', day: 1 },
      ],
    })
    const result = checkEligibility(input)
    expect(result.eligible).toBe(false)
    expect(result.reasons.some(r => r.includes('Jasmine Hall'))).toBe(true)
  })

  it('fails when Pavilion Hall not visited', () => {
    const input = makeInput({
      visits: [
        { exhibitor_id: 'e1', hall: 'Jasmine Hall', day: 1 },
        { exhibitor_id: 'e2', hall: 'Jasmine Hall', day: 2 },
        { exhibitor_id: 'p1', hall: 'Jasmine Hall', day: 1 },
        { exhibitor_id: 'p2', hall: 'Jasmine Hall', day: 2 },
        { exhibitor_id: 'p3', hall: 'Jasmine Hall', day: 1 },
      ],
    })
    const result = checkEligibility(input)
    expect(result.eligible).toBe(false)
    expect(result.reasons.some(r => r.includes('Pavilion Hall'))).toBe(true)
  })

  it('fails when not enough platinum visits', () => {
    const input = makeInput({
      visits: [
        { exhibitor_id: 'e1', hall: 'Jasmine Hall', day: 1 },
        { exhibitor_id: 'e2', hall: 'Pavilion Hall', day: 2 },
        { exhibitor_id: 'p1', hall: 'Jasmine Hall', day: 1 },
        { exhibitor_id: 'p2', hall: 'Pavilion Hall', day: 2 },
      ],
    })
    const result = checkEligibility(input)
    expect(result.eligible).toBe(false)
    expect(result.platinumVisits).toBe(2)
    expect(result.reasons.some(r => r.includes('Platinum'))).toBe(true)
  })

  it('fails when social not complete', () => {
    const result = checkEligibility(makeInput({ socialComplete: false }))
    expect(result.eligible).toBe(false)
    expect(result.reasons.some(r => r.includes('social'))).toBe(true)
  })

  it('enforces minTotalCheckins when > 0', () => {
    const config: EligibilityConfig = { ...BASE_CONFIG, minTotalCheckins: 10 }
    const result = checkEligibility(makeInput({ config }))
    expect(result.eligible).toBe(false)
    expect(result.totalCheckins).toBe(5)
    expect(result.reasons.some(r => r.includes('check-in'))).toBe(true)
  })

  it('skips minTotalCheckins check when 0', () => {
    const config: EligibilityConfig = { ...BASE_CONFIG, minTotalCheckins: 0 }
    const result = checkEligibility(makeInput({ config }))
    expect(result.eligible).toBe(true)
  })

  it('collects all failure reasons', () => {
    const input = makeInput({
      visits: [{ exhibitor_id: 'e1', hall: 'Jasmine Hall', day: 1 }],
      socialComplete: false,
    })
    const result = checkEligibility(input)
    expect(result.eligible).toBe(false)
    expect(result.reasons.length).toBeGreaterThanOrEqual(3)
  })

  it('returns correct hallsCovered', () => {
    const result = checkEligibility(makeInput())
    expect(result.hallsCovered).toContain('Jasmine Hall')
    expect(result.hallsCovered).toContain('Pavilion Hall')
  })
})

describe('fairDraw', () => {
  it('throws on empty pool', () => {
    expect(() => fairDraw([])).toThrow()
  })

  it('returns the only item in a single-item pool', () => {
    const result = fairDraw([{ id: 'x', name: 'A', email: 'a@b.com' }])
    expect(result).toBe('x')
  })

  it('uses Math.random index correctly', () => {
    const original = Math.random
    Math.random = () => 0.5
    const pool = [
      { id: 'a', name: 'A', email: 'a@b.com' },
      { id: 'b', name: 'B', email: 'b@b.com' },
      { id: 'c', name: 'C', email: 'c@b.com' },
    ]
    const result = fairDraw(pool)
    Math.random = original
    expect(result).toBe('b')
  })
})
