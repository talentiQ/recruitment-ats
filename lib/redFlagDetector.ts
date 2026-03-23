// lib/redFlagDetector.ts
// Pure TypeScript — zero external dependencies.
// Detects resume red flags from raw text and parsed data.
//
// Flag severity:
//   CRITICAL — overlapping date ranges at different companies (fabricated)
//   WARNING  — short company tenure < 1 year, employment gap > 6 months
//
// Key design decisions:
//   1. Tenure measured at COMPANY level — internal promotions not flagged
//   2. Gaps after internships (< 3 month roles) are NOT flagged — study periods
//   3. Education year ranges excluded from experience mismatch calculation
//   4. "Organization: X" label format handled alongside standard company headers

export type FlagSeverity = 'critical' | 'warning'

export interface RedFlag {
  type:     string
  severity: FlagSeverity
  message:  string
  detail?:  string
}

export interface RedFlagResult {
  hasFlags:       boolean
  hasCritical:    boolean
  hasWarnings:    boolean
  flags:          RedFlag[]
  overallVerdict: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  jan:1, feb:2, mar:3, apr:4, may:5,  jun:6,
  jul:7, aug:8, sep:9, oct:10,nov:11, dec:12,
}

// Company name signals — words that appear in company names
const COMPANY_NAME_SIGNALS = /\b(ltd|pvt|inc|corp|limited|technologies|technology|company|industries|solutions|services|bank|global|international|consulting|associates|enterprises|systems|group|ventures|holdings|digital|analytics|infosys|wipro|tcs|accenture|cognizant|capgemini|deloitte|kpmg|pwc|ey)\b/i

// Section headers — lines to skip entirely
const SECTION_HEADERS = new Set([
  'professional experience','experience','work experience',
  'employment history','career history','work history',
  'education','academic background','educational qualification','qualifications',
  'skills','profile','summary','profile summary','key qualifications',
  'languages','certifications','projects','references','achievements',
  'current details','personal details','declaration','interests',
])

// Education section markers — once we see these, stop processing for experience
const EDUCATION_SECTION_MARKERS = new Set([
  'education','academic background','educational qualification',
  'qualifications','academic details','educational details',
])

// Internship signals — roles with these keywords are internships
const INTERNSHIP_SIGNALS = /\b(intern|internship|trainee|apprentice|temporary|temp|part.time|contract|freelance)\b/i

// ─── Types ────────────────────────────────────────────────────────────────────

interface DateRange {
  start:          Date
  end:            Date
  startLabel:     string
  endLabel:       string
  durationMonths: number
  isInternship:   boolean
}

