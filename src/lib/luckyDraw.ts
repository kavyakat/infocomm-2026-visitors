import { checkEligibility, fairDraw, type EligibilityConfig, type Candidate } from './eligibility'

export type { Candidate }
export type Winner = { prize_rank: number; name: string; email: string }

export function buildCandidates(
  allVisits: Array<{ visitor_id: string; exhibitor_id: string; day: 1 | 2 | 3; hall: string }>,
  profiles: Map<string, { name: string; email: string }>,
  platinumIds: Set<string>,
  socialByVisitor: Map<string, boolean>,
  config: EligibilityConfig
): Candidate[] {
  const byVisitor = new Map<string, Array<{ exhibitor_id: string; hall: string; day: 1 | 2 | 3 }>>()
  for (const v of allVisits) {
    if (!byVisitor.has(v.visitor_id)) byVisitor.set(v.visitor_id, [])
    byVisitor.get(v.visitor_id)!.push({ exhibitor_id: v.exhibitor_id, hall: v.hall, day: v.day })
  }

  const candidates: Candidate[] = []
  for (const [visitorId, visits] of byVisitor.entries()) {
    const result = checkEligibility({
      visits,
      platinumIds,
      socialComplete: socialByVisitor.get(visitorId) ?? false,
      config,
    })
    if (!result.eligible) continue
    const profile = profiles.get(visitorId)
    if (!profile) continue
    candidates.push({ id: visitorId, name: profile.name, email: profile.email })
  }
  return candidates
}

export function nextPrizeRank(existingWinners: number[]): number {
  const taken = new Set(existingWinners)
  let rank = 1
  while (taken.has(rank)) rank++
  return rank
}

export { fairDraw }
