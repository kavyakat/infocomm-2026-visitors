# InfoComm India 2026 — Qualification & Lucky Draw Redesign

**Date:** 2026-08-26  
**Status:** Approved  

---

## Overview

End-to-end redesign of visitor qualification rules, Platinum Partner tracking, lucky draw mechanics, social media eligibility, and organizer controls. All eligibility thresholds are configurable from the organizer dashboard via the `settings` table.

---

## 1. Database Schema Changes

### `exhibitors` table
- Add `is_platinum BOOLEAN DEFAULT false` — toggled per exhibitor by the organizer.

### `profiles` table
- Add `company_name TEXT NOT NULL DEFAULT ''`
- Add `designation TEXT NOT NULL DEFAULT ''`
- Add `social_linkedin BOOLEAN DEFAULT false`
- Add `social_instagram BOOLEAN DEFAULT false`
- Add `social_facebook BOOLEAN DEFAULT false`
- Add `social_youtube BOOLEAN DEFAULT false`

### `settings` table (new rows, seeded on first use)

| key | default | description |
|-----|---------|-------------|
| `min_qualifying_days` | `2` | Minimum distinct event days with at least one check-in |
| `min_platinum_visits` | `3` | Minimum Platinum Partner check-ins required |
| `min_total_checkins` | `0` | Minimum total check-ins (0 = no minimum) |

### `lucky_draw_winners` table
- Add `redrawn BOOLEAN DEFAULT false` — marks a winner as absent/failed verification. Original row is kept for audit; a new winner is drawn from the remaining pool.

### `lucky_draw_eligible_snapshot` table (new)
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `visitor_id UUID REFERENCES profiles(id)`
- `name TEXT`
- `email TEXT`
- `mobile TEXT`
- `company_name TEXT`
- `designation TEXT`
- `days_visited INTEGER`
- `halls_covered TEXT` — comma-separated hall names
- `platinum_visits INTEGER`
- `social_complete BOOLEAN`
- `created_at TIMESTAMPTZ DEFAULT now()`

Written per "Build Pool" action. Each rebuild creates a new snapshot; prior snapshots are kept for audit. The draw always operates on the most recent snapshot. Exportable.

---

## 2. Eligibility Logic

### New module: `src/lib/eligibility.ts`

Replaces `isEligible` and `calculateScore` in `scoring.ts`. `scoring.ts` is deleted.

```ts
interface EligibilityConfig {
  minQualifyingDays: number   // default 2
  minPlatinumVisits: number   // default 3
  minTotalCheckins: number    // default 0
}

interface EligibilityInput {
  visits: Array<{ exhibitor_id: string; hall: string; day: 1|2|3 }>
  platinumIds: Set<string>
  socialComplete: boolean
  config: EligibilityConfig
}

interface EligibilityResult {
  eligible: boolean
  daysVisited: number
  hallsCovered: string[]
  platinumVisits: number
  totalCheckins: number
  reasons: string[]   // human-readable failure reasons
}

function checkEligibility(input: EligibilityInput): EligibilityResult
```

Rules evaluated (all must pass):
1. `distinctDays >= minQualifyingDays` — non-consecutive days allowed
2. Both `"Jasmine Hall"` and `"Pavilion Hall"` present in visits
3. `platinumVisitCount >= minPlatinumVisits`
4. `totalCheckins >= minTotalCheckins` (skipped if 0)
5. `socialComplete === true` (all four channels clicked)

### Updated `src/lib/luckyDraw.ts`
- `buildCandidates` calls `checkEligibility`; drops `score` from `Candidate`
- `weightedDraw` deleted
- New export: `fairDraw(pool: Candidate[]): string` — picks by `Math.random()`, uniform distribution

---

## 3. Visitor-Facing UI

### Registration (`src/pages/visitor/Register.tsx`)
- New fields added (all required): **Company Name**, **Designation**
- Field order: Full Name → Email → Mobile Number → Company Name → Designation
- Info banner above first field (inside the card):
  > "Please use the same email address you used to register for your InfoComm India show badge."
- Banner style: amber/yellow background, left border, small text

### Login (`src/pages/visitor/Login.tsx`)
- Same info banner above the email field.

### ExhibitorCard (`src/components/ExhibitorCard.tsx`)
- New prop: `isPlatinum: boolean`
- When `isPlatinum && !visited`: gold gradient border (`from-yellow-400 to-amber-500`), subtle gold/amber background tint, small badge: `★ Platinum Partner`
- When `visited`: standard green check (visited state takes precedence visually)
- Regular exhibitors: no change

### ExhibitorList (`src/pages/visitor/ExhibitorList.tsx`)
- New sticky section below `HallProgress`:
  - **Platinum Partners progress chip**: `"Platinum Partners: 2 / 3 required"` — amber when below threshold, green when met
  - **"My Progress" link** in the header navigates to `/my-eligibility`
- Leaderboard link removed from visitor nav header

### Social Footer (`src/components/SocialFooter.tsx` — new)
- Fixed bottom bar on all visitor pages (ExhibitorList, CheckIn, `/my-eligibility`)
- Height: ~56px, does not obscure content (pages add `pb-16` padding)
- Copy: `"Follow InfoComm India to complete your lucky-draw eligibility"`
- Four buttons: LinkedIn, Instagram, Facebook, YouTube
- On tap: upsert `social_<channel> = true` on profiles via Supabase, then open channel URL in new tab
- Once clicked: button turns green with a checkmark. If `social_<channel>` is already true, clicking again reopens the link without a DB write.

