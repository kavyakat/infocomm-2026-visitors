# InfoComm India 2026 — Qualification & Lucky Draw Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign visitor qualification rules, add Platinum Partner tracking, replace score-weighted lucky draw with fair random draw, add social media eligibility, and build supporting organizer controls — all configurable from the Supabase `settings` table.

**Architecture:** New `src/lib/eligibility.ts` replaces `src/lib/scoring.ts` as the single source of qualification truth. Pure function `checkEligibility` takes visits + config + platinumIds + socialComplete and returns a typed result. The lucky draw page builds an eligible snapshot, then runs `fairDraw` (uniform random) from that pool. All thresholds default to safe values and are overridden by rows in the `settings` table at runtime.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v3, Supabase, Dexie (IndexedDB), Vitest + Testing Library, SheetJS (`xlsx`)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Delete | `src/lib/scoring.ts` | Replaced by eligibility.ts |
| Delete | `src/lib/scoring.test.ts` | Replaced by eligibility.test.ts |
| Create | `src/lib/eligibility.ts` | Pure eligibility logic + config types |
| Create | `src/test/lib/eligibility.test.ts` | Tests for checkEligibility + fairDraw |
| Update | `src/lib/luckyDraw.ts` | Use checkEligibility; add fairDraw; drop score/weightedDraw |
| Update | `src/test/organizer/LuckyDraw.test.ts` | Rewrite to match new buildCandidates signature |
| Update | `src/lib/analytics.ts` | Update eligibleCount signature to use checkEligibility |
| Update | `src/test/organizer/Analytics.test.ts` | Rewrite eligibleCount test for new signature |
| Update | `src/lib/export.ts` | Add Excel (xlsx) helpers for two-sheet workbooks |
| Update | `src/lib/exhibitors.ts` | Parse optional `is_platinum` CSV column |
| Update | `src/lib/supabase.ts` | Add new Profile + Exhibitor fields |
| Update | `src/lib/db.ts` | Add is_platinum to LocalExhibitor; bump Dexie version |
| Update | `src/hooks/useExhibitors.ts` | Carry is_platinum through Dexie cache |
| Update | `src/pages/visitor/Login.tsx` | Add badge-email info banner |
| Update | `src/pages/visitor/Register.tsx` | Add banner + company_name + designation fields |
| Update | `src/components/ExhibitorCard.tsx` | Add isPlatinum prop + gold styling |
| Create | `src/components/SocialFooter.tsx` | Fixed social-channel footer with click tracking |
| Update | `src/pages/visitor/ExhibitorList.tsx` | Platinum chip, My Progress link, SocialFooter |
| Update | `src/pages/visitor/CheckIn.tsx` | Add SocialFooter |
| Create | `src/pages/visitor/MyEligibility.tsx` | Per-visitor eligibility checklist page |
| Create | `src/pages/organizer/Settings.tsx` | Threshold editor |
| Update | `src/pages/organizer/Exhibitors.tsx` | Platinum toggle per row |
| Update | `src/pages/organizer/LuckyDraw.tsx` | Full rewrite: pool build, fair draw, redraw, fullscreen |
| Update | `src/pages/organizer/Analytics.tsx` | Visitor breakdown table + Excel export |
| Update | `src/router.tsx` | Add /my-eligibility + /organizer/settings routes |

---

## Task 1: Supabase migrations + install xlsx

**Files:**
- No source files changed — SQL runs in Supabase SQL editor
- `package.json` (via npm install)

- [ ] **Step 1: Run migrations in Supabase SQL editor**

Open your Supabase project → SQL Editor → run:

```sql
-- exhibitors
ALTER TABLE exhibitors ADD COLUMN IF NOT EXISTS is_platinum BOOLEAN DEFAULT false;

-- profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_name TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS designation TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS social_linkedin BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS social_instagram BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS social_facebook BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS social_youtube BOOLEAN DEFAULT false;

-- lucky_draw_winners
ALTER TABLE lucky_draw_winners ADD COLUMN IF NOT EXISTS redrawn BOOLEAN DEFAULT false;

-- new snapshot table
CREATE TABLE IF NOT EXISTS lucky_draw_eligible_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id UUID REFERENCES profiles(id),
  name TEXT,
  email TEXT,
  mobile TEXT,
  company_name TEXT,
  designation TEXT,
  days_visited INTEGER,
  halls_covered TEXT,
  platinum_visits INTEGER,
  social_complete BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- seed default settings (safe if rows already exist)
INSERT INTO settings (key, value) VALUES
  ('min_qualifying_days', '2'),
  ('min_platinum_visits', '3'),
  ('min_total_checkins', '0')
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 2: Install xlsx**

```bash
npm install xlsx
```

Expected: `xlsx` appears in `package.json` dependencies.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install xlsx for Excel export"
```

---

## Task 2: Update TypeScript types + Dexie schema

**Files:**
- Modify: `src/lib/supabase.ts`
- Modify: `src/lib/db.ts`
- Modify: `src/hooks/useExhibitors.ts`

- [ ] **Step 1: Update supabase.ts types**

Replace the `Profile` and `Exhibitor` types:

```ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

export type Profile = {
  id: string
  name: string
  email: string
  mobile: string
  role: 'visitor' | 'organizer'
  company_name: string
  designation: string
  social_linkedin: boolean
  social_instagram: boolean
  social_facebook: boolean
  social_youtube: boolean
}

export type Exhibitor = {
  id: string
  name: string
  booth_number: string
  hall: string
  pin: string
  is_platinum: boolean
  created_at: string
}

export type Visit = {
  id: string
  visitor_id: string
  exhibitor_id: string
  visited_at: string
  day: 1 | 2 | 3
  rating: number | null
}
```

- [ ] **Step 2: Update db.ts — add is_platinum + bump Dexie version**

```ts
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
      return tx.table('exhibitors').toCollection().modify((e: LocalExhibitor) => {
        if (e.is_platinum === undefined) e.is_platinum = false
      })
    })
  }
}

export const db = new AppDB()
```

- [ ] **Step 3: Update useExhibitors.ts — carry is_platinum through cache**

In the `localExhibitors` mapping inside `loadExhibitors`, add `is_platinum`:

```ts
const localExhibitors: LocalExhibitor[] = await Promise.all(
  data.map(async e => ({
    id: e.id,
    name: e.name,
    booth_number: e.booth_number,
    hall: e.hall,
    pin_hash: await hashPin(e.pin),
    is_platinum: e.is_platinum ?? false,
  }))
)
```

- [ ] **Step 4: Run tests — must still pass**

```bash
npm test
```

Expected: all existing tests pass (scoring tests still run, eligibility not yet created).

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase.ts src/lib/db.ts src/hooks/useExhibitors.ts
git commit -m "feat: add is_platinum, company_name, designation, social fields to types"
```

---

## Task 3: Create eligibility.ts (TDD)

**Files:**
- Create: `src/lib/eligibility.ts`
- Create: `src/test/lib/eligibility.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/test/lib/eligibility.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { checkEligibility, fairDraw, type EligibilityConfig } from '../../lib/eligibility'

const defaultConfig: EligibilityConfig = {
  minQualifyingDays: 2,
  minPlatinumVisits: 3,
  minTotalCheckins: 0,
}

