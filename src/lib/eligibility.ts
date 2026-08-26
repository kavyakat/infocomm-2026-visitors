export interface EligibilityConfig {
  minQualifyingDays: number
  minPlatinumVisits: number
  minTotalCheckins: number
}

export interface EligibilityInput {
  visits: Array<{ exhibitor_id: string; hall: string; day: 1 | 2 | 3 }>
  platinumIds: Set<string>
  socialComplete: boolean
  config: EligibilityConfig
}

export interface EligibilityResult {
  eligible: boolean
  daysVisited: number
  hallsCovered: string[]
  platinumVisits: number
  totalCheckins: number
  reasons: string[]
}

export function checkEligibility(input: EligibilityInput): EligibilityResult {
  const { visits, platinumIds, socialComplete, config } = input
  const reasons: string[] = []

  const distinctDays = new Set(visits.map(v => v.day)).size
  const hallsCovered = [...new Set(visits.map(v => v.hall))]
  const platinumVisits = visits.filter(v => platinumIds.has(v.exhibitor_id)).length
  const totalCheckins = visits.length

  if (distinctDays < config.minQualifyingDays) {
    reasons.push(`Must attend at least ${config.minQualifyingDays} day(s) (visited ${distinctDays})`)
  }
  if (!hallsCovered.includes('Jasmine Hall')) {
    reasons.push('Must visit Jasmine Hall')
  }
  if (!hallsCovered.includes('Pavilion Hall')) {
    reasons.push('Must visit Pavilion Hall')
  }
  if (platinumVisits < config.minPlatinumVisits) {
    reasons.push(`Must visit ${config.minPlatinumVisits} Platinum Partner(s) (visited ${platinumVisits})`)
  }
  if (config.minTotalCheckins > 0 && totalCheckins < config.minTotalCheckins) {
    reasons.push(`Must have at least ${config.minTotalCheckins} check-in(s) (have ${totalCheckins})`)
  }
  if (!socialComplete) {
    reasons.push('Must follow all social media channels')
  }

  return {
    eligible: reasons.length === 0,
    daysVisited: distinctDays,
    hallsCovered,
    platinumVisits,
    totalCheckins,
    reasons,
  }
}

export interface Candidate {
  id: string
  name: string
  email: string
}

export function fairDraw(pool: Candidate[]): string {
  if (pool.length === 0) throw new Error('Pool is empty')
  return pool[Math.floor(Math.random() * pool.length)].id
}
