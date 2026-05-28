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
  isAlumni?: boolean
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
  is_active?: boolean
  last_working_date?: string | null
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

// Motivational messages based on % bands
const MOTIVATION: { min: number; max: number; msg: string; color: string }[] = [
  { min: 200, max: Infinity, msg: "Absolutely legendary! 🔥",          color: '#15803d' },
  { min: 150, max: 199,      msg: "Crushing it! Keep the streak! 🚀",  color: '#6d28d9' },
  { min: 100, max: 149,      msg: "Target smashed! Aim higher! ⭐",    color: '#92400e' },
  { min: 75,  max: 99,       msg: "So close! Final push! 💪",          color: '#0369a1' },
  { min: 50,  max: 74,       msg: "You are in mid-range, more effort needed! 📈",     color: '#0369a1' },
  { min: 0,   max: 49,       msg: "Your efforts are not paying off , Need more focus! 🎯",          color: '#6b7280' },
]

function getMotivation(pct: number) {
  return MOTIVATION.find(m => pct >= m.min && pct <= m.max) ?? MOTIVATION[MOTIVATION.length - 1]
}

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

function fyQuarterStartMonth(month: number): number {
  if (month >= 3 && month <= 5) return 3
  if (month >= 6 && month <= 8) return 6
  if (month >= 9 && month <= 11) return 9
  return 0
}

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
    const qStartMonth = month
    const qEndMonth   = month === 0 ? 2 : month + 2
    const s = `${year}-${String(qStartMonth + 1).padStart(2, '0')}-01`
    const lastDay = new Date(year, qEndMonth + 1, 0).getDate()
    const e = `${year}-${String(qEndMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    return { startDate: s, endDate: e }
  }
  const fyStart = month >= 3 ? year : year - 1
  return { startDate: `${fyStart}-04-01`, endDate: `${fyStart + 1}-03-31` }
}

function getPeriodLabel(period: Period, month: number, year: number): string {
  if (period === 'monthly') return `${MONTHS[month]} ${year}`
  if (period === 'quarterly') {
    const q = fyQuarterNumber(month)
    const fyYear = month >= 3 ? year : year - 1
    return `Q${q} FY${String(fyYear).slice(2)}`
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

  const fyStart = month >= 3 ? year : year - 1

const { data: users, error: uErr } = await supabase
  .from('users')
  .select('id, full_name, role, monthly_target, quarterly_target, annual_target, is_active, last_working_date')
  .in('role', ['recruiter', 'team_leader', 'sr_team_leader'])
  .or(`is_active.eq.true,last_working_date.gte.${fyStart}-04-01`)

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
  const target   = (u[targetKey] as number) ?? 0
  const achieved = revenueMap[u.id] ?? 0
  const pct      = target > 0 ? Math.round((achieved / target) * 100) : 0

  const isAlumni = !u.is_active && u.last_working_date

  return {
    id: u.id,
    full_name: u.full_name,
    role: u.role,
    target,
    achieved,
    pct,
    isAlumni: Boolean(isAlumni),
  }
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

function ProgressBar({ pct, color, animated = false }: { pct: number; color: string; animated?: boolean }) {
  return (
    <div style={{
      width: '100%', height: 6, borderRadius: 100,
      background: '#f1f5f9', overflow: 'hidden', marginTop: 5,
    }}>
      <div style={{
        width: `${Math.min(100, pct)}%`, height: '100%',
        background: color, borderRadius: 100,
        transition: 'width 0.9s cubic-bezier(.4,0,.2,1)',
        boxShadow: animated ? `0 0 8px ${color}88` : 'none',
      }} />
    </div>
  )
}

function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb',
      borderRadius: 12, padding: '16px 20px', textAlign: 'center', flex: 1,
      transition: 'transform 0.15s, box-shadow 0.15s',
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'
        ;(e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'
        ;(e.currentTarget as HTMLDivElement).style.boxShadow = 'none'
      }}
    >
      <div style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{label}</div>
    </div>
  )
}

function PodiumCard({ person, rank }: { person: AchieverRow; rank: 1 | 2 | 3 }) {
  const tier = getTier(person.pct)
  const cardStyle: Record<number, React.CSSProperties> = {
    1: { border: '2px solid #f59e0b', background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)' },
    2: { border: '1px solid #c7d2fe', background: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)' },
    3: { border: '1px solid #d1fae5', background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' },
  }
  const medalBg: Record<number, string>  = { 1: '#f59e0b', 2: '#6366f1', 3: '#10b981' }
  const medals: Record<number, string>   = { 1: '🥇', 2: '🥈', 3: '🥉' }
  const pctColor: Record<number, string> = { 1: '#92400e', 2: '#4338ca', 3: '#065f46' }
  const glow: Record<number, string>     = {
    1: '0 8px 32px rgba(245,158,11,0.25)',
    2: '0 8px 24px rgba(99,102,241,0.15)',
    3: '0 8px 24px rgba(16,185,129,0.15)',
  }

  return (
    <div
      style={{
        ...cardStyle[rank],
        borderRadius: 20, padding: '32px 20px 24px',
        textAlign: 'center', flex: 1, position: 'relative',
        transition: 'transform 0.2s, box-shadow 0.2s',
        boxShadow: rank === 1 ? glow[1] : 'none',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)'
        ;(e.currentTarget as HTMLDivElement).style.boxShadow = glow[rank]
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'
        ;(e.currentTarget as HTMLDivElement).style.boxShadow = rank === 1 ? glow[1] : 'none'
      }}
    >
      {/* Rank badge */}
      <div style={{
        position: 'absolute', top: -14, left: '50%',
        transform: 'translateX(-50%)',
        background: medalBg[rank], color: '#fff',
        borderRadius: 100, padding: '4px 16px',
        fontSize: 13, fontWeight: 700,
        boxShadow: `0 2px 8px ${medalBg[rank]}66`,
      }}>
        {medals[rank]} #{rank}
      </div>

      {/* Crown for #1 */}
      {rank === 1 && (
        <div style={{ fontSize: 28, marginBottom: 4, lineHeight: 1 }}>👑</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
        <div style={{
          padding: rank === 1 ? 3 : 0,
          borderRadius: '50%',
          background: rank === 1 ? 'linear-gradient(135deg, #f59e0b, #f97316)' : 'transparent',
        }}>
          <Avatar name={person.full_name} size={rank === 1 ? 58 : 48} />
        </div>
      </div>

      <div style={{ fontWeight: 800, fontSize: rank === 1 ? 17 : 15, color: '#1e293b', lineHeight: 1.3 }}>
        {person.full_name}
      </div>
      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
        {getRoleLabel(person.role)}
      </div>

      <div style={{
        fontSize: rank === 1 ? 46 : 36,
        fontWeight: 800, color: pctColor[rank],
        lineHeight: 1, margin: '16px 0 10px',
        textShadow: rank === 1 ? '0 2px 8px rgba(146,64,14,0.15)' : 'none',
      }}>
        {person.pct}%
      </div>

      {tier && <TierBadge pct={person.pct} />}
      {tier && <ProgressBar pct={Math.min(100, person.pct)} color={tier.barColor} animated={rank === 1} />}
    </div>
  )
}

// ── Leaderboard Row with motivation tag ───────────────────────────────────────

function LeaderboardRow({ person, rank }: { person: AchieverRow; rank: number }) {
  const tier       = getTier(person.pct)
  const roleBadge  = getRoleBadge(person.role)
  const motivation = getMotivation(person.pct)

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '40px 1fr 120px 130px',
        gap: 8, alignItems: 'center',
        padding: '12px 16px', borderRadius: 10, marginBottom: 4,
        background: tier ? tier.rowBg : '#fff',
        border: `1px solid ${tier ? tier.rowBorder : '#f1f5f9'}`,
        transition: 'box-shadow 0.15s, transform 0.15s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'
        ;(e.currentTarget as HTMLDivElement).style.transform = 'translateX(2px)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'
        ;(e.currentTarget as HTMLDivElement).style.transform = 'translateX(0)'
      }}
    >
      {/* Rank */}
      <div style={{ fontWeight: 700, fontSize: 15, color: '#94a3b8', textAlign: 'center' }}>
        {rank <= 3 && person.pct >= 100
          ? <span style={{ fontSize: 18 }}>{['🥇','🥈','🥉'][rank - 1]}</span>
          : rank
        }
      </div>

      {/* Name + role */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <Avatar name={person.full_name} size={34} />
        <div style={{ minWidth: 0 }}>
         <div style={{
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
}}>
  <div style={{
    fontWeight: 700,
    fontSize: 14,
    color: '#1e293b',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }}>
    {person.full_name}
  </div>

  {person.isAlumni && (
    <span style={{
      fontSize: 10,
      color: '#6b7280',
      background: '#f1f5f9',
      padding: '1px 7px',
      borderRadius: 100,
      flexShrink: 0,
    }}>
      Alumni
    </span>
  )}
</div>
          <span style={{
            fontSize: 10, padding: '2px 7px', borderRadius: 100,
            background: roleBadge.bg, color: roleBadge.color, fontWeight: 600,
          }}>
            {getRoleLabel(person.role)}
          </span>
        </div>
      </div>

      {/* Score + progress + motivation */}
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 17, fontWeight: 800, color: tier ? tier.pctColor : '#94a3b8' }}>
          {person.pct}%
        </span>
        <ProgressBar pct={Math.min(100, person.pct)} color={tier ? tier.barColor : '#e2e8f0'} />
        <div style={{ fontSize: 10, color: motivation.color, marginTop: 3, fontWeight: 600 }}>
          {motivation.msg}
        </div>
      </div>

      {/* Tier badge */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <TierBadge pct={person.pct} />
      </div>
    </div>
  )
}

// ── Chasing Banner — shows who is closest to next tier ───────────────────────

function ChasingBanner({ data }: { data: AchieverRow[] }) {
  // Find someone between 75–99% — closest to 100
  const chasing = data
    .filter(d => d.pct >= 75 && d.pct < 100)
    .sort((a, b) => b.pct - a.pct)[0]

  if (!chasing) return null

  return (
    <div style={{
      background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
      border: '1px solid #bfdbfe', borderRadius: 14,
      padding: '14px 20px', marginBottom: 20,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ fontSize: 28 }}>⚡</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#1e40af' }}>
          {chasing.full_name} is {100 - chasing.pct}% away from the Star tier!
        </div>
        <div style={{ fontSize: 12, color: '#3b82f6', marginTop: 2 }}>
          Currently at {chasing.pct}% — one more joining could do it! 🎯
        </div>
      </div>
      <div style={{
        background: '#2563eb', color: '#fff',
        borderRadius: 100, padding: '4px 14px',
        fontSize: 12, fontWeight: 700,
      }}>
        {chasing.pct}%
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AchieversPage() {

  const supabase  = createClientComponentClient()
  const now       = new Date()

  const [period,  setPeriod]  = useState<Period>('monthly')
  const [month,   setMonth]   = useState(now.getMonth())
  const [year,    setYear]    = useState(now.getFullYear())
  const [data,    setData]    = useState<AchieverRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const rows = await fetchAchievers(supabase, period, month, year)
    setData(rows)
    setLoading(false)
  }, [period, month, year])

  useEffect(() => { load() }, [load])

  const periodLabel = getPeriodLabel(period, month, year)

  // ── Key fix: podium only shows people at >= 100% ──────────────────────────
  const top3      = data.filter(d => d.pct >= 100).slice(0, 3)
  const legends   = data.filter(d => d.pct >= 200).length
  const achievers = data.filter(d => d.pct >= 150 && d.pct < 200).length
  const stars     = data.filter(d => d.pct >= 100 && d.pct < 150).length

  function handlePeriodChange(p: Period) {
    setPeriod(p)
    if (p === 'quarterly') setMonth(m => fyQuarterStartMonth(m))
  }

  function prevPeriod() {
    if (period === 'monthly') {
      if (month === 0) { setMonth(11); setYear(y => y - 1) }
      else setMonth(m => m - 1)
    } else if (period === 'quarterly') {
      if (month === 3)      { setMonth(0) }
      else if (month === 0) { setMonth(9); setYear(y => y - 1) }
      else                  { setMonth(m => m - 3) }
    } else {
      setYear(y => y - 1)
    }
  }

  function nextPeriod() {
    if (period === 'monthly') {
      if (month === 11) { setMonth(0); setYear(y => y + 1) }
      else setMonth(m => m + 1)
    } else if (period === 'quarterly') {
      if (month === 9)      { setMonth(0); setYear(y => y + 1) }
      else if (month === 0) { setMonth(3) }
      else                  { setMonth(m => m + 3) }
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
              transition: 'background 0.15s',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f1f5f9' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fff' }}
            >&#8249;</button>
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
              transition: 'background 0.15s',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f1f5f9' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fff' }}
            >&#8250;</button>
          </div>

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
              <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                <StatCard value={legends}   label="👑 Legends"        color="#15803d" />
                <StatCard value={achievers} label="🚀 Achievers"       color="#6d28d9" />
                <StatCard value={stars}     label="⭐ Stars"           color="#92400e" />
                <StatCard value={data.filter(d => d.pct >= 100).length} label="🎯 Qualifiers" color="#2563eb" />
              </div>

              {/* Chasing banner — shows who's closest to cracking 100% */}
              <ChasingBanner data={data} />

              {/* Podium — only qualifiers (>= 100%) */}
              {top3.length > 0 ? (
                <div style={{ marginBottom: 36 }}>
                  <div style={{
                    fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase',
                    color: '#94a3b8', textAlign: 'center', marginBottom: 20,
                  }}>
                    ✨ Top Performers — Target Crushers Only
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
                  textAlign: 'center', padding: '32px',
                  background: 'linear-gradient(135deg, #fff7ed, #ffedd5)',
                  borderRadius: 16, border: '1px solid #fed7aa',
                  marginBottom: 28,
                }}>
                  <div style={{ fontSize: 40, marginBottom: 10 }}>🎯</div>
                  <div style={{ fontWeight: 700, color: '#92400e', fontSize: 16 }}>
                    No one has hit 100% yet for {periodLabel}
                  </div>
                  <div style={{ color: '#b45309', fontSize: 13, marginTop: 6 }}>
                    Be the first to claim a podium spot! Every joining counts. 💪
                  </div>
                </div>
              )}

              {/* Leaderboard */}
              <div style={{
                background: '#fff', border: '1px solid #e5e7eb',
                borderRadius: 16, overflow: 'hidden',
              }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 1fr 120px 130px',
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