const platinumIds = new Set(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'])

function makeVisits(opts: {
  days?: Array<1 | 2 | 3>
  halls?: string[]
  platinumIds?: string[]
}): Array<{ exhibitor_id: string; hall: string; day: 1 | 2 | 3 }> {
  const days = opts.days ?? [1, 2]
  const halls = opts.halls ?? ['Jasmine Hall', 'Pavilion Hall']
  const platinum = opts.platinumIds ?? ['p1', 'p2', 'p3']
  const visits = days.map((day, i) => ({
    exhibitor_id: `e${i}`,
    hall: halls[i % halls.length],
    day,
  }))
  platinum.forEach((id, i) => {
    visits.push({ exhibitor_id: id, hall: halls[i % halls.length], day: days[i % days.length] })
  })
  return visits
}

describe('checkEligibility', () => {
  it('returns eligible when all conditions pass', () => {
    const result = checkEligibility({
      visits: makeVisits({}),
      platinumIds,
      socialComplete: true,
      config: defaultConfig,
    })
    expect(result.eligible).toBe(true)
    expect(result.reasons).toHaveLength(0)
  })

  it('fails when not enough qualifying days', () => {
    const visits = makeVisits({ days: [1, 1, 1] })
    const result = checkEligibility({ visits, platinumIds, socialComplete: true, config: defaultConfig })
    expect(result.eligible).toBe(false)
    expect(result.reasons.some(r => r.toLowerCase().includes('day'))).toBe(true)
  })

  it('fails when Jasmine Hall is missing', () => {
    const visits = makeVisits({ halls: ['Pavilion Hall', 'Pavilion Hall'] })
    const result = checkEligibility({ visits, platinumIds, socialComplete: true, config: defaultConfig })
    expect(result.eligible).toBe(false)
    expect(result.reasons.some(r => r.includes('Jasmine Hall'))).toBe(true)
  })

  it('fails when Pavilion Hall is missing', () => {
    const visits = makeVisits({ halls: ['Jasmine Hall', 'Jasmine Hall'] })
    const result = checkEligibility({ visits, platinumIds, socialComplete: true, config: defaultConfig })
    expect(result.eligible).toBe(false)
    expect(result.reasons.some(r => r.includes('Pavilion Hall'))).toBe(true)
  })

  it('fails when not enough platinum visits', () => {
    const visits = makeVisits({ platinumIds: ['p1', 'p2'] }) // only 2, need 3
    const result = checkEligibility({ visits, platinumIds, socialComplete: true, config: defaultConfig })
    expect(result.eligible).toBe(false)
    expect(result.reasons.some(r => r.toLowerCase().includes('platinum'))).toBe(true)
  })

  it('fails when social not complete', () => {
    const result = checkEligibility({
      visits: makeVisits({}),
      platinumIds,
      socialComplete: false,
      config: defaultConfig,
    })
    expect(result.eligible).toBe(false)
    expect(result.reasons.some(r => r.toLowerCase().includes('social'))).toBe(true)
  })

  it('enforces minTotalCheckins when > 0', () => {
    const config: EligibilityConfig = { ...defaultConfig, minTotalCheckins: 20 }
    const visits = makeVisits({}) // ~5 visits, below 20
    const result = checkEligibility({ visits, platinumIds, socialComplete: true, config })
    expect(result.eligible).toBe(false)
    expect(result.reasons.some(r => r.toLowerCase().includes('check-in'))).toBe(true)
  })

  it('skips total checkin check when minTotalCheckins is 0', () => {
    const config: EligibilityConfig = { ...defaultConfig, minTotalCheckins: 0 }
    const visits = makeVisits({}) // only 5 visits
    const result = checkEligibility({ visits, platinumIds, socialComplete: true, config })
    // Should not fail due to total checkins
    expect(result.reasons.some(r => r.toLowerCase().includes('check-in'))).toBe(false)
  })

  it('collects all failure reasons', () => {
    const result = checkEligibility({
      visits: [],
      platinumIds,
      socialComplete: false,
      config: defaultConfig,
    })
    expect(result.eligible).toBe(false)
    expect(result.reasons.length).toBeGreaterThanOrEqual(4)
  })

  it('returns correct daysVisited, hallsCovered, platinumVisits, totalCheckins', () => {
    const visits = makeVisits({})
    const result = checkEligibility({ visits, platinumIds, socialComplete: true, config: defaultConfig })
    expect(result.daysVisited).toBe(2)
    expect(result.hallsCovered).toContain('Jasmine Hall')
    expect(result.hallsCovered).toContain('Pavilion Hall')
    expect(result.platinumVisits).toBe(3)
    expect(result.totalCheckins).toBe(visits.length)
  })
})

describe('fairDraw', () => {
  afterEach(() => vi.restoreAllMocks())

  it('throws on empty pool', () => {
    expect(() => fairDraw([])).toThrow('empty')
  })

  it('returns the only item in a single-item pool', () => {
    expect(fairDraw([{ id: 'abc', name: 'Alice', email: 'a@b.com' }])).toBe('abc')
  })

  it('returns the item at the random index', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const pool = [
      { id: 'a', name: 'A', email: 'a@x.com' },
      { id: 'b', name: 'B', email: 'b@x.com' },
      { id: 'c', name: 'C', email: 'c@x.com' },
    ]
    // Math.floor(0.5 * 3) = 1 → 'b'
    expect(fairDraw(pool)).toBe('b')
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm test src/test/lib/eligibility.test.ts
```

Expected: FAIL — `eligibility` module not found.

- [ ] **Step 3: Implement eligibility.ts**

Create `src/lib/eligibility.ts`:

```ts
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
  const { minQualifyingDays, minPlatinumVisits, minTotalCheckins } = config

  const distinctDays = new Set(visits.map(v => v.day)).size
  const hallSet = new Set(visits.map(v => v.hall))
  const platinumVisits = visits.filter(v => platinumIds.has(v.exhibitor_id)).length
  const totalCheckins = visits.length

  const reasons: string[] = []

  if (distinctDays < minQualifyingDays)
    reasons.push(`Visited ${distinctDays} day(s); need ${minQualifyingDays}`)
  if (!hallSet.has('Jasmine Hall'))
    reasons.push('No visits in Jasmine Hall')
  if (!hallSet.has('Pavilion Hall'))
    reasons.push('No visits in Pavilion Hall')
  if (platinumVisits < minPlatinumVisits)
    reasons.push(`${platinumVisits} Platinum Partner visit(s); need ${minPlatinumVisits}`)
  if (minTotalCheckins > 0 && totalCheckins < minTotalCheckins)
    reasons.push(`${totalCheckins} total check-in(s); need ${minTotalCheckins}`)
  if (!socialComplete)
    reasons.push('Social media channels not all clicked')

  return {
    eligible: reasons.length === 0,
    daysVisited: distinctDays,
    hallsCovered: Array.from(hallSet),
    platinumVisits,
    totalCheckins,
    reasons,
  }
}

export type Candidate = { id: string; name: string; email: string }

export function fairDraw(pool: Candidate[]): string {
  if (pool.length === 0) throw new Error('fairDraw: pool is empty')
  return pool[Math.floor(Math.random() * pool.length)].id
}
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
npm test src/test/lib/eligibility.test.ts
```

Expected: all 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/eligibility.ts src/test/lib/eligibility.test.ts
git commit -m "feat: add eligibility.ts with checkEligibility and fairDraw (TDD)"
```

---

## Task 4: Update luckyDraw.ts + tests; delete scoring.ts

**Files:**
- Modify: `src/lib/luckyDraw.ts`
- Modify: `src/test/organizer/LuckyDraw.test.ts`
- Delete: `src/lib/scoring.ts`
- Delete: `src/lib/scoring.test.ts`

- [ ] **Step 1: Rewrite luckyDraw.ts**

```ts
import { checkEligibility, fairDraw, type EligibilityConfig, type Candidate } from './eligibility'

export type { Candidate }
export type Winner = { prize_rank: 1 | 2 | 3; name: string; email: string }

export function buildCandidates(
  allVisits: Array<{ visitor_id: string; day: 1 | 2 | 3; exhibitor_id: string; hall: string }>,
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
    const { eligible } = checkEligibility({
      visits,
      platinumIds,
      socialComplete: socialByVisitor.get(visitorId) ?? false,
      config,
    })
    if (!eligible) continue
    const profile = profiles.get(visitorId)
    if (!profile) continue
    candidates.push({ id: visitorId, name: profile.name, email: profile.email })
  }
  return candidates
}

export function nextPrizeRank(existingWinners: number[]): 1 | 2 | 3 | null {
  for (const rank of [1, 2, 3] as const) {
    if (!existingWinners.includes(rank)) return rank
  }
  return null
}

export { fairDraw }
```

- [ ] **Step 2: Rewrite LuckyDraw.test.ts**

```ts
import { describe, it, expect } from 'vitest'
import { buildCandidates, nextPrizeRank } from '../../lib/luckyDraw'
import type { EligibilityConfig } from '../../lib/eligibility'

const config: EligibilityConfig = { minQualifyingDays: 2, minPlatinumVisits: 3, minTotalCheckins: 0 }
const platinumIds = new Set(['p1', 'p2', 'p3'])

function eligibleVisits(visitorId: string) {
  return [
    { visitor_id: visitorId, day: 1 as const, exhibitor_id: 'p1', hall: 'Jasmine Hall' },
    { visitor_id: visitorId, day: 2 as const, exhibitor_id: 'p2', hall: 'Pavilion Hall' },
    { visitor_id: visitorId, day: 1 as const, exhibitor_id: 'p3', hall: 'Jasmine Hall' },
  ]
}

describe('buildCandidates', () => {
  it('includes eligible visitor', () => {
    const profiles = new Map([['v1', { name: 'Alice', email: 'alice@example.com' }]])
    const social = new Map([['v1', true]])
    const result = buildCandidates(eligibleVisits('v1'), profiles, platinumIds, social, config)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('v1')
    expect(result[0].name).toBe('Alice')
    expect(result[0]).not.toHaveProperty('score')
  })

  it('excludes visitor missing social completion', () => {
    const profiles = new Map([['v1', { name: 'Alice', email: 'alice@example.com' }]])
    const social = new Map([['v1', false]])
    const result = buildCandidates(eligibleVisits('v1'), profiles, platinumIds, social, config)
    expect(result).toHaveLength(0)
  })

  it('excludes visitor with only one qualifying day', () => {
    const visits = [
      { visitor_id: 'v2', day: 1 as const, exhibitor_id: 'p1', hall: 'Jasmine Hall' },
      { visitor_id: 'v2', day: 1 as const, exhibitor_id: 'p2', hall: 'Pavilion Hall' },
      { visitor_id: 'v2', day: 1 as const, exhibitor_id: 'p3', hall: 'Jasmine Hall' },
    ]
    const profiles = new Map([['v2', { name: 'Bob', email: 'b@x.com' }]])
    const social = new Map([['v2', true]])
    const result = buildCandidates(visits, profiles, platinumIds, social, config)
    expect(result).toHaveLength(0)
  })

  it('excludes visitor with no profile', () => {
    const result = buildCandidates(eligibleVisits('v3'), new Map(), platinumIds, new Map([['v3', true]]), config)
    expect(result).toHaveLength(0)
  })
})

describe('nextPrizeRank', () => {
  it('returns 1 when no winners drawn', () => { expect(nextPrizeRank([])).toBe(1) })
  it('returns 2 when rank 1 is drawn', () => { expect(nextPrizeRank([1])).toBe(2) })
  it('returns 3 when ranks 1 and 2 are drawn', () => { expect(nextPrizeRank([1, 2])).toBe(3) })
  it('returns null when all 3 ranks are drawn', () => { expect(nextPrizeRank([1, 2, 3])).toBeNull() })
})
```

- [ ] **Step 3: Run new tests — confirm pass**

```bash
npm test src/test/organizer/LuckyDraw.test.ts
```

Expected: all tests PASS.

- [ ] **Step 4: Delete scoring files**

```bash
rm src/lib/scoring.ts src/lib/scoring.test.ts
```

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all tests pass (scoring tests gone, no other references).

- [ ] **Step 6: Commit**

```bash
git add src/lib/luckyDraw.ts src/test/organizer/LuckyDraw.test.ts
git rm src/lib/scoring.ts src/lib/scoring.test.ts
git commit -m "feat: replace score-weighted draw with fairDraw; update buildCandidates to use checkEligibility"
```

---

## Task 5: Update analytics.ts + Analytics.test.ts

**Files:**
- Modify: `src/lib/analytics.ts`
- Modify: `src/test/organizer/Analytics.test.ts`

- [ ] **Step 1: Update eligibleCount in analytics.ts**

Replace the `eligibleCount` function (keep all other functions untouched):

```ts
import { checkEligibility, type EligibilityConfig } from './eligibility'

export function eligibleCount(
  visitsByVisitor: Map<string, Array<{ exhibitor_id: string; hall: string; day: 1 | 2 | 3 }>>,
  platinumIds: Set<string>,
  socialByVisitor: Map<string, boolean>,
  config: EligibilityConfig
): number {
  let count = 0
  for (const [visitorId, visits] of visitsByVisitor.entries()) {
    const { eligible } = checkEligibility({
      visits,
      platinumIds,
      socialComplete: socialByVisitor.get(visitorId) ?? false,
      config,
    })
    if (eligible) count++
  }
  return count
}
```

Remove the old `import { isEligible } from './scoring'` line.

- [ ] **Step 2: Update Analytics.test.ts**

Replace the `eligibleCount` describe block (keep `buildHallDistribution` tests untouched):

```ts
import { describe, it, expect } from 'vitest'
import { eligibleCount, buildHallDistribution } from '../../lib/analytics'
import type { EligibilityConfig } from '../../lib/eligibility'

const config: EligibilityConfig = { minQualifyingDays: 2, minPlatinumVisits: 1, minTotalCheckins: 0 }
const platinumIds = new Set(['p1'])

describe('eligibleCount', () => {
  it('counts visitors who meet all criteria', () => {
    const visits = new Map([
      ['A', [
        { exhibitor_id: 'p1', hall: 'Jasmine Hall', day: 1 as const },
        { exhibitor_id: 'e1', hall: 'Pavilion Hall', day: 2 as const },
      ]],
      // B: only one day → not eligible
      ['B', [
        { exhibitor_id: 'p1', hall: 'Jasmine Hall', day: 1 as const },
        { exhibitor_id: 'e1', hall: 'Pavilion Hall', day: 1 as const },
      ]],
    ])
    const social = new Map([['A', true], ['B', true]])
    expect(eligibleCount(visits, platinumIds, social, config)).toBe(1)
  })

  it('returns 0 when social not complete', () => {
    const visits = new Map([
      ['A', [
        { exhibitor_id: 'p1', hall: 'Jasmine Hall', day: 1 as const },
        { exhibitor_id: 'e1', hall: 'Pavilion Hall', day: 2 as const },
      ]],
    ])
    const social = new Map([['A', false]])
    expect(eligibleCount(visits, platinumIds, social, config)).toBe(0)
  })
})

// buildHallDistribution tests remain unchanged below this line
```

- [ ] **Step 3: Run tests**

```bash
npm test src/test/organizer/Analytics.test.ts
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/analytics.ts src/test/organizer/Analytics.test.ts
git commit -m "feat: update eligibleCount to use checkEligibility with platinum/social/config"
```

---

## Task 6: Update export.ts — add Excel helpers

**Files:**
- Modify: `src/lib/export.ts`

- [ ] **Step 1: Read current export.ts**

```bash
cat src/lib/export.ts
```

- [ ] **Step 2: Add Excel helpers (keep existing toCsv/downloadCsv)**

Append to `src/lib/export.ts`:

```ts
import * as XLSX from 'xlsx'

export interface ExcelSheet {
  name: string
  rows: Record<string, unknown>[]
}

export function downloadExcel(filename: string, sheets: ExcelSheet[]): void {
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.rows)
    XLSX.utils.book_append_sheet(wb, ws, sheet.name)
  }
  XLSX.writeFile(wb, filename)
}
```

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: all tests pass (no tests for export helpers, TypeScript compile check only).

- [ ] **Step 4: Commit**

```bash
git add src/lib/export.ts
git commit -m "feat: add downloadExcel helper using SheetJS"
```

---

## Task 7: Update exhibitors.ts — parse is_platinum from CSV

**Files:**
- Modify: `src/lib/exhibitors.ts`
- Modify: `src/test/lib/export.test.ts` (if it tests parseExhibitorCsv — check first)

- [ ] **Step 1: Update parseExhibitorCsv**

```ts
export function parseExhibitorCsv(
  csv: string
): Array<{ name: string; booth_number: string; hall: string; is_platinum: boolean }> {
  const lines = csv.trim().split('\n')
  const header = lines[0].split(',').map(c => c.trim().toLowerCase())
  const platinumIdx = header.indexOf('is_platinum')

  return lines.slice(1).flatMap(line => {
    const cols = line.split(',').map(c => c.trim())
    const [name, booth_number, hall] = cols
    if (!name || !booth_number || !hall) return []
    const raw = platinumIdx !== -1 ? cols[platinumIdx] ?? '' : ''
    const is_platinum = raw === 'true' || raw === '1'
    return [{ name, booth_number, hall, is_platinum }]
  })
}
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all tests pass. If `export.test.ts` tests `parseExhibitorCsv`, update those assertions to expect `is_platinum: false` in existing tests.

- [ ] **Step 3: Commit**

```bash
git add src/lib/exhibitors.ts
git commit -m "feat: parse optional is_platinum column from exhibitor CSV"
```

---

## Task 8: Login + Register — info banner + new registration fields

**Files:**
- Modify: `src/pages/visitor/Login.tsx`
- Modify: `src/pages/visitor/Register.tsx`

- [ ] **Step 1: Update Login.tsx — add info banner**

Inside the `<form>` element, add this banner as the first child (before the email field):

```tsx
<div className="bg-amber-50 border-l-4 border-amber-400 rounded-lg px-4 py-3 text-sm text-amber-800">
  Please use the same email address you used to register for your InfoComm India show badge.
</div>
```

- [ ] **Step 2: Update Register.tsx — add banner + two new fields**

Add the same banner as the first child inside `<form>`.

Add `company` and `designation` state:
```tsx
const [company, setCompany] = useState('')
const [designation, setDesignation] = useState('')
```

In `handleSubmit`, update the profiles insert to include the new fields:
```ts
const { error: profileError } = await supabase.from('profiles').insert({
  id: userId, name, email, mobile, role: 'visitor',
  company_name: company, designation,
})
```

Add the two new form fields after the Mobile Number field:

```tsx
<div>
  <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
  <input
    required
    value={company}
    onChange={e => setCompany(e.target.value)}
    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
  />
</div>
<div>
  <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
  <input
    required
    value={designation}
    onChange={e => setDesignation(e.target.value)}
    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
  />
</div>
```

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/pages/visitor/Login.tsx src/pages/visitor/Register.tsx
git commit -m "feat: add badge-email info banner to login/register; add company and designation fields"
```

---

## Task 9: ExhibitorCard — Platinum treatment

**Files:**
- Modify: `src/components/ExhibitorCard.tsx`

- [ ] **Step 1: Update ExhibitorCard**

```tsx
import { CheckCircleIcon } from '@heroicons/react/24/solid'

interface Props {
  id: string
  name: string
  booth_number: string
  hall: string
  visited: boolean
  isPlatinum?: boolean
  subtle?: boolean
  onCheckIn: (id: string) => void
}

export default function ExhibitorCard({
  id, name, booth_number, hall, visited, isPlatinum, subtle, onCheckIn,
}: Props) {
  const baseClass = visited
    ? 'border-green-300 bg-green-50'
    : isPlatinum
    ? 'border-amber-400 bg-amber-50'
    : subtle
    ? 'border-gray-200 bg-primary-subtle'
    : 'border-gray-200 bg-white'

  return (
    <div className={`rounded-xl border p-4 flex items-center justify-between ${baseClass}`}>
      <div>
        {isPlatinum && !visited && (
          <span className="inline-block text-xs font-semibold text-amber-700 bg-amber-100 border border-amber-300 rounded px-1.5 py-0.5 mb-1">
            ★ Platinum Partner
          </span>
        )}
        <p className="font-semibold text-gray-900 text-sm">{name}</p>
        <p className="text-xs text-gray-500">{booth_number} · {hall}</p>
      </div>
      {visited ? (
        <CheckCircleIcon className="w-7 h-7 text-green-500 flex-shrink-0" />
      ) : (
        <button
          onClick={() => onCheckIn(id)}
          className={`text-xs rounded-lg px-3 py-1.5 font-medium flex-shrink-0 ${
            isPlatinum
              ? 'bg-amber-500 text-white'
              : 'bg-primary text-white'
          }`}
        >
          Check In
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/ExhibitorCard.tsx
git commit -m "feat: add Platinum Partner gold treatment to ExhibitorCard"
```

---

## Task 10: SocialFooter component

**Files:**
- Create: `src/components/SocialFooter.tsx`

> **Note:** The social channel URLs below are placeholders. Confirm the correct URLs with the InfoComm India team before going live.

- [ ] **Step 1: Create SocialFooter.tsx**

```tsx
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

type SocialField = 'social_linkedin' | 'social_instagram' | 'social_facebook' | 'social_youtube'

const CHANNELS: Array<{ field: SocialField; label: string; url: string; color: string }> = [
  { field: 'social_linkedin',  label: 'LinkedIn',  url: 'https://www.linkedin.com/company/infocommindia',  color: 'bg-blue-700' },
  { field: 'social_instagram', label: 'Instagram', url: 'https://www.instagram.com/infocommindia',          color: 'bg-pink-600' },
  { field: 'social_facebook',  label: 'Facebook',  url: 'https://www.facebook.com/InfoCommIndia',           color: 'bg-blue-600' },
  { field: 'social_youtube',   label: 'YouTube',   url: 'https://www.youtube.com/@InfoCommIndia',           color: 'bg-red-600' },
]

export default function SocialFooter() {
  const { profile, setProfile } = useAuth()

  if (!profile) return null

  async function handleClick(channel: typeof CHANNELS[number]) {
    if (!profile) return
    if (!profile[channel.field]) {
      await supabase.from('profiles').update({ [channel.field]: true }).eq('id', profile.id)
      setProfile({ ...profile, [channel.field]: true })
    }
    window.open(channel.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-3 py-2 z-20">
      <p className="text-xs text-gray-500 text-center mb-1.5">
        Follow InfoComm India to complete your lucky-draw eligibility
      </p>
      <div className="flex justify-center gap-2">
        {CHANNELS.map(ch => {
          const done = profile[ch.field]
          return (
            <button
              key={ch.field}
              onClick={() => handleClick(ch)}
              className={`flex items-center gap-1 text-xs font-medium text-white rounded-lg px-3 py-1.5 ${
                done ? 'bg-green-600' : ch.color
              }`}
            >
              {done ? '✓ ' : ''}{ch.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update useAuth.ts to expose setProfile**

`useAuth` currently doesn't expose `setProfile`. Update `src/hooks/useAuth.ts`:

```ts
import { useEffect, useState } from 'react'
import { supabase, type Profile } from '../lib/supabase'

type AuthState = {
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
  setProfile: (p: Profile) => void
}

export function useAuth(): AuthState {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(id: string) {
    const { data } = await supabase.from('profiles').select('*').eq('id', id).single()
    setProfile(data)
    setLoading(false)
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) loadProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
  }

  return { profile, loading, signOut, setProfile: (p: Profile) => setProfile(p) }
}
```

Also add `src/hooks/useAuth.ts` to the files list for Task 10.

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/SocialFooter.tsx src/hooks/useAuth.ts
git commit -m "feat: add SocialFooter component with click-tracked social channel buttons"
```

---

## Task 11: ExhibitorList — platinum chip, My Progress link, SocialFooter

**Files:**
- Modify: `src/pages/visitor/ExhibitorList.tsx`

- [ ] **Step 1: Update ExhibitorList.tsx**

Add these imports at the top:
```tsx
import SocialFooter from '../../components/SocialFooter'
```

Add platinum chip state below existing hooks:
```tsx
const platinumExhibitors = exhibitors.filter(e => e.is_platinum)
const platinumVisited = platinumExhibitors.filter(e => hasVisited(e.id)).length
const [minPlatinum, setMinPlatinum] = useState(3)

useEffect(() => {
  async function loadMinPlatinum() {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'min_platinum_visits')
      .single()
    if (data?.value) setMinPlatinum(Number(data.value))
  }
  loadMinPlatinum()
}, [])
```

Update header to add "My Progress" link and remove Leaderboard link:
```tsx
<header className="bg-primary text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10">
  <div>
    <p className="font-bold text-sm">InfoComm India 2026</p>
    <p className="text-xs opacity-70">Hi, {profile?.name}</p>
  </div>
  <div className="flex items-center gap-3">
    <Link to="/my-eligibility" className="text-xs opacity-70">My Progress</Link>
    <button onClick={signOut} className="text-xs opacity-70">Sign out</button>
  </div>
</header>
```

Add platinum chip below HallProgress and above the search input:
```tsx
<div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border ${
  platinumVisited >= minPlatinum
    ? 'bg-green-50 border-green-300 text-green-800'
    : 'bg-amber-50 border-amber-300 text-amber-800'
}`}>
  ★ Platinum Partners: {platinumVisited} / {minPlatinum} required
</div>
```

Pass `isPlatinum` to ExhibitorCard:
```tsx
<ExhibitorCard
  key={e.id}
  id={e.id}
  name={e.name}
  booth_number={e.booth_number}
  hall={e.hall}
  subtle={i % 2 === 0}
  isPlatinum={e.is_platinum}
  visited={hasVisited(e.id)}
  onCheckIn={id => navigate(`/check-in/${id}`)}
/>
```

Add `pb-20` to the outer wrapper div (to clear SocialFooter) and add `<SocialFooter />` as the last child:
```tsx
<div className="min-h-screen bg-gray-50 pb-20">
  ...
  <SocialFooter />
</div>
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/pages/visitor/ExhibitorList.tsx
git commit -m "feat: add platinum progress chip, My Progress link, and SocialFooter to ExhibitorList"
```

---

## Task 12: CheckIn — add SocialFooter

**Files:**
- Modify: `src/pages/visitor/CheckIn.tsx`

- [ ] **Step 1: Add SocialFooter to CheckIn PIN entry step only**

Add import:
```tsx
import SocialFooter from '../../components/SocialFooter'
```

In the PIN entry return (the last `return` in the component):
```tsx
return (
  <div className="min-h-screen bg-white p-6 pb-20">
    <button onClick={() => navigate(-1)} className="text-primary text-sm mb-6">← Back</button>
    <h2 className="text-xl font-bold text-gray-800 mb-2">Enter Exhibitor PIN</h2>
    <p className="text-sm text-gray-500 mb-8">Ask the exhibitor to enter their 4-digit PIN</p>
    <NumPad value={pin} onChange={setPin} onConfirm={handleConfirmPin} error={error} disabled={confirming} />
    <SocialFooter />
  </div>
)
```

- [ ] **Step 2: Run tests + commit**

```bash
npm test
git add src/pages/visitor/CheckIn.tsx
git commit -m "feat: add SocialFooter to CheckIn page"
```

---

## Task 13: MyEligibility page

**Files:**
- Create: `src/pages/visitor/MyEligibility.tsx`

- [ ] **Step 1: Create MyEligibility.tsx**

```tsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useVisits } from '../../hooks/useVisits'
import { useExhibitors } from '../../hooks/useExhibitors'
import { supabase } from '../../lib/supabase'
import { checkEligibility, type EligibilityConfig } from '../../lib/eligibility'
import SocialFooter from '../../components/SocialFooter'

