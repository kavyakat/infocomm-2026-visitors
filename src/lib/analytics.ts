import { checkEligibility, type EligibilityConfig } from './eligibility'

export function eligibleCount(
  visitsByVisitor: Map<string, Array<{ exhibitor_id: string; hall: string; day: 1 | 2 | 3 }>>,
  platinumIds: Set<string>,
  socialByVisitor: Map<string, boolean>,
  config: EligibilityConfig
): number {
  let count = 0
  for (const [visitorId, visits] of visitsByVisitor.entries()) {
    const result = checkEligibility({
      visits,
      platinumIds,
      socialComplete: socialByVisitor.get(visitorId) ?? false,
      config,
    })
    if (result.eligible) count++
  }
  return count
}

export function buildHallDistribution(
  exhibitors: Array<{ id: string; hall: string }>,
  visits: Array<{ exhibitor_id: string }>
): Array<{ hall: string; exhibitorCount: number; visitCount: number }> {
  const hallExhibitors = new Map<string, Set<string>>()
  for (const ex of exhibitors) {
    if (!hallExhibitors.has(ex.hall)) hallExhibitors.set(ex.hall, new Set())
    hallExhibitors.get(ex.hall)!.add(ex.id)
  }

  const exhibitorToHall = new Map<string, string>()
  for (const ex of exhibitors) exhibitorToHall.set(ex.id, ex.hall)

  const hallVisits = new Map<string, number>()
  for (const v of visits) {
    const hall = exhibitorToHall.get(v.exhibitor_id)
    if (hall) hallVisits.set(hall, (hallVisits.get(hall) ?? 0) + 1)
  }

  return Array.from(hallExhibitors.entries())
    .map(([hall, exSet]) => ({
      hall,
      exhibitorCount: exSet.size,
      visitCount: hallVisits.get(hall) ?? 0,
    }))
    .sort((a, b) => b.visitCount - a.visitCount)
}

export function buildHourlyDist(
  visits: Array<{ visited_at: string }>
): Array<{ hour: number; count: number }> {
  const counts = new Array(24).fill(0)
  for (const v of visits) {
    if (v.visited_at) {
      const hour = new Date(v.visited_at).getHours()
      if (hour >= 0 && hour < 24) counts[hour]++
    }
  }
  return counts.map((count, hour) => ({ hour, count }))
}

export function buildTopExhibitors(
  visits: Array<{ exhibitor_id: string }>,
  exhibitors: Array<{ id: string; name: string; booth_number: string }>,
  n = 10
): Array<{ name: string; booth: string; count: number }> {
  const counts = new Map<string, number>()
  for (const v of visits) {
    counts.set(v.exhibitor_id, (counts.get(v.exhibitor_id) ?? 0) + 1)
  }

  const exMap = new Map(exhibitors.map(e => [e.id, e]))

  return Array.from(counts.entries())
    .filter(([id]) => exMap.has(id))
    .map(([id, count]) => {
      const ex = exMap.get(id)!
      return { name: ex.name, booth: ex.booth_number, count }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
}

export function buildEngagementDist(
  visitsByVisitor: Map<string, number>
): Array<{ bucket: string; count: number }> {
  const buckets = [
    { bucket: '1', min: 1, max: 1 },
    { bucket: '2–5', min: 2, max: 5 },
    { bucket: '6–10', min: 6, max: 10 },
    { bucket: '11–15', min: 11, max: 15 },
    { bucket: '16+', min: 16, max: Infinity },
  ]

  const counts = new Array(buckets.length).fill(0)
  for (const n of visitsByVisitor.values()) {
    const idx = buckets.findIndex(b => n >= b.min && n <= b.max)
    if (idx !== -1) counts[idx]++
  }
  return buckets.map((b, i) => ({ bucket: b.bucket, count: counts[i] }))
}