### My Eligibility page (`src/pages/visitor/MyEligibility.tsx` — new, route `/my-eligibility`)
Checklist view:
- Days visited (e.g. `✅ 2 of 2 required` or `❌ 1 of 2 required`)
- Both halls covered (✅/❌, shows which halls visited)
- Platinum Partners (e.g. `✅ 3 of 3 required`)
- Social channels (4 individual rows with channel name + status)
- Overall status banner: `"You are eligible for the lucky draw!"` or `"Complete the steps above to qualify"`

### Leaderboard page
- Removed from visitor nav. Page itself remains accessible (organizer uses it) but no link from visitor UI.

---

## 4. Organizer Lucky Draw (`src/pages/organizer/LuckyDraw.tsx`)

Full rewrite:

### Pool building
- "Build Eligible Pool" button: fetches all visits + profiles + settings + platinum IDs, runs `checkEligibility` for each visitor, writes snapshot to `lucky_draw_eligible_snapshot`, shows pool count.
- Pool is rebuilt on demand (organizer can refresh). Snapshot records the moment it was built.

### Draw flow
1. "Run Draw — 1st Prize" button: calls `fairDraw(pool)`, announces winner with name, email, company, designation.
2. "Fullscreen" button: puts the winner reveal card into browser fullscreen via `document.documentElement.requestFullscreen()`. Works on HDMI-connected displays.
3. "Redraw" button (shown after winner reveal): marks current `lucky_draw_winners` row as `redrawn = true`, removes from active pool, reruns `fairDraw`. Original winner row preserved in DB.
4. Up to 3 prizes total. Drawn winners are excluded from subsequent draws.

### Display
- Winners list shows all draws; redrawn entries are struck-through with a "Redrawn" label.
- Eligible count shown as `"47 eligible visitors"`.
- No score column; no scoring displayed anywhere.

### Export
- "Export" button generates an Excel file (`infocomm-draw.xlsx`) with two sheets:
  1. **Eligible Pool** — one row per eligible visitor: name, email, mobile, company, designation, days_visited, halls_covered, platinum_visits, social_complete
  2. **Winners** — prize rank, name, email, company, designation, redrawn (yes/no)

---

## 5. Organizer Exhibitors (`src/pages/organizer/Exhibitors.tsx`)

- New "Platinum" toggle per row: star icon button, toggles `is_platinum` on exhibitors. Platinum rows display a gold star badge in the Name column.
- CSV import: optional `is_platinum` column (`true`/`false`/`1`/`0`) parsed in `parseExhibitorCsv`.
- The 6 known Platinum Partners (BenQ, Crestron, Epson, Harman, Shure, Vega) are flagged via the dashboard toggle, not hardcoded.

---

## 6. Organizer Settings (`src/pages/organizer/Settings.tsx` — new, route `/organizer/settings`)

Editable fields:
- Minimum qualifying days (number input, min 1, max 3)
- Minimum Platinum Partner visits (number input, min 0)
- Minimum total check-ins (number input, min 0; label: "0 = no minimum")

Save button upserts to `settings` table. Nav link added to organizer nav bar.

---

## 7. Organizer Analytics (`src/pages/organizer/Analytics.tsx`)

- "Eligible Visitors" stat card updated to use `checkEligibility`.
- New section: **Visitor Qualification Breakdown** — table with one row per visitor:
  columns: name, company, days visited, halls, platinum visits, social status, is_qualified (Yes/No).
  Filterable by qualified/not-qualified.

### Excel export (replaces current CSV)
Main "Export" button now generates `infocomm-visits.xlsx` with two sheets:
1. **All Visits** — same columns as current CSV export + `is_qualified` (Yes/No) column per row, looked up by visitor_id
2. **Qualified Visitors** — one row per qualified visitor: name, email, mobile, company_name, designation, days_visited, halls_covered, platinum_visits, social_complete, is_qualified

New dependency: `xlsx` (SheetJS, Apache-2.0 license).

---

## 8. TypeScript / Supabase types

`src/lib/supabase.ts` — update `Profile` type:
```ts
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
```

---

## 9. Files changed / created

| Action | Path |
|--------|------|
| Delete | `src/lib/scoring.ts` |
| Delete | `src/lib/scoring.test.ts` |
| Create | `src/lib/eligibility.ts` |
| Create | `src/test/lib/eligibility.test.ts` |
| Update | `src/lib/luckyDraw.ts` |
| Update | `src/test/organizer/LuckyDraw.test.ts` |
| Update | `src/lib/analytics.ts` |
| Update | `src/lib/exhibitors.ts` |
| Update | `src/lib/supabase.ts` |
| Update | `src/lib/export.ts` (add Excel helpers) |
| Update | `src/pages/visitor/Login.tsx` |
| Update | `src/pages/visitor/Register.tsx` |
| Update | `src/pages/visitor/ExhibitorList.tsx` |
| Update | `src/components/ExhibitorCard.tsx` |
| Update | `src/pages/organizer/LuckyDraw.tsx` |
| Update | `src/pages/organizer/Exhibitors.tsx` |
| Update | `src/pages/organizer/Analytics.tsx` |
| Update | `src/router.tsx` |
| Create | `src/components/SocialFooter.tsx` |
| Create | `src/pages/visitor/MyEligibility.tsx` |
| Create | `src/pages/organizer/Settings.tsx` |

---

## 10. Out of scope

- OAuth-based social follow verification (platform approval timelines)
- Push notifications
- Multi-language support