const DEFAULT_CONFIG: EligibilityConfig = { minQualifyingDays: 2, minPlatinumVisits: 3, minTotalCheckins: 0 }

const SOCIAL_LABELS = [
  { field: 'social_linkedin' as const, label: 'LinkedIn' },
  { field: 'social_instagram' as const, label: 'Instagram' },
  { field: 'social_facebook' as const, label: 'Facebook' },
  { field: 'social_youtube' as const, label: 'YouTube' },
]

function Row({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${ok ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-200'}`}>
      <span className="text-lg">{ok ? '✅' : '❌'}</span>
      <span className="text-sm text-gray-800">{label}</span>
    </div>
  )
}

export default function MyEligibility() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { visits } = useVisits(profile?.id ?? '')
  const { exhibitors } = useExhibitors()
  const [config, setConfig] = useState<EligibilityConfig>(DEFAULT_CONFIG)

  useEffect(() => {
    async function loadConfig() {
      const { data } = await supabase
        .from('settings')
        .select('key, value')
        .in('key', ['min_qualifying_days', 'min_platinum_visits', 'min_total_checkins'])
      const map = new Map((data ?? []).map(r => [r.key, r.value]))
      setConfig({
        minQualifyingDays: Number(map.get('min_qualifying_days') ?? 2),
        minPlatinumVisits: Number(map.get('min_platinum_visits') ?? 3),
        minTotalCheckins: Number(map.get('min_total_checkins') ?? 0),
      })
    }
    loadConfig()
  }, [])

  if (!profile) return null

  const platinumIds = new Set(exhibitors.filter(e => e.is_platinum).map(e => e.id))
  const socialComplete =
    profile.social_linkedin &&
    profile.social_instagram &&
    profile.social_facebook &&
    profile.social_youtube

  const visitData = visits.map(v => ({
    exhibitor_id: v.exhibitor_id,
    hall: exhibitors.find(e => e.id === v.exhibitor_id)?.hall ?? '',
    day: v.day,
  }))

  const result = checkEligibility({ visits: visitData, platinumIds, socialComplete, config })

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-primary text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="text-white opacity-80 hover:opacity-100 text-sm">← Back</button>
        <h1 className="text-lg font-bold">My Progress</h1>
      </header>

      <div className="max-w-lg mx-auto p-4 space-y-3">
        <div className={`rounded-xl px-4 py-3 text-center font-semibold text-sm ${
          result.eligible ? 'bg-green-100 text-green-800' : 'bg-amber-50 text-amber-800'
        }`}>
          {result.eligible
            ? '🎉 You are eligible for the lucky draw!'
            : 'Complete the steps below to qualify for the lucky draw'}
        </div>

        <Row
          ok={result.daysVisited >= config.minQualifyingDays}
          label={`Event days visited: ${result.daysVisited} of ${config.minQualifyingDays} required`}
        />
        <Row
          ok={result.hallsCovered.includes('Jasmine Hall')}
          label="Jasmine Hall visited"
        />
        <Row
          ok={result.hallsCovered.includes('Pavilion Hall')}
          label="Pavilion Hall visited"
        />
        <Row
          ok={result.platinumVisits >= config.minPlatinumVisits}
          label={`Platinum Partners visited: ${result.platinumVisits} of ${config.minPlatinumVisits} required`}
        />

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Social Channels</p>
        {SOCIAL_LABELS.map(({ field, label }) => (
          <Row key={field} ok={!!profile[field]} label={`${label} followed`} />
        ))}
      </div>

      <SocialFooter />
    </div>
  )
}
```

- [ ] **Step 2: Run tests + commit**

```bash
npm test
git add src/pages/visitor/MyEligibility.tsx
git commit -m "feat: add MyEligibility checklist page"
```

---

## Task 14: Organizer Settings page

**Files:**
- Create: `src/pages/organizer/Settings.tsx`

- [ ] **Step 1: Create Settings.tsx**

```tsx
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