interface CompanyTenure {
  company:      string
  roles:        DateRange[]
  totalStart:   Date
  totalEnd:     Date
  totalMonths:  number
  roleCount:    number
  isInternship: boolean   // true if ALL roles at this company are internships
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseMonthYear(mon: string, yr: string): Date {
  const m = MONTH_MAP[mon.toLowerCase().slice(0, 3)] || 1
  return new Date(parseInt(yr), m - 1, 1)
}

function monthDiff(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
}

// ─── Company-aware extraction ─────────────────────────────────────────────────

function extractCompanyTenures(rawText: string): CompanyTenure[] {
  const now    = new Date()
  const months = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec'
  const monthRangeRegex = new RegExp(
    `(${months})[a-z]*[\\s,]+(\\d{4})\\s*[–\\-—to]+\\s*(Present|Current|Till\\s*Date|(${months})[a-z]*[\\s,]+(\\d{4}))`,
    'gi'
  )

  const lines          = rawText.split('\n')
  let   currentCompany = '__UNKNOWN__'
  let   currentIsInternship = false
  let   inEducationSection  = false
  const companyMap     = new Map<string, { ranges: DateRange[] }>()
  const companyOrder:  string[] = []

  for (const rawLine of lines) {
    const line  = rawLine.trim()
    if (!line) continue

    const lower = line.toLowerCase().replace(/[:\-–—]+$/, '').trim()

    // Stop processing once we hit education section
    if (EDUCATION_SECTION_MARKERS.has(lower)) {
      inEducationSection = true
      continue
    }

    // Resume education section after known experience markers
    if (['work experience','professional experience','experience','employment history'].includes(lower)) {
      inEducationSection = false
      continue
    }

    // Skip education section content entirely (year ranges in edu tables are not jobs)
    if (inEducationSection) continue

    if (SECTION_HEADERS.has(lower)) continue

    // ── "Organization: Company Name" format (Naukri candidate info sheets) ───
    const orgMatch = line.match(/^organization\s*[:\-]\s*(.+)/i)
    if (orgMatch) {
      let name = orgMatch[1].replace(/\(internship\)/gi, '').trim()
      currentIsInternship = INTERNSHIP_SIGNALS.test(orgMatch[1])
      currentCompany = name
      if (!companyMap.has(currentCompany)) {
        companyMap.set(currentCompany, { ranges: [] })
        companyOrder.push(currentCompany)
      }
      continue
    }

    // ── "Designation: X" — pick up internship signal from designation line ───
    const desigMatch = line.match(/^designation\s*[:\-]\s*(.+)/i)
    if (desigMatch && INTERNSHIP_SIGNALS.test(desigMatch[1])) {
      currentIsInternship = true
    }

    // ── Standard company header line (no date, has company keywords) ─────────
    const dateMatches = [...line.matchAll(new RegExp(
      `(${months})[a-z]*[\\s,]+(\\d{4})\\s*[–\\-—to]+\\s*(Present|Current|Till\\s*Date|(${months})[a-z]*[\\s,]+(\\d{4}))`,
      'gi'
    ))]

    if (dateMatches.length === 0 && !orgMatch) {
      const isBullet      = /^[•\-\*▪▸]/.test(line)
      const isResponsibility = /\b(responsible|managed|led|developed|worked|achieved|reduced|improved|handled|ensured|conducted)\b/i.test(line)
      const isCompanyLine = !isBullet && !isResponsibility && line.length < 100 && COMPANY_NAME_SIGNALS.test(line)

      if (isCompanyLine) {
        const cleanName = line.replace(/\(.*?\)/g, '').trim()
        currentIsInternship = INTERNSHIP_SIGNALS.test(line)
        currentCompany  = cleanName
        if (!companyMap.has(currentCompany)) {
          companyMap.set(currentCompany, { ranges: [] })
          companyOrder.push(currentCompany)
        }
      }
      continue
    }

    // ── Extract date ranges from this line ────────────────────────────────────
    for (const m of dateMatches) {
      const startMon = m[1], startYr = m[2]
      const startDate = parseMonthYear(startMon, startYr)
      if (startDate.getFullYear() < 1970) continue

      let endDate: Date, endLabel: string
      if (/present|current|till/i.test(m[3])) {
        endDate = now; endLabel = 'Present'
      } else if (m[4] && m[5]) {
        endDate  = parseMonthYear(m[4] as string, m[5] as string)
        endLabel = `${m[4]} ${m[5]}`
      } else continue

      if (startDate >= endDate) continue

      const dur = monthDiff(startDate, endDate)

      // Detect internship from explicit signals only — NOT duration alone
      // (a real job can be short; duration < 3mo does not mean internship)
      const isInternship = currentIsInternship || INTERNSHIP_SIGNALS.test(line)

      const range: DateRange = {
        start: startDate, end: endDate,
        startLabel: `${startMon} ${startYr}`, endLabel,
        durationMonths: dur,
        isInternship,
      }

      if (!companyMap.has(currentCompany)) {
        companyMap.set(currentCompany, { ranges: [] })
        companyOrder.push(currentCompany)
      }
      companyMap.get(currentCompany)!.ranges.push(range)
    }
  }

  // Convert map → CompanyTenure[]
  const tenures: CompanyTenure[] = []
  for (const company of companyOrder) {
    const { ranges } = companyMap.get(company) || { ranges: [] }
    if (ranges.length === 0) continue

    ranges.sort((a, b) => a.start.getTime() - b.start.getTime())
    const totalStart    = ranges[0].start
    const totalEnd      = ranges[ranges.length - 1].end
    const totalMonths   = monthDiff(totalStart, totalEnd) || ranges[0].durationMonths
    const isInternship  = ranges.every(r => r.isInternship)

    tenures.push({
      company, roles: ranges,
      totalStart, totalEnd, totalMonths,
      roleCount: ranges.length,
      isInternship,
    })
  }

  // Fallback: no company structure found — flat list
  if (tenures.length === 0) {
    for (const m of [...rawText.matchAll(monthRangeRegex)]) {
      const startDate = parseMonthYear(m[1], m[2])
      if (startDate.getFullYear() < 1970) continue
      let endDate: Date, endLabel: string
      if (/present|current|till/i.test(m[3])) { endDate = now; endLabel = 'Present' }
      else if (m[4] && m[5]) { endDate = parseMonthYear(m[4] as string, m[5] as string); endLabel = `${m[4]} ${m[5]}` }
      else continue
      if (startDate >= endDate) continue
      const dur = monthDiff(startDate, endDate)
      const isInternship = INTERNSHIP_SIGNALS.test(rawText.slice(Math.max(0, m.index! - 200), m.index!))
      const range: DateRange = { start: startDate, end: endDate, startLabel: `${m[1]} ${m[2]}`, endLabel, durationMonths: dur, isInternship }
      tenures.push({ company: `${m[1]} ${m[2]}`, roles: [range], totalStart: startDate, totalEnd: endDate, totalMonths: dur, roleCount: 1, isInternship })
    }
  }

  return tenures.sort((a, b) => a.totalStart.getTime() - b.totalStart.getTime())
}

// ─── Flag 1: Overlapping dates (CRITICAL) ─────────────────────────────────────

function detectOverlaps(tenures: CompanyTenure[]): RedFlag[] {
  const flags: RedFlag[] = []
  const realJobs = tenures.filter(t => !t.isInternship)

  for (let i = 0; i < realJobs.length - 1; i++) {
    for (let j = i + 1; j < realJobs.length; j++) {
      const a = realJobs[i], b = realJobs[j]
      if (a.company === b.company) continue

      const aEndMs   = a.totalEnd.getTime()
      const bStartMs = new Date(b.totalStart.getFullYear(), b.totalStart.getMonth() + 1, 1).getTime()

      if (aEndMs > bStartMs && b.totalEnd.getTime() > a.totalStart.getTime()) {
        const overlapMonths = Math.round(
          (Math.min(aEndMs, b.totalEnd.getTime()) - Math.max(a.totalStart.getTime(), b.totalStart.getTime())) /
          (1000 * 60 * 60 * 24 * 30.44)
        )
        if (overlapMonths >= 2) {
          flags.push({
            type:     'overlapping_dates',
            severity: 'critical',
            message:  'Overlapping employment at different companies',
            detail:   `${a.company} (until ${a.roles[a.roles.length-1].endLabel}) overlaps with ${b.company} (from ${b.roles[0].startLabel}) by ~${overlapMonths} months. May indicate fabricated experience.`,
          })
        }
      }
    }
  }

  return flags
}

// ─── Flag 2: Short company tenure (WARNING) ───────────────────────────────────
// Only checks real jobs — internships are always excluded from tenure flagging.

function detectShortTenures(tenures: CompanyTenure[]): RedFlag[] {
  // Only flag real jobs (not internships) with total tenure < 12 months
  const shortCompanies = tenures.filter(t =>
    !t.isInternship &&
    t.totalMonths > 0 &&
    t.totalMonths < 12 &&
    t.company !== '__UNKNOWN__'
  )

  if (shortCompanies.length >= 2) {
    const details = shortCompanies
      .map(t => `${t.company} (${t.totalMonths} months)`)
      .join(', ')
    return [{
      type:     'short_tenure',
      severity: 'warning',
      message:  `${shortCompanies.length} companies with tenure less than 1 year`,
      detail:   `Short stints: ${details}. Could be contract roles — verify with candidate.`,
    }]
  }

  if (shortCompanies.length === 1) {
    const t = shortCompanies[0]
    const realJobs  = tenures.filter(x => !x.isInternship)
    const mostRecent = [...realJobs].sort((a, b) => b.totalStart.getTime() - a.totalStart.getTime())[0]
    if (mostRecent?.company === t.company) {
      return [{
        type:     'short_tenure',
        severity: 'warning',
        message:  'Most recent company tenure less than 1 year',
        detail:   `${t.company} — ${t.totalMonths} months total. Verify reason for leaving.`,
      }]
    }
  }

  return []
}

// ─── Flag 3: Employment gaps > 6 months (WARNING) ────────────────────────────
// Gaps are measured between REAL JOBS only.
// Gaps following internships are excluded — candidates are often studying.

function detectGaps(tenures: CompanyTenure[]): RedFlag[] {
  const flags: RedFlag[] = []

  // Only use real job tenures for gap detection (exclude internships)
  const realJobs = tenures
    .filter(t => !t.isInternship)
    .sort((a, b) => a.totalStart.getTime() - b.totalStart.getTime())

  if (realJobs.length < 2) return flags

  for (let i = 0; i < realJobs.length - 1; i++) {
    const current = realJobs[i]
    const next    = realJobs[i + 1]
    const gapMonths = monthDiff(current.totalEnd, next.totalStart)

    if (gapMonths > 6) {
      flags.push({
        type:     'employment_gap',
        severity: 'warning',
        message:  `Employment gap of ${gapMonths} months between real jobs`,
        detail:   `Gap between leaving ${current.company} (${current.roles[current.roles.length-1].endLabel}) and joining ${next.company} (${next.roles[0].startLabel}) — ~${gapMonths} months. Verify with candidate.`,
      })
    }
  }

  return flags
}

// ─── Flag 4: Experience mismatch (WARNING) ────────────────────────────────────
// Uses earliest REAL JOB start (not internship, not education year ranges).
// 4-year tolerance handles career breaks, freelance, part-time.

function findEarliestCareerYear(rawText: string, earliestRealJobYear: number): number | null {
  const yearRegex = /\b(\d{4})\s*[–\-—\-]\s*(\d{4})\b/g
  let earliest: number | null = null

  for (const m of [...rawText.matchAll(yearRegex)]) {
    const sy = parseInt(m[1]), ey = parseInt(m[2])
    if (sy < 1970 || sy >= earliestRealJobYear) continue
    const dur = ey - sy

    // Education filter: 1-5 yr span, ends ≤ 2023, started after 2005
    // This covers SSC/HSC/degree ranges like 2014-2015, 2015-2017, 2017-2020
    const isLikelyEducation = dur >= 1 && dur <= 5 && ey <= 2023 && sy >= 2005
    if (isLikelyEducation) continue

    if (earliest === null || sy < earliest) earliest = sy
  }

  return earliest
}

function detectExperienceMismatch(
  statedExperience: number | null,
  tenures: CompanyTenure[],
  rawText: string
): RedFlag[] {
  if (!statedExperience || statedExperience <= 0) return []

  // Only use real jobs (not internships) for mismatch calculation
  const realJobs = tenures
    .filter(t => !t.isInternship)
    .sort((a, b) => a.totalStart.getTime() - b.totalStart.getTime())

  if (realJobs.length === 0) return []

  const now                = new Date()
  const earliestRealJobYr  = realJobs[0].totalStart.getFullYear()
  const earliestYearOnly   = findEarliestCareerYear(rawText, earliestRealJobYr)

  let anchorDate = realJobs[0].totalStart
  if (earliestYearOnly !== null) {
    const yearDate = new Date(earliestYearOnly, 0, 1)
    if (yearDate < anchorDate) anchorDate = yearDate
  }

  const calculatedYears = Math.round(
    ((now.getTime() - anchorDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25)) * 10
  ) / 10

  const diff = Math.abs(statedExperience - calculatedYears)

  if (diff > 4) {
    return [{
      type:     'experience_mismatch',
      severity: 'warning',
      message:  `Stated experience (${statedExperience} yrs) differs from dates (${calculatedYears} yrs)`,
      detail:   `Resume claims ${statedExperience} years but dates suggest ~${calculatedYears} years (from ${anchorDate.getFullYear()}). Difference of ${diff.toFixed(1)} years — verify with candidate.`,
    }]
  }

  return []
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function detectRedFlags(
  rawText:          string,
  statedExperience: number | null = null
): RedFlagResult {

  if (!rawText || rawText.trim().length < 100) {
    return {
      hasFlags: false, hasCritical: false, hasWarnings: false,
      flags: [], overallVerdict: 'Insufficient resume text to analyse',
    }
  }

  const tenures = extractCompanyTenures(rawText)
  const flags: RedFlag[] = [
    ...detectOverlaps(tenures),
    ...detectShortTenures(tenures),
    ...detectGaps(tenures),
    ...detectExperienceMismatch(statedExperience, tenures, rawText),
  ]

  const hasCritical = flags.some(f => f.severity === 'critical')
  const hasWarnings = flags.some(f => f.severity === 'warning')

  const overallVerdict = hasCritical
    ? 'Critical issues found — manual verification strongly recommended'
    : hasWarnings
      ? 'Minor concerns found — verify with candidate before proceeding'
      : 'No red flags detected'

  return { hasFlags: flags.length > 0, hasCritical, hasWarnings, flags, overallVerdict }
}           