'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import DashboardLayout from '@/components/DashboardLayout'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AchieverRow {
  id: string
  full_name: string
  role: 'recruiter' | 'team_leader' | 'sr_team_leader'
  target: number
  achieved: number
  pct: number
}

type Period = 'monthly' | 'quarterly' | 'annual'

interface TierConfig {
  label: string
  emoji: string
  tag: string
  min: number
  badgeBg: string
  badgeColor: string
  rowBg: string
  rowBorder: string
  barColor: string
  pctColor: string
}

interface UserRow {
  id: string
  full_name: string
  role: 'recruiter' | 'team_leader' | 'sr_team_leader'
  monthly_target: number
  quarterly_target: number
  annual_target: number
}

interface CandidateRow {
  assigned_to: string
  revenue_earned: number | null
  date_joined: string | null
  is_renege: boolean | null
  renege_date: string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const TIERS: TierConfig[] = [
  {
    label: 'Legend', emoji: '👑', tag: '200% Legend', min: 200,
    badgeBg: '#f0fdf4', badgeColor: '#16a34a',
    rowBg: '#f0fdf4', rowBorder: '#bbf7d0',
    barColor: '#22c55e', pctColor: '#15803d',
  },
  {
    label: 'Achiever', emoji: '🚀', tag: '150% Achiever', min: 150,
    badgeBg: '#ede9fe', badgeColor: '#7c3aed',
    rowBg: '#faf5ff', rowBorder: '#ddd6fe',
    barColor: '#8b5cf6', pctColor: '#6d28d9',
  },
  {
    label: 'Star', emoji: '⭐', tag: '100% Star', min: 100,
    badgeBg: '#fef9c3', badgeColor: '#b45309',
    rowBg: '#fefce8', rowBorder: '#fde68a',
    barColor: '#f59e0b', pctColor: '#92400e',
  },
]

function getTier(pct: number): TierConfig | null {
  return TIERS.find(t => pct >= t.min) ?? null
}

function getRoleLabel(role: string) {
  if (role === 'sr_team_leader') return 'Sr. TL'
  if (role === 'team_leader') return 'TL'
  return 'Recruiter'
}

function getRoleBadge(role: string) {
  const map: Record<string, { bg: string; color: string }> = {
    sr_team_leader: { bg: '#fef2f2', color: '#dc2626' },
    team_leader:    { bg: '#eff6ff', color: '#2563eb' },
    recruiter:      { bg: '#f0fdf4', color: '#16a34a' },
  }
  return map[role] ?? map['recruiter']
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
}

const AVATAR_COLORS: [string, string][] = [
  ['#ede9fe', '#6d28d9'],
  ['#dbeafe', '#1d4ed8'],
  ['#d1fae5', '#065f46'],
  ['#fef3c7', '#92400e'],
  ['#fce7f3', '#9d174d'],
  ['#e0f2fe', '#0369a1'],
]

function avatarColor(name: string): [string, string] {
  const i = name.charCodeAt(0) % AVATAR_COLORS.length
  return AVATAR_COLORS[i]
}

function fmtINR(n: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(n)
}

// ── Indian FY Quarter helpers ─────────────────────────────────────────────────
// Q1 = Apr–Jun  (month 3,4,5)  → start month = 3
// Q2 = Jul–Sep  (month 6,7,8)  → start month = 6
// Q3 = Oct–Dec  (month 9,10,11)→ start month = 9
// Q4 = Jan–Mar  (month 0,1,2)  → start month = 0

/** Returns the 0-indexed start month of the quarter containing `month` */
function fyQuarterStartMonth(month: number): number {
  if (month >= 3 && month <= 5) return 3
  if (month >= 6 && month <= 8) return 6
  if (month >= 9 && month <= 11) return 9
  return 0 // Jan–Mar = Q4
}

/** Returns Q number (1–4) for display */
function fyQuarterNumber(month: number): number {
  if (month >= 3 && month <= 5) return 1
  if (month >= 6 && month <= 8) return 2
  if (month >= 9 && month <= 11) return 3
  return 4
}

// ── Date window builder ───────────────────────────────────────────────────────

function buildDateWindow(period: Period, month: number, year: number) {
  if (period === 'monthly') {
    const s = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const e = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    return { startDate: s, endDate: e }
  }

  if (period === 'quarterly') {
    // month here is always the quarter START month (3, 6, 9, or 0)
    const qStartMonth = month          // e.g. 3 for Q1
    const qEndMonth   = month === 0 ? 2 : month + 2  // e.g. 5 for Q1
    // Q4 (Jan–Mar): year passed in is already the correct calendar year
    const s = `${year}-${String(qStartMonth + 1).padStart(2, '0')}-01`
    const lastDay = new Date(year, qEndMonth + 1, 0).getDate()
    const e = `${year}-${String(qEndMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    return { startDate: s, endDate: e }
  }

  // Annual: Indian FY Apr–Mar
  const fyStart = month >= 3 ? year : year - 1
  return { startDate: `${fyStart}-04-01`, endDate: `${fyStart + 1}-03-31` }
}

function getPeriodLabel(period: Period, month: number, year: number): string {
  if (period === 'monthly') return `${MONTHS[month]} ${year}`
  if (period === 'quarterly') {
    const q = fyQuarterNumber(month)
    // Q4 spans two calendar years; show the FY year for clarity
    const fyStart = month >= 3 ? year : year - 1
    return `Q${q} FY${String(fyStart + 1).slice(2)}`
  }
  const fyStart = month >= 3 ? year : year - 1
  return `FY ${fyStart}-${String(fyStart + 1).slice(2)}`
}

// ── Core data fetch ───────────────────────────────────────────────────────────

async function fetchAchievers(
  supabase: ReturnType<typeof createClientComponentClient>,
  period: Period,
  month: number,
  year: number,
): Promise<AchieverRow[]> {

  const { startDate, endDate } = buildDateWindow(period, month, year)

  const { data: users, error: uErr } = await supabase
    .from('users')
    .select('id, full_name, role, monthly_target, quarterly_target, annual_target')
    .in('role', ['recruiter', 'team_leader', 'sr_team_leader'])
    .eq('is_active', true)

  if (uErr || !users || users.length === 0) {
    console.error('[fetchAchievers] users error:', uErr)
    return []
  }

  const { data: candidates, error: cErr } = await supabase
    .from('candidates')
    .select('assigned_to, revenue_earned, date_joined, is_renege, renege_date')
    .in('current_stage', ['joined', 'renege'])
    .not('date_joined', 'is', null)
    .gte('date_joined', startDate)
    .lte('date_joined', endDate)

  if (cErr) console.error('[fetchAchievers] candidates error:', cErr)

  const revenueMap: Record<string, number> = {}

  for (const c of (candidates ?? []) as CandidateRow[]) {
    if (!c.assigned_to) continue
    const rev = c.revenue_earned ?? 0
    const renegedInWindow =
      c.is_renege === true &&
      c.renege_date != null &&
      c.renege_date >= startDate &&
      c.renege_date <= endDate
    const net = renegedInWindow ? 0 : rev
    revenueMap[c.assigned_to] = (revenueMap[c.assigned_to] ?? 0) + net
  }

  const targetKey: keyof UserRow = period === 'monthly'
    ? 'monthly_target'
    : period === 'quarterly'
    ? 'quarterly_target'
    : 'annual_target'

  const rows: AchieverRow[] = (users as UserRow[])
    .filter(u => (u[targetKey] as number ?? 0) > 0)
    .map(u => {
      const target  = (u[targetKey] as number) ?? 0
      const achieved = revenueMap[u.id] ?? 0
      const pct     = target > 0 ? Math.round((achieved / target) * 100) : 0
      return { id: u.id, full_name: u.full_name, role: u.role, target, achieved, pct }
    })

  return rows.sort((a, b) => b.pct - a.pct)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const [bg, color] = avatarColor(name)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg, color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.34, flexShrink: 0,
    }}>
      {getInitials(name)}
    </div>
  )
}

function TierBadge({ pct }: { pct: number }) {
  const tier = getTier(pct)
  if (!tier) return <span style={{ fontSize: 12, color: '#9ca3af' }}>—</span>
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 100,
      background: tier.badgeBg, color: tier.badgeColor,
      fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
      border: `1px solid ${tier.rowBorder}`,
    }}>
      {tier.emoji} {tier.tag}
    </span>
  )
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{
      width: '100%', height: 5, borderRadius: 100,
      background: '#f1f5f9', overflow: 'hidden', marginTop: 5,
    }}>
      <div style={{
        width: `${Math.min(100, pct)}%`, height: '100%',
        background: color, borderRadius: 100, transition: 'width 0.7s ease',
      }} />
    </div>
  )
}

function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb',
      borderRadius: 12, padding: '16px 20px', textAlign: 'center', flex: 1,
    }}>
      <div style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{label}</div>
    </div>
  )
}

function PodiumCard({ person, rank }: { person: AchieverRow; rank: 1 | 2 | 3 }) {
  const tier = getTier(person.pct)
  const cardStyle: Record<number, React.CSSProperties> = {
    1: { border: '2px solid #f59e0b', background: '#fffbeb' },
    2: { border: '1px solid #c7d2fe', background: '#eef2ff' },
    3: { border: '1px solid #d1fae5', background: '#f0fdf4' },
  }
  const medalBg: Record<number, string>  = { 1: '#f59e0b', 2: '#6366f1', 3: '#10b981' }
  const medals: Record<number, string>   = { 1: '🥇', 2: '🥈', 3: '🥉' }
  const pctColor: Record<number, string> = { 1: '#92400e', 2: '#4338ca', 3: '#065f46' }

  return (
    <div
      style={{
        ...cardStyle[rank],
        borderRadius: 16, padding: '28px 20px 20px',
        textAlign: 'center', flex: 1, position: 'relative',
        transition: 'transform 0.2s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)' }}
    >
      <div style={{
        position: 'absolute', top: -12, left: '50%',
        transform: 'translateX(-50%)',
        background: medalBg[rank], color: '#fff',
        borderRadius: 100, padding: '2px 14px',
        fontSize: 12, fontWeight: 700,
      }}>
        {medals[rank]} #{rank}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
        <Avatar name={person.full_name} size={52} />
      </div>

      <div style={{ fontWeight: 800, fontSize: rank === 1 ? 17 : 15, color: '#1e293b', lineHeight: 1.3 }}>
        {person.full_name}
      </div>
      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
        {getRoleLabel(person.role)}
      </div>

      <div style={{
        fontSize: rank === 1 ? 42 : 34,
        fontWeight: 800, color: pctColor[rank],
        lineHeight: 1, margin: '14px 0 8px',
      }}>
        {person.pct}%
      </div>

      {tier && <TierBadge pct={person.pct} />}
      {tier && <ProgressBar pct={Math.min(100, person.pct)} color={tier.barColor} />}
    </div>
  )
}

function LeaderboardRow({ person, rank }: { person: AchieverRow; rank: number }) {
  const tier      = getTier(person.pct)
  const roleBadge = getRoleBadge(person.role)

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '40px 1fr 80px 130px',
        gap: 8, alignItems: 'center',
        padding: '12px 16px', borderRadius: 10, marginBottom: 4,
        background: tier ? tier.rowBg : '#fff',
        border: `1px solid ${tier ? tier.rowBorder : '#f1f5f9'}`,
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none' }}
    >
      <div style={{ fontWeight: 700, fontSize: 15, color: '#94a3b8', textAlign: 'center' }}>
        {rank}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <Avatar name={person.full_name} size={34} />
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontWeight: 700, fontSize: 14, color: '#1e293b',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {person.full_name}
          </div>
          <span style={{
            fontSize: 10, padding: '2px 7px', borderRadius: 100,
            background: roleBadge.bg, color: roleBadge.color, fontWeight: 600,
          }}>
            {getRoleLabel(person.role)}
          </span>
        </div>
      </div>

      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 17, fontWeight: 800, color: tier ? tier.pctColor : '#94a3b8' }}>
          {person.pct}%
        </span>
        <ProgressBar pct={Math.min(100, person.pct)} color={tier ? tier.barColor : '#e2e8f0'} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <TierBadge pct={person.pct} />
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AchieversPage() {

  const supabase = createClientComponentClient()
  const now      = new Date()

  const [period, setPeriod] = useState<Period>('monthly')
  const [month,  setMonth]  = useState(now.getMonth())
  const [year,   setYear]   = useState(now.getFullYear())
  const [data,   setData]   = useState<AchieverRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const rows = await fetchAchievers(supabase, period, month, year)
    setData(rows)
    setLoading(false)
  }, [period, month, year])

  useEffect(() => { load() }, [load])

  const periodLabel  = getPeriodLabel(period, month, year)
  const top3         = data.filter(d => d.pct > 0).slice(0, 3)
  const legends      = data.filter(d => d.pct >= 200).length
  const achievers    = data.filter(d => d.pct >= 150 && d.pct < 200).length
  const stars        = data.filter(d => d.pct >= 100 && d.pct < 150).length
  const targetColLabel =
    period === 'monthly' ? 'Mo. Target' :
    period === 'quarterly' ? 'Qtr Target' : 'Ann. Target'

  // ── Period tab switch — snap month to quarter start ───────────────────────
  function handlePeriodChange(p: Period) {
    setPeriod(p)
    if (p === 'quarterly') setMonth(m => fyQuarterStartMonth(m))
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  // Indian FY quarter cycle (by start month): 3 → 6 → 9 → 0 → 3 …
  // When crossing Q4→Q1 boundary the year increments; Q1→Q4 it decrements.

  function prevPeriod() {
    if (period === 'monthly') {
      if (month === 0) { setMonth(11); setYear(y => y - 1) }
      else setMonth(m => m - 1)
    } else if (period === 'quarterly') {
      if (month === 3) {
        // Q1 (Apr) → Q4 (Jan) of the same calendar year (Jan is earlier in the year)
        setMonth(0)
        // year stays the same — Jan of this year is before Apr of this year
      } else if (month === 0) {
        // Q4 (Jan) → Q3 (Oct) of the previous calendar year
        setMonth(9); setYear(y => y - 1)
      } else {
        // Q3 (Oct)→Q2 (Jul) or Q2 (Jul)→Q1 (Apr): just subtract 3
        setMonth(m => m - 3)
      }
    } else {
      setYear(y => y - 1)
    }
  }

  function nextPeriod() {
    if (period === 'monthly') {
      if (month === 11) { setMonth(0); setYear(y => y + 1) }
      else setMonth(m => m + 1)
    } else if (period === 'quarterly') {
      if (month === 9) {
        // Q3 (Oct) → Q4 (Jan) of the next calendar year
        setMonth(0); setYear(y => y + 1)
      } else if (month === 0) {
        // Q4 (Jan) → Q1 (Apr) of the same calendar year
        setMonth(3)
        // year stays the same — Apr of this year is after Jan of this year
      } else {
        // Q1 (Apr)→Q2 (Jul) or Q2 (Jul)→Q3 (Oct): just add 3
        setMonth(m => m + 3)
      }
    } else {
      setYear(y => y + 1)
    }
  }

  return (
    <DashboardLayout>
      <div style={{
        minHeight: '100vh', background: '#f8fafc',
        fontFamily: "'DM Sans', 'Segoe UI', sans-serif", paddingBottom: 60,
      }}>
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />

        {/* Header */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '24px 32px 0' }}>
          <div style={{ maxWidth: 960, margin: '0 auto' }}>
            <div style={{
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              marginBottom: 20, flexWrap: 'wrap', gap: 12,
            }}>
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1e293b', margin: 0 }}>
                  🏆 Hall of Fame
                </h1>
                <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
                  Celebrating recruiters who crush targets — {periodLabel}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {TIERS.map(t => (
                  <span key={t.label} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '5px 14px', borderRadius: 100,
                    background: t.badgeBg, color: t.badgeColor,
                    fontSize: 12, fontWeight: 600,
                    border: `1px solid ${t.rowBorder}`,
                  }}>
                    {t.emoji} {t.tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Period tabs — use handlePeriodChange to snap quarter month */}
            <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb' }}>
              {(['monthly', 'quarterly', 'annual'] as Period[]).map(p => (
                <button key={p} onClick={() => handlePeriodChange(p)} style={{
                  padding: '10px 24px', border: 'none', background: 'transparent',
                  cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
                  color: period === p ? '#4f46e5' : '#6b7280',
                  borderBottom: period === p ? '2px solid #4f46e5' : '2px solid transparent',
                  marginBottom: -2, transition: 'all 0.15s', textTransform: 'capitalize',
                }}>
                  {p === 'monthly' ? 'Monthly' : p === 'quarterly' ? 'Quarterly' : 'Annual'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 32px 0' }}>

          {/* Navigator */}
          <div style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 16, marginBottom: 28,
          }}>
            <button onClick={prevPeriod} style={{
              width: 34, height: 34, borderRadius: '50%',
              border: '1px solid #e5e7eb', background: '#fff',
              cursor: 'pointer', fontSize: 18, color: '#374151',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>&#8249;</button>
            <span style={{
              fontSize: 18, fontWeight: 700, color: '#1e293b',
              minWidth: 200, textAlign: 'center',
            }}>
              {periodLabel}
            </span>
            <button onClick={nextPeriod} style={{
              width: 34, height: 34, borderRadius: '50%',
              border: '1px solid #e5e7eb', background: '#fff',
              cursor: 'pointer', fontSize: 18, color: '#374151',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>&#8250;</button>
          </div>

          {/* ── Content: loading / empty / data ── */}
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
            </div>
          ) : data.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '60px 0',
              background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb',
            }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
              <div style={{ fontWeight: 600, color: '#374151', fontSize: 16 }}>
                No data yet for {periodLabel}
              </div>
              <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 6 }}>
                Achievements will appear once targets and joinings are recorded.
              </div>
            </div>
          ) : (
            <>
              {/* Stats */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
                <StatCard value={legends}   label="👑 Legends"  color="#15803d" />
                <StatCard value={achievers} label="🚀 Achievers" color="#6d28d9" />
                <StatCard value={stars}     label="⭐ Stars"     color="#92400e" />
                <StatCard value={data.filter(d => d.pct >= 100).length} label="Total Qualifiers" color="#2563eb" />
              </div>

              {/* Podium */}
              {top3.length > 0 ? (
                <div style={{ marginBottom: 36 }}>
                  <div style={{
                    fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase',
                    color: '#94a3b8', textAlign: 'center', marginBottom: 20,
                  }}>
                    Top Performers
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${top3.length}, 1fr)`,
                    gap: 16,
                  }}>
                    {top3.map((p, i) => (
                      <PodiumCard key={p.id} person={p} rank={(i + 1) as 1 | 2 | 3} />
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{
                  textAlign: 'center', padding: '28px',
                  background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb',
                  marginBottom: 28, color: '#6b7280', fontSize: 14,
                }}>
                  No joinings recorded yet for {periodLabel}. Keep pushing! 💪
                </div>
              )}

              {/* Leaderboard */}
              <div style={{
                background: '#fff', border: '1px solid #e5e7eb',
                borderRadius: 16, overflow: 'hidden',
              }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 1fr 80px 130px',
                  gap: 8, padding: '10px 16px',
                  background: '#f8fafc', borderBottom: '1px solid #e5e7eb',
                  fontSize: 11, letterSpacing: '1px', textTransform: 'uppercase',
                  color: '#94a3b8', fontWeight: 600,
                }}>
                  <div style={{ textAlign: 'center' }}>#</div>
                  <div>Name</div>
                  <div style={{ textAlign: 'right' }}>Score</div>
                  <div style={{ textAlign: 'right' }}>Tier</div>
                </div>

                <div style={{ padding: '8px' }}>
                  {data.map((person, i) => (
                    <LeaderboardRow key={person.id} person={person} rank={i + 1} />
                  ))}
                </div>

                <div style={{
                  padding: '10px 20px', borderTop: '1px solid #f1f5f9',
                  background: '#fafafa', fontSize: 11, color: '#94a3b8',
                }}>
                  ℹ️ Score % is net of reneges. Individual revenue figures are not displayed to maintain privacy.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}