type Config = { min_qualifying_days: string; min_platinum_visits: string; min_total_checkins: string }

const DEFAULTS: Config = { min_qualifying_days: '2', min_platinum_visits: '3', min_total_checkins: '0' }

export default function Settings() {
  const { signOut } = useAuth()
  const [config, setConfig] = useState<Config>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('settings')
        .select('key, value')
        .in('key', Object.keys(DEFAULTS))
      const map = new Map((data ?? []).map(r => [r.key, r.value]))
      setConfig({
        min_qualifying_days: map.get('min_qualifying_days') ?? DEFAULTS.min_qualifying_days,
        min_platinum_visits: map.get('min_platinum_visits') ?? DEFAULTS.min_platinum_visits,
        min_total_checkins: map.get('min_total_checkins') ?? DEFAULTS.min_total_checkins,
      })
      setLoading(false)
    }
    load()
  }, [])

  async function handleSave() {
    setSaving(true)
    setError('')
    const upserts = Object.entries(config).map(([key, value]) => ({ key, value }))
    const { error: upsertError } = await supabase.from('settings').upsert(upserts)
    if (upsertError) { setError(upsertError.message); setSaving(false); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-primary text-white px-6 py-3 flex items-center justify-between">
        <span className="font-bold">InfoComm India 2026 — Organizer</span>
        <div className="flex items-center gap-4 text-sm">
          <Link to="/organizer" className="hover:underline">Exhibitors</Link>
          <Link to="/organizer/feed" className="hover:underline">Feed</Link>
          <Link to="/organizer/analytics" className="hover:underline">Analytics</Link>
          <Link to="/organizer/draw" className="hover:underline">Lucky Draw</Link>
          <Link to="/organizer/settings" className="underline">Settings</Link>
          <button onClick={signOut} className="bg-white text-primary font-semibold px-3 py-1 rounded">Sign Out</button>
        </div>
      </nav>

      <div className="max-w-lg mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Draw Settings</h1>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            {[
              { key: 'min_qualifying_days', label: 'Minimum qualifying days', min: 1, max: 3, hint: 'Days on which visitor must have at least 1 check-in' },
              { key: 'min_platinum_visits', label: 'Minimum Platinum Partner visits', min: 0, max: 6, hint: 'Number of the 6 Platinum Partners the visitor must visit' },
              { key: 'min_total_checkins', label: 'Minimum total check-ins', min: 0, max: 999, hint: '0 = no minimum' },
            ].map(({ key, label, min, max, hint }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <p className="text-xs text-gray-400 mb-1">{hint}</p>
                <input
                  type="number"
                  min={min}
                  max={max}
                  value={config[key as keyof Config]}
                  onChange={e => setConfig(c => ({ ...c, [key]: e.target.value }))}
                  className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            ))}

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-primary text-white px-5 py-2 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Settings'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run tests + commit**

```bash
npm test
git add src/pages/organizer/Settings.tsx
git commit -m "feat: add organizer Settings page for draw threshold configuration"
```

---

## Task 15: Organizer Exhibitors — platinum toggle

**Files:**
- Modify: `src/pages/organizer/Exhibitors.tsx`

- [ ] **Step 1: Add platinum toggle function**

Add after `regenPin`:

```ts
async function togglePlatinum(exhibitor: Exhibitor) {
  const { error } = await supabase
    .from('exhibitors')
    .update({ is_platinum: !exhibitor.is_platinum })
    .eq('id', exhibitor.id)
  if (!error) await loadExhibitors()
}
```

- [ ] **Step 2: Add Platinum column to the table**

In the `<thead>`, add after the PIN column:
```tsx
<th className="text-left px-4 py-3 font-semibold text-gray-700">Platinum</th>
```

In the non-edit row, add after the PIN cell:
```tsx
<td className="px-4 py-3">
  <button
    onClick={() => togglePlatinum(ex)}
    title={ex.is_platinum ? 'Remove Platinum' : 'Mark as Platinum'}
    className={`text-lg leading-none ${ex.is_platinum ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'}`}
  >
    ★
  </button>
</td>
```

- [ ] **Step 3: Update CSV import to pass is_platinum through**

In `handleCsvImport`, update the `inserts` mapping to include `is_platinum`:

```ts
const inserts = rows.map(row => {
  const pin = generatePin(existingPins)
  existingPins.add(pin)
  return { ...row, pin }
})
```

The `parseExhibitorCsv` now returns `is_platinum` in each row, so this spreads through automatically.

- [ ] **Step 4: Run tests + commit**

```bash
npm test
git add src/pages/organizer/Exhibitors.tsx
git commit -m "feat: add Platinum toggle to organizer Exhibitors table"
```

---

## Task 16: Organizer LuckyDraw — full rewrite

**Files:**
- Modify: `src/pages/organizer/LuckyDraw.tsx`

- [ ] **Step 1: Rewrite LuckyDraw.tsx**

```tsx
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { buildCandidates, nextPrizeRank, fairDraw, type Candidate, type Winner } from '../../lib/luckyDraw'
import { checkEligibility, type EligibilityConfig } from '../../lib/eligibility'
import { downloadExcel } from '../../lib/export'

const DEFAULT_CONFIG: EligibilityConfig = { minQualifyingDays: 2, minPlatinumVisits: 3, minTotalCheckins: 0 }
const RANK_BADGE: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }
const RANK_LABEL: Record<number, string> = { 1: '1st Prize', 2: '2nd Prize', 3: '3rd Prize' }

type DBWinner = Winner & { visitor_id: string; redrawn: boolean }

export default function LuckyDraw() {
  const { signOut } = useAuth()
  const [pool, setPool] = useState<Candidate[]>([])
  const [winners, setWinners] = useState<DBWinner[]>([])
  const [poolBuilt, setPoolBuilt] = useState(false)
  const [building, setBuilding] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [latestWinnerId, setLatestWinnerId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => { loadWinners() }, [])

  async function loadWinners() {
    setLoading(true)
    const { data, error: e } = await supabase
      .from('lucky_draw_winners')
      .select('prize_rank, visitor_id, redrawn, profiles(name, email, company_name, designation)')
      .order('prize_rank')
    if (e) { setError(e.message); setLoading(false); return }
    setWinners(
      (data ?? []).map(w => {
        const wr = w as unknown as {
          prize_rank: number; visitor_id: string; redrawn: boolean
          profiles: { name: string; email: string; company_name: string; designation: string } | null
        }
        return {
          prize_rank: wr.prize_rank as 1 | 2 | 3,
          visitor_id: wr.visitor_id,
          name: wr.profiles?.name ?? 'Unknown',
          email: wr.profiles?.email ?? '',
          redrawn: wr.redrawn,
        }
      })
    )
    setLoading(false)
  }

  async function buildPool() {
    setBuilding(true)
    setError('')
    try {
      const [visitsRes, profilesRes, exhibitorsRes, settingsRes] = await Promise.all([
        supabase.from('visits').select('visitor_id, day, exhibitor_id, exhibitors(hall)'),
        supabase.from('profiles').select('id, name, email, mobile, company_name, designation, social_linkedin, social_instagram, social_facebook, social_youtube').eq('role', 'visitor'),
        supabase.from('exhibitors').select('id, is_platinum'),
        supabase.from('settings').select('key, value').in('key', ['min_qualifying_days', 'min_platinum_visits', 'min_total_checkins']),
      ])

      if (visitsRes.error) throw visitsRes.error
      if (profilesRes.error) throw profilesRes.error

      const settingsMap = new Map((settingsRes.data ?? []).map(r => [r.key, r.value]))
      const config: EligibilityConfig = {
        minQualifyingDays: Number(settingsMap.get('min_qualifying_days') ?? 2),
        minPlatinumVisits: Number(settingsMap.get('min_platinum_visits') ?? 3),
        minTotalCheckins: Number(settingsMap.get('min_total_checkins') ?? 0),
      }

      const platinumIds = new Set(
        (exhibitorsRes.data ?? []).filter(e => e.is_platinum).map(e => e.id)
      )

      const profileMap = new Map(
        (profilesRes.data ?? []).map(p => [p.id, p as typeof p])
      )
      const socialByVisitor = new Map(
        (profilesRes.data ?? []).map(p => [
          p.id,
          !!(p.social_linkedin && p.social_instagram && p.social_facebook && p.social_youtube),
        ])
      )

      const rawVisits = (visitsRes.data ?? []) as unknown as Array<{
        visitor_id: string; day: 1 | 2 | 3; exhibitor_id: string; exhibitors: { hall: string } | null
      }>
      const flatVisits = rawVisits.map(v => ({
        visitor_id: v.visitor_id,
        day: v.day,
        exhibitor_id: v.exhibitor_id,
        hall: v.exhibitors?.hall ?? '',
      }))

      const candidates = buildCandidates(flatVisits, new Map(
        (profilesRes.data ?? []).map(p => [p.id, { name: p.name, email: p.email }])
      ), platinumIds, socialByVisitor, config)

      // Write snapshot: clear then insert fresh
      await supabase.from('lucky_draw_eligible_snapshot').delete().neq('id', '00000000-0000-0000-0000-000000000000')

      if (candidates.length > 0) {
        const snapshots = candidates.map(c => {
          const p = profileMap.get(c.id)
          const visitorVisits = flatVisits.filter(v => v.visitor_id === c.id)
          const res = checkEligibility({ visits: visitorVisits, platinumIds, socialComplete: socialByVisitor.get(c.id) ?? false, config })
          return {
            visitor_id: c.id,
            name: p?.name ?? '',
            email: p?.email ?? '',
            mobile: p?.mobile ?? '',
            company_name: p?.company_name ?? '',
            designation: p?.designation ?? '',
            days_visited: res.daysVisited,
            halls_covered: res.hallsCovered.join(', '),
            platinum_visits: res.platinumVisits,
            social_complete: res.eligible,
          }
        })
        await supabase.from('lucky_draw_eligible_snapshot').insert(snapshots)
      }

      const drawnIds = new Set(winners.filter(w => !w.redrawn).map(w => w.visitor_id))
      setPool(candidates.filter(c => !drawnIds.has(c.id)))
      setPoolBuilt(true)
    } catch (err) {
      setError(String(err))
    }
    setBuilding(false)
  }

  async function runDraw() {
    const next = nextPrizeRank(winners.filter(w => !w.redrawn).map(w => w.prize_rank))
    if (next === null || pool.length === 0) return
    setDrawing(true)

    const winnerId = fairDraw(pool)
    const winnerCandidate = pool.find(c => c.id === winnerId)!

    const { error: insertError } = await supabase
      .from('lucky_draw_winners')
      .insert({ visitor_id: winnerId, prize_rank: next, redrawn: false })

    if (insertError) { setError(insertError.message); setDrawing(false); return }

    const newWinner: DBWinner = {
      prize_rank: next,
      visitor_id: winnerId,
      name: winnerCandidate.name,
      email: winnerCandidate.email,
      redrawn: false,
    }
    setWinners(prev => [...prev, newWinner].sort((a, b) => a.prize_rank - b.prize_rank))
    setPool(prev => prev.filter(c => c.id !== winnerId))
    setLatestWinnerId(winnerId)
    setDrawing(false)
  }

  async function redraw(w: DBWinner) {
    const { error: updateError } = await supabase
      .from('lucky_draw_winners')
      .update({ redrawn: true })
      .eq('visitor_id', w.visitor_id)
      .eq('prize_rank', w.prize_rank)
    if (updateError) { setError(updateError.message); return }
    setWinners(prev => prev.map(x =>
      x.visitor_id === w.visitor_id && x.prize_rank === w.prize_rank ? { ...x, redrawn: true } : x
    ))
    setLatestWinnerId(null)
    // Add back to pool and run draw again
    setPool(prev => [...prev, { id: w.visitor_id, name: w.name, email: w.email }])
    await runDraw()
  }

  async function handleExport() {
    const { data: snapData } = await supabase.from('lucky_draw_eligible_snapshot').select('*')
    const { data: winnerData } = await supabase
      .from('lucky_draw_winners')
      .select('prize_rank, redrawn, profiles(name, email, company_name, designation)')
      .order('prize_rank')

    const poolRows = (snapData ?? []).map(r => ({
      Name: r.name, Email: r.email, Mobile: r.mobile,
      Company: r.company_name, Designation: r.designation,
      'Days Visited': r.days_visited, 'Halls Covered': r.halls_covered,
      'Platinum Visits': r.platinum_visits, 'Social Complete': r.social_complete ? 'Yes' : 'No',
    }))

    const winnerRows = (winnerData ?? []).map(w => {
      const wr = w as unknown as { prize_rank: number; redrawn: boolean; profiles: { name: string; email: string; company_name: string; designation: string } | null }
      return {
        'Prize Rank': RANK_LABEL[wr.prize_rank],
        Name: wr.profiles?.name ?? '', Email: wr.profiles?.email ?? '',
        Company: wr.profiles?.company_name ?? '', Designation: wr.profiles?.designation ?? '',
        Redrawn: wr.redrawn ? 'Yes' : 'No',
      }
    })

    downloadExcel('infocomm-draw.xlsx', [
      { name: 'Eligible Pool', rows: poolRows },
      { name: 'Winners', rows: winnerRows },
    ])
  }

  function enterFullscreen() {
    document.documentElement.requestFullscreen().catch(() => {})
  }

  const activeWinners = winners.filter(w => !w.redrawn)
  const nextRank = nextPrizeRank(activeWinners.map(w => w.prize_rank))
  const canDraw = poolBuilt && nextRank !== null && pool.length > 0 && !drawing

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-primary text-white px-6 py-3 flex items-center justify-between">
        <span className="font-bold">InfoComm India 2026 — Organizer</span>
        <div className="flex items-center gap-4 text-sm">
          <Link to="/organizer" className="hover:underline">Exhibitors</Link>
          <Link to="/organizer/feed" className="hover:underline">Feed</Link>
          <Link to="/organizer/analytics" className="hover:underline">Analytics</Link>
          <Link to="/organizer/draw" className="underline">Lucky Draw</Link>
          <Link to="/organizer/settings" className="hover:underline">Settings</Link>
          <button onClick={signOut} className="bg-white text-primary font-semibold px-3 py-1 rounded">Sign Out</button>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto p-6 space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Lucky Draw</h1>
          <div className="flex gap-2">
            {poolBuilt && (
              <button onClick={handleExport} className="text-sm border border-gray-300 bg-white text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                Export Excel
              </button>
            )}
            <button onClick={enterFullscreen} className="text-sm border border-gray-300 bg-white text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50">
              Fullscreen
            </button>
          </div>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center gap-4">
              <button
                onClick={buildPool}
                disabled={building}
                className="px-6 py-2 border border-primary text-primary font-semibold rounded-xl text-sm hover:bg-primary/5 disabled:opacity-50"
              >
                {building ? 'Building pool…' : poolBuilt ? `Rebuild Pool (${pool.length + activeWinners.length} eligible)` : 'Build Eligible Pool'}
              </button>

              {poolBuilt && (
                <button
                  onClick={runDraw}
                  disabled={!canDraw}
                  className="px-8 py-3 bg-primary text-white font-bold rounded-xl text-lg disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
                >
                  {drawing ? 'Drawing…' : nextRank === null ? 'All prizes drawn' : `Draw ${RANK_LABEL[nextRank]}`}
                </button>
              )}
            </div>

            {winners.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-gray-800">Winners</h2>
                {winners.map(w => (
                  <div key={`${w.prize_rank}-${w.visitor_id}`}
                    className={`bg-white rounded-xl border p-5 flex items-center gap-4 ${w.redrawn ? 'opacity-50' : ''}`}
                  >
                    <span className="text-3xl">{RANK_BADGE[w.prize_rank]}</span>
                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold text-gray-900 ${w.redrawn ? 'line-through' : ''}`}>{w.name}</div>
                      <div className="text-sm text-gray-500 truncate">{w.email}</div>
                      {w.redrawn && <span className="text-xs text-red-500 font-medium">Redrawn</span>}
                    </div>
                    {!w.redrawn && w.visitor_id === latestWinnerId && (
                      <button
                        onClick={() => redraw(w)}
                        className="text-xs text-red-600 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50"
                      >
                        Redraw
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!poolBuilt && (
              <p className="text-center text-gray-500 text-sm">Build the eligible pool before running the draw.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/pages/organizer/LuckyDraw.tsx
git commit -m "feat: rewrite LuckyDraw with fair random draw, pool snapshot, redraw, and fullscreen"
```

---

## Task 17: Organizer Analytics — qualification breakdown + Excel export

**Files:**
- Modify: `src/pages/organizer/Analytics.tsx`

- [ ] **Step 1: Update Analytics.tsx data fetch**

In the `load` function, add three new parallel fetches alongside the existing ones:

```ts
const [visitsRes, exhibitorsRes, settingsRes, profilesRes] = await Promise.all([
  supabase.from('visits').select('visitor_id, day, exhibitor_id, visited_at, rating'),
  supabase.from('exhibitors').select('id, hall, name, booth_number, is_platinum'),
  supabase.from('settings').select('key, value'),
  supabase.from('profiles').select('id, name, email, mobile, company_name, designation, social_linkedin, social_instagram, social_facebook, social_youtube').eq('role', 'visitor'),
])
```

Build config, platinumIds, and socialByVisitor from the new data:

```ts
const settingsMap = new Map((settingsRes.data ?? []).map(r => [r.key as string, r.value as string]))
const config: EligibilityConfig = {
  minQualifyingDays: Number(settingsMap.get('min_qualifying_days') ?? 2),
  minPlatinumVisits: Number(settingsMap.get('min_platinum_visits') ?? 3),
  minTotalCheckins: Number(settingsMap.get('min_total_checkins') ?? 0),
}
const platinumIds = new Set(
  (exhibitorsRes.data ?? []).filter(e => e.is_platinum).map(e => e.id)
)
const socialByVisitor = new Map(
  (profilesRes.data ?? []).map(p => [
    p.id,
    !!(p.social_linkedin && p.social_instagram && p.social_facebook && p.social_youtube),
  ])
)
```

Update the `visitsByVisitor` map to include `exhibitor_id` and `hall`:

```ts
const visitsByVisitor = new Map<string, Array<{ exhibitor_id: string; hall: string; day: 1|2|3 }>>()
const exhibitorHall = new Map((exhibitorsRes.data ?? []).map(e => [e.id, e.hall]))
for (const v of allVisits) {
  if (!visitsByVisitor.has(v.visitor_id)) visitsByVisitor.set(v.visitor_id, [])
  visitsByVisitor.get(v.visitor_id)!.push({
    exhibitor_id: v.exhibitor_id,
    hall: exhibitorHall.get(v.exhibitor_id) ?? '',
    day: v.day,
  })
}
```

Update `eligibleCount` call:
```ts
const eligible = eligibleCount(visitsByVisitor, platinumIds, socialByVisitor, config)
```

Add import at top:
```ts
import { checkEligibility, type EligibilityConfig } from '../../lib/eligibility'
import { downloadExcel } from '../../lib/export'
```

Also add `qualificationRows` to Stats and compute it:
```ts
// Inside load(), after computing eligible:
const qualificationRows = (profilesRes.data ?? []).map(p => {
  const visits = visitsByVisitor.get(p.id) ?? []
  const result = checkEligibility({ visits, platinumIds, socialComplete: socialByVisitor.get(p.id) ?? false, config })
  return {
    id: p.id,
    name: p.name,
    company: p.company_name,
    daysVisited: result.daysVisited,
    halls: result.hallsCovered.join(', '),
    platinumVisits: result.platinumVisits,
    socialComplete: result.eligible ? 'Yes' : 'No',  // simplification: social is part of eligible
    isQualified: result.eligible,
  }
})
```

Add `qualificationRows` to the `Stats` type and `setStats` call.

- [ ] **Step 2: Replace Export button with Excel export**

Replace `handleExport` with:

```ts
async function handleExport() {
  setExporting(true)
  try {
    const { data, error: fetchError } = await supabase
      .from('visits')
      .select('*, profiles(name, email, mobile, company_name, designation), exhibitors(name, booth_number, hall)')
    if (fetchError) { setError(fetchError.message); return }

    const allVisitRows = (data ?? []).map((v: Record<string, unknown>) => {
      const profile = v.profiles as Record<string, unknown> | null
      const exhibitor = v.exhibitors as Record<string, unknown> | null
      const isQual = stats?.qualificationRows.find((r: { id: string; isQualified: boolean }) => r.id === v.visitor_id)?.isQualified ?? false
      return {
        'Visitor Name': profile?.name ?? '',
        'Email': profile?.email ?? '',
        'Mobile': profile?.mobile ?? '',
        'Company': profile?.company_name ?? '',
        'Designation': profile?.designation ?? '',
        'Exhibitor Name': exhibitor?.name ?? '',
        'Booth': exhibitor?.booth_number ?? '',
        'Hall': exhibitor?.hall ?? '',
        'Day': v.day,
        'Visited At': v.visited_at,
        'Rating': v.rating,
        'Is Qualified': isQual ? 'Yes' : 'No',
      }
    })

    const qualRows = (stats?.qualificationRows ?? [])
      .filter((r: { isQualified: boolean }) => r.isQualified)
      .map((r: { name: string; company: string; daysVisited: number; halls: string; platinumVisits: number; socialComplete: string; isQualified: boolean }) => ({
        Name: r.name, Company: r.company,
        'Days Visited': r.daysVisited, 'Halls': r.halls,
        'Platinum Visits': r.platinumVisits, 'Social Complete': r.socialComplete,
        'Is Qualified': 'Yes',
      }))

    downloadExcel('infocomm-visits.xlsx', [
      { name: 'All Visits', rows: allVisitRows },
      { name: 'Qualified Visitors', rows: qualRows },
    ])
  } finally {
    setExporting(false)
  }
}
```

- [ ] **Step 3: Add Visitor Qualification Breakdown section**

Add this section at the end of the stats JSX (after the Leaderboard toggle section):

```tsx
<div>
  <h2 className="text-lg font-semibold text-gray-800 mb-3">Visitor Qualification Breakdown</h2>
  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b border-gray-200">
        <tr>
          <th className="text-left px-4 py-3 font-semibold text-gray-700">Name</th>
          <th className="text-left px-4 py-3 font-semibold text-gray-700">Company</th>
          <th className="text-center px-4 py-3 font-semibold text-gray-700">Days</th>
          <th className="text-left px-4 py-3 font-semibold text-gray-700">Halls</th>
          <th className="text-center px-4 py-3 font-semibold text-gray-700">Platinum</th>
          <th className="text-center px-4 py-3 font-semibold text-gray-700">Social</th>
          <th className="text-center px-4 py-3 font-semibold text-gray-700">Qualified</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {(stats.qualificationRows ?? []).map((r: { id: string; name: string; company: string; daysVisited: number; halls: string; platinumVisits: number; socialComplete: string; isQualified: boolean }) => (
          <tr key={r.id} className="odd:bg-primary-subtle">
            <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
            <td className="px-4 py-3 text-gray-600">{r.company}</td>
            <td className="px-4 py-3 text-center text-gray-700">{r.daysVisited}</td>
            <td className="px-4 py-3 text-gray-600 text-xs">{r.halls}</td>
            <td className="px-4 py-3 text-center text-gray-700">{r.platinumVisits}</td>
            <td className="px-4 py-3 text-center">{r.socialComplete === 'Yes' ? '✅' : '❌'}</td>
            <td className="px-4 py-3 text-center">
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${r.isQualified ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                {r.isQualified ? 'Yes' : 'No'}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pages/organizer/Analytics.tsx
git commit -m "feat: update Analytics with eligibility breakdown table and Excel export"
```

---

## Task 18: Router — add new routes + build check

**Files:**
- Modify: `src/router.tsx`

- [ ] **Step 1: Update router.tsx**

```tsx
import { createBrowserRouter } from 'react-router-dom'
import Register from './pages/visitor/Register'
import Login from './pages/visitor/Login'
import ExhibitorList from './pages/visitor/ExhibitorList'
import CheckIn from './pages/visitor/CheckIn'
import Leaderboard from './pages/visitor/Leaderboard'
import MyEligibility from './pages/visitor/MyEligibility'
import OrganizerLogin from './pages/organizer/Login'
import Exhibitors from './pages/organizer/Exhibitors'
import VisitFeed from './pages/organizer/VisitFeed'
import Analytics from './pages/organizer/Analytics'
import LuckyDraw from './pages/organizer/LuckyDraw'
import Settings from './pages/organizer/Settings'
import VisitorRoute from './guards/VisitorRoute'
import OrganizerRoute from './guards/OrganizerRoute'

export const router = createBrowserRouter([
  { path: '/register', element: <Register /> },
  { path: '/login', element: <Login /> },
  { path: '/', element: <VisitorRoute><ExhibitorList /></VisitorRoute> },
  { path: '/check-in/:exhibitorId', element: <VisitorRoute><CheckIn /></VisitorRoute> },
  { path: '/leaderboard', element: <VisitorRoute><Leaderboard /></VisitorRoute> },
  { path: '/my-eligibility', element: <VisitorRoute><MyEligibility /></VisitorRoute> },
  { path: '/organizer/login', element: <OrganizerLogin /> },
  { path: '/organizer', element: <OrganizerRoute><Exhibitors /></OrganizerRoute> },
  { path: '/organizer/feed', element: <OrganizerRoute><VisitFeed /></OrganizerRoute> },
  { path: '/organizer/analytics', element: <OrganizerRoute><Analytics /></OrganizerRoute> },
  { path: '/organizer/draw', element: <OrganizerRoute><LuckyDraw /></OrganizerRoute> },
  { path: '/organizer/settings', element: <OrganizerRoute><Settings /></OrganizerRoute> },
])
```

- [ ] **Step 2: Update nav links in all organizer pages**

Add `<Link to="/organizer/settings" className="hover:underline">Settings</Link>` to the nav bar in: `Exhibitors.tsx`, `VisitFeed.tsx`, `Analytics.tsx`. (LuckyDraw and Settings already have it from Tasks 14 and 16.)

- [ ] **Step 3: Full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Build check**

```bash
npm run build
```

Expected: zero TypeScript errors, build succeeds.

- [ ] **Step 5: Lint**

```bash
npm run lint
```

Fix any oxlint warnings before committing.

- [ ] **Step 6: Final commit**

```bash
git add src/router.tsx src/pages/organizer/Exhibitors.tsx src/pages/organizer/VisitFeed.tsx src/pages/organizer/Analytics.tsx
git commit -m "feat: add /my-eligibility and /organizer/settings routes; add Settings nav link"
```

---

## Post-implementation checklist

- [ ] Confirm social channel URLs with InfoComm India team and update constants in `SocialFooter.tsx`
- [ ] Verify `useAuth` exposes `setProfile` (Task 10 Step 2 — manual check required)
- [ ] Start dev server (`npm run dev`) and walk through the visitor registration flow end-to-end
- [ ] Test platinum toggle on an exhibitor and verify the gold card appears in the visitor list
- [ ] Run a lucky draw end-to-end: build pool → draw → redraw → export
- [ ] Test fullscreen mode on a connected display
