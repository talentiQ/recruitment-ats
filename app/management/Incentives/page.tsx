'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

// ── Policy Constants (Effective April 2026) ───────────────────────────────────

const HALF_YEARLY_SLABS = [
  { label: 'Slab I',   min: 0,   max: 84.99, rate: 0,    desc: '0 – 84%',    color: '#6b7280' },
  { label: 'Slab II',  min: 85,  max: 99.99, rate: 0.03, desc: '85 – 99%',   color: '#f59e0b' },
  { label: 'Slab III', min: 100, max: 149.99,rate: 0.06, desc: '100 – 149%', color: '#3b82f6' },
  { label: 'Slab IV',  min: 150, max: 199.99,rate: 0.07, desc: '150 – 199%', color: '#8b5cf6' },
  { label: 'Slab V',   min: 200, max: Infinity, rate: 0.08, desc: '200%+',   color: '#10b981' },
]

const MONTHLY_RATE = 0.01       // 1% flat at 100%+ achievement
const MONTHLY_MIN_PCT = 50      // below 50% → nil
const MONTHLY_BONUS_THRESHOLD = 150  // reward only applicable at 150%+

// Half-yearly: if avg monthly achievement < 60% → null and void
const HY_AVG_MIN = 60

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserRow {
  id: string
  full_name: string
  role: string
  monthly_target: number
  quarterly_target: number
  annual_target: number
}

interface MonthEntry {
  month: string
  target: number
  achieved: number
  pct: number
  incentive: number
  manual: number
  manualNote: string
   
}

interface RecruiterCalc {
  user: UserRow
  months: MonthEntry[]
  halfYearly: {
    totalTarget: number
    totalAchieved: number
    pct: number
    avgMonthlyPct: number
    slab: typeof HALF_YEARLY_SLABS[0] | null
    incentive: number
    isVoid: boolean
    manualBonus: number
    manualNote: string
  }
  annual: {
    totalTarget: number
    totalAchieved: number
    pct: number
    eligible: boolean
    payout: number
    manualBonus: number
    manualNote: string
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']
// FY months: Apr(0)..Mar(11) → calendar months: 3,4,5,6,7,8,9,10,11,0,1,2
const FY_CAL_MONTHS = [3,4,5,6,7,8,9,10,11,0,1,2]

function fyLabel(fyStart: number) {
  return `FY ${fyStart}-${String(fyStart + 1).slice(2)}`
}

function fmtINR(n: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(n)
}

function getHalfYearlySlab(pct: number) {
  return HALF_YEARLY_SLABS.find(s => pct >= s.min && pct <= s.max) ?? HALF_YEARLY_SLABS[0]
}

function calcHalfYearlyIncentive(achieved: number, pct: number): number {
  const slab = getHalfYearlySlab(pct)
  return Math.round(achieved * slab.rate)
}

function calcMonthlyIncentive(achieved: number, pct: number): number {
  if (pct < MONTHLY_MIN_PCT) return 0
  if (pct < MONTHLY_BONUS_THRESHOLD) return 0
  return Math.round(achieved * MONTHLY_RATE)
}

function getRoleLabel(role: string) {
  if (role === 'sr_team_leader') return 'Sr. TL'
  if (role === 'team_leader') return 'TL'
  return 'Recruiter'
}

function getRoleColor(role: string) {
  if (role === 'sr_team_leader') return { bg: '#fef2f2', color: '#dc2626' }
  if (role === 'team_leader') return { bg: '#eff6ff', color: '#2563eb' }
  return { bg: '#f0fdf4', color: '#16a34a' }
}

const AVATAR_COLORS: [string,string][] = [
  ['#ede9fe','#6d28d9'],['#dbeafe','#1d4ed8'],['#d1fae5','#065f46'],
  ['#fef3c7','#92400e'],['#fce7f3','#9d174d'],['#e0f2fe','#0369a1'],
]
function avatarColor(name: string): [string,string] {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
}
function initials(name: string) {
  return name.split(' ').slice(0,2).map((w:string)=>w[0]).join('').toUpperCase()
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function IncentivesPage() {
  const supabase = createClientComponentClient()

  const now = new Date()
  // Current FY start year
  const defaultFY = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  const [fyStart, setFyStart] = useState(defaultFY)

  // Half: 'H1' = Apr-Sep, 'H2' = Oct-Mar
  const [half, setHalf] = useState<'H1'|'H2'>('H1')
  const [view, setView] = useState<'monthly'|'halfyearly'|'annual'>('monthly')

  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)

  // Revenue data: keyed by userId → calendarMonth(0-11) → revenue
  const [revenueData, setRevenueData] = useState<Record<string, Record<number, number>>>({})

  // Manual overrides: userId → { monthIndex(fy 0-11) → {amount, note} }
  const [manualMonthly, setManualMonthly] = useState<Record<string, Record<number, {amount:number;note:string}>>>({})
  const [paidMonthly, setPaidMonthly] = useState<Record<string, Record<number, number>>>({})
  const [manualHY, setManualHY] = useState<Record<string, {amount:number;note:string}>>({})
  const [manualAnnual, setManualAnnual] = useState<Record<string, {amount:number;note:string}>>({})

  // Expanded recruiter
  const [expanded, setExpanded] = useState<string|null>(null)


  // Monthly sub-view: bymonth = pick a month see all recruiters | byrecruiter = per-person accordion
  const [monthSubView, setMonthSubView] = useState<'bymonth'|'byrecruiter'>('bymonth')

  // Selected FY month index: 0=Apr, 1=May ... 11=Mar
  const currentFyMonthIdx = FY_CAL_MONTHS.indexOf(now.getMonth()) >= 0 ? FY_CAL_MONTHS.indexOf(now.getMonth()) : 0
  const [selectedFyMonth, setSelectedFyMonth] = useState(currentFyMonthIdx)
  // Load users
  const loadUsers = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, role, monthly_target, quarterly_target, annual_target')
      .in('role', ['recruiter', 'team_leader', 'sr_team_leader'])
      .eq('is_active', true)
    if (!error && data) setUsers(data as UserRow[])
    setLoading(false)
  }, [])

  // Load revenue data from candidates for the full FY
  const loadRevenue = useCallback(async () => {
    const startDate = `${fyStart}-04-01`
    const endDate = `${fyStart + 1}-03-31`

    const { data: candidates, error } = await supabase
      .from('candidates')
      .select('assigned_to, revenue_earned, date_joined, is_renege, renege_date')
      .in('current_stage', ['joined', 'renege'])
      .not('date_joined', 'is', null)
      .gte('date_joined', startDate)
      .lte('date_joined', endDate)

    if (error) { console.error(error); return }

    // Aggregate by user → calendar month
    const map: Record<string, Record<number, number>> = {}
    for (const c of (candidates ?? [])) {
      if (!c.assigned_to || !c.date_joined) continue
      const calMonth = new Date(c.date_joined).getMonth()
      const rev = c.revenue_earned ?? 0
      const renegeDate = c.renege_date
      const isRenegedThisMonth = c.is_renege && renegeDate &&
        new Date(renegeDate).getMonth() === calMonth &&
        new Date(renegeDate).getFullYear() === new Date(c.date_joined).getFullYear()
      const net = isRenegedThisMonth ? 0 : rev
      if (!map[c.assigned_to]) map[c.assigned_to] = {}
      map[c.assigned_to][calMonth] = (map[c.assigned_to][calMonth] ?? 0) + net
    }
    setRevenueData(map)
  }, [fyStart])

  useEffect(() => { loadUsers() }, [loadUsers])
  useEffect(() => { loadRevenue() }, [loadRevenue])

  // ── Compute per-recruiter ──────────────────────────────────────────────────

  function computeRecruiter(user: UserRow): RecruiterCalc {
    // FY months: index 0=Apr ... 11=Mar
    const fyMonths = FY_CAL_MONTHS.map((calMonth, fyIdx) => {
      const yr = calMonth >= 3 ? fyStart : fyStart + 1
      const target = user.monthly_target ?? 0
      const achieved = revenueData[user.id]?.[calMonth] ?? 0
      const pct = target > 0 ? Math.round((achieved / target) * 100) : 0
      const incentive = calcMonthlyIncentive(achieved, pct)
      const manual = manualMonthly[user.id]?.[fyIdx]?.amount ?? 0
      const manualNote = manualMonthly[user.id]?.[fyIdx]?.note ?? ''
      return {
        month: `${MONTH_NAMES[fyIdx]} ${yr}`,
        target, achieved, pct, incentive, manual, manualNote,
      }
    })

    // Half-yearly window indices
    const hyIndices = half === 'H1' ? [0,1,2,3,4,5] : [6,7,8,9,10,11]
    const hyMonths = hyIndices.map(i => fyMonths[i])
    const hyTarget = hyMonths.reduce((s, m) => s + m.target, 0)
    const hyAchieved = hyMonths.reduce((s, m) => s + m.achieved, 0)
    const hyPct = hyTarget > 0 ? Math.round((hyAchieved / hyTarget) * 100) : 0
    const avgMonthlyPct = hyMonths.length > 0
      ? Math.round(hyMonths.reduce((s, m) => s + m.pct, 0) / hyMonths.length)
      : 0
    const isVoid = avgMonthlyPct < HY_AVG_MIN
    const hySlab = isVoid ? null : getHalfYearlySlab(hyPct)
    const hyIncentive = isVoid ? 0 : calcHalfYearlyIncentive(hyAchieved, hyPct)
    const hyManual = manualHY[user.id]?.amount ?? 0
    const hyManualNote = manualHY[user.id]?.note ?? ''

    // Annual
    const annTarget = (user.annual_target > 0 ? user.annual_target : user.monthly_target * 12) || 0
    const annAchieved = fyMonths.reduce((s, m) => s + m.achieved, 0)
    const annPct = annTarget > 0 ? Math.round((annAchieved / annTarget) * 100) : 0
    const annEligible = annPct >= 100
    const annPayout = annEligible ? annAchieved * 1.0 : 0 // 100% payout on 100% achievement
    const annManual = manualAnnual[user.id]?.amount ?? 0
    const annManualNote = manualAnnual[user.id]?.note ?? ''

    return {
      user,
      months: fyMonths,
      halfYearly: {
        totalTarget: hyTarget, totalAchieved: hyAchieved, pct: hyPct,
        avgMonthlyPct, slab: hySlab, incentive: hyIncentive,
        isVoid, manualBonus: hyManual, manualNote: hyManualNote,
      },
      annual: {
        totalTarget: annTarget, totalAchieved: annAchieved, pct: annPct,
        eligible: annEligible, payout: annPayout,
        manualBonus: annManual, manualNote: annManualNote,
      },
    }
  }

  const calcs = users.map(computeRecruiter)

  // Summary totals
  const totalMonthlyIncentive = calcs.reduce((s, c) => {
    const idx = view === 'monthly' ? null : null
    return s + c.months.reduce((ms, m) => ms + m.incentive + m.manual, 0)
  }, 0)
  const totalHYIncentive = calcs.reduce((s, c) => s + c.halfYearly.incentive + c.halfYearly.manualBonus, 0)

  // ── Render ────────────────────────────────────────────────────────────────

  const hyLabel = half === 'H1' ? 'H1 (Apr – Sep)' : 'H2 (Oct – Mar)'
  const hyPayoutMonth = half === 'H1' ? 'December 2026' : 'July 2027'

  return (
    <div style={{
      minHeight: '100vh', background: '#f8fafc',
      fontFamily: "'DM Sans','Segoe UI',sans-serif", paddingBottom: 80,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* ── Header ── */}
      <div style={{ background:'#fff', borderBottom:'1px solid #e5e7eb', padding:'24px 32px 0' }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
            <div>
              <h1 style={{ fontSize:24, fontWeight:800, color:'#1e293b', margin:0 }}>
                💰 Incentive & Rewards Calculator
              </h1>
              <p style={{ fontSize:13, color:'#64748b', margin:'4px 0 0' }}>
                Management only · Policy effective April 2026 · {fyLabel(fyStart)}
              </p>
            </div>
            {/* FY selector */}
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <button onClick={()=>setFyStart(y=>y-1)} style={navBtn}>‹</button>
              <span style={{ fontWeight:700, fontSize:15, color:'#1e293b', minWidth:100, textAlign:'center' }}>
                {fyLabel(fyStart)}
              </span>
              <button onClick={()=>setFyStart(y=>y+1)} style={navBtn}>›</button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display:'flex', borderBottom:'2px solid #e5e7eb' }}>
            {(['monthly','halfyearly','annual'] as const).map(t => (
              <button key={t} onClick={()=>setView(t)} style={{
                padding:'10px 24px', border:'none', background:'transparent',
                cursor:'pointer', fontSize:14, fontWeight:600, fontFamily:'inherit',
                color: view===t ? '#4f46e5' : '#6b7280',
                borderBottom: view===t ? '2px solid #4f46e5' : '2px solid transparent',
                marginBottom:-2, transition:'all 0.15s',
              }}>
                {t === 'monthly' ? '📅 Monthly Rewards' : t === 'halfyearly' ? '📊 Half-Yearly Incentive' : '🏅 Annual Variable'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:'0 auto', padding:'28px 32px 0' }}>

        {/* Policy summary banner */}
        <PolicyBanner view={view} half={half} setHalf={setHalf} hyPayoutMonth={hyPayoutMonth} />

        {loading ? (
          <div style={{ textAlign:'center', padding:'60px 0', color:'#94a3b8' }}>Loading recruiters...</div>
        ) : (
          <>
            {/* Summary bar */}
            <SummaryBar calcs={calcs} view={view} half={half} />

            {/* Monthly sub-view toggle */}
            {view === 'monthly' && (
              <div style={{ display:'flex', gap:6, margin:'20px 0 0' }}>
                {([['bymonth','📅 By Month'],['byrecruiter','👤 By Recruiter']] as const).map(([v,label]) => (
                  <button key={v} onClick={() => setMonthSubView(v)} style={{
                    padding:'7px 18px', borderRadius:100, cursor:'pointer',
                    fontSize:13, fontWeight:600, fontFamily:'inherit',
                    border:'1px solid #e5e7eb',
                    background: monthSubView===v ? '#4f46e5' : '#fff',
                    color: monthSubView===v ? '#fff' : '#6b7280',
                    transition:'all 0.15s',
                  }}>{label}</button>
                ))}
              </div>
            )}

            {/* Monthly By-Month view */}
            {view === 'monthly' && monthSubView === 'bymonth' && (
              <MonthlyByMonthView
                calcs={calcs}
                selectedFyMonth={selectedFyMonth}
                setSelectedFyMonth={setSelectedFyMonth}
                manualMonthly={manualMonthly}
                paidMonthly={paidMonthly}
                onPaidMonthly={(userId, fyIdx, amount) => {
                  setPaidMonthly(prev => ({ ...prev, [userId]: { ...(prev[userId]??{}), [fyIdx]: amount } }))
                }}
                onMonthManual={(userId, fyIdx, amount, note) => {
                  setManualMonthly(prev => ({
                    ...prev,
                    [userId]: { ...(prev[userId]??{}), [fyIdx]: {amount, note} }
                  }))
                }}
              />
            )}

            {/* Per-recruiter accordion view */}
            {(view !== 'monthly' || monthSubView === 'byrecruiter') && (
              <div style={{ display:'flex', flexDirection:'column', gap:12, marginTop:20 }}>
                {calcs.map(calc => (
                  <RecruiterCard
                    key={calc.user.id}
                    calc={calc}
                    view={view}
                    half={half}
                    expanded={expanded === calc.user.id}
                    onToggle={() => setExpanded(expanded === calc.user.id ? null : calc.user.id)}
                    onMonthManual={(fyIdx, amount, note) => {
                      setManualMonthly(prev => ({
                        ...prev,
                        [calc.user.id]: { ...(prev[calc.user.id]??{}), [fyIdx]: {amount, note} }
                      }))
                    }}
                    onHYManual={(amount, note) => {
                      setManualHY(prev => ({ ...prev, [calc.user.id]: {amount, note} }))
                    }}
                    onAnnualManual={(amount, note) => {
                      setManualAnnual(prev => ({ ...prev, [calc.user.id]: {amount, note} }))
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}


// ── Monthly By-Month View ─────────────────────────────────────────────────────

function MonthlyByMonthView({ calcs, selectedFyMonth, setSelectedFyMonth, manualMonthly, onMonthManual, paidMonthly, onPaidMonthly }: {
  calcs: RecruiterCalc[]
  selectedFyMonth: number
  setSelectedFyMonth: (i: number) => void
  manualMonthly: Record<string, Record<number, {amount:number;note:string}>>
  onMonthManual: (userId: string, fyIdx: number, amount: number, note: string) => void
  paidMonthly: Record<string, Record<number, number>>
  onPaidMonthly: (userId: string, fyIdx: number, amount: number) => void
}) {
  const [editingUser, setEditingUser] = useState<string|null>(null)
  const [editAmt, setEditAmt] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editingPaidUser, setEditingPaidUser] = useState<string|null>(null)
  const [editPaidAmt, setEditPaidAmt] = useState('')

  // Rows for selected month
  const rows = calcs.map(calc => {
    const m = calc.months[selectedFyMonth]
    const manual = manualMonthly[calc.user.id]?.[selectedFyMonth]?.amount ?? 0
    const manualNote = manualMonthly[calc.user.id]?.[selectedFyMonth]?.note ?? ''
    const paid = paidMonthly[calc.user.id]?.[selectedFyMonth] ?? 0
    return { calc, m, manual, manualNote, paid }
  }).sort((a, b) => b.m.pct - a.m.pct)

  const eligible = rows.filter(r => r.m.incentive > 0)
  const totalPolicy = rows.reduce((s, r) => s + r.m.incentive, 0)
  const totalManual = rows.reduce((s, r) => s + r.manual, 0)
  const totalPayout = totalPolicy + totalManual
  const totalPaid = rows.reduce((s, r) => s + r.paid, 0)
  const totalBalance = totalPayout - totalPaid

  const monthName = calcs[0]?.months[selectedFyMonth]?.month ?? MONTH_NAMES[selectedFyMonth]

  return (
    <div style={{ marginTop: 20 }}>
      {/* Month selector pills */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:20 }}>
        {MONTH_NAMES.map((mn, i) => (
          <button key={i} onClick={() => setSelectedFyMonth(i)} style={{
            padding:'6px 14px', borderRadius:100, cursor:'pointer',
            fontSize:12, fontWeight:600, fontFamily:'inherit',
            border:'1px solid #e5e7eb',
            background: selectedFyMonth===i ? '#4f46e5' : '#fff',
            color: selectedFyMonth===i ? '#fff' : '#6b7280',
            transition:'all 0.15s',
          }}>{mn}</button>
        ))}
      </div>

      {/* Summary cards */}
      <div style={{ display:'flex', gap:12, marginBottom:20 }}>
        {[
          { label:`Eligible Recruiters`, val: String(eligible.length), color:'#16a34a' },
          { label:`Policy Rewards`, val: fmtINR(totalPolicy), color:'#2563eb' },
          { label:`Manual Bonuses`, val: fmtINR(totalManual), color:'#7c3aed' },
          { label:`Total Payable`, val: fmtINR(totalPayout), color:'#1e293b' },
          { label:`Paid`, val: fmtINR(totalPaid), color:'#16a34a' },
          { label:`Balance`, val: fmtINR(totalBalance), color: totalBalance > 0 ? '#dc2626' : '#16a34a' },
        ].map(item => (
          <div key={item.label} style={{
            flex:1, background:'#fff', border:'1px solid #e5e7eb',
            borderRadius:12, padding:'14px 18px',
          }}>
            <div style={{ fontSize:20, fontWeight:800, color:item.color }}>{item.val}</div>
            <div style={{ fontSize:11, color:'#6b7280', marginTop:3 }}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:14, overflow:'hidden' }}>
        {/* Header */}
        <div style={{
          display:'grid', gridTemplateColumns:'36px 1fr 90px 100px 55px 90px 100px 100px 100px 100px',
          gap:8, padding:'10px 16px',
          background:'#f8fafc', borderBottom:'1px solid #e5e7eb',
          fontSize:11, letterSpacing:'1px', textTransform:'uppercase',
          color:'#94a3b8', fontWeight:600,
        }}>
          <div>#</div>
          <div>Recruiter</div>
          <div style={{textAlign:'right'}}>Target</div>
          <div style={{textAlign:'right'}}>Achieved</div>
          <div style={{textAlign:'right'}}>%</div>
          <div style={{textAlign:'right'}}>Eligibility</div>
          <div style={{textAlign:'right'}}>Policy Reward</div>
          <div style={{textAlign:'right'}}>Manual Bonus</div>
          <div style={{textAlign:'right'}}>Paid</div>
          <div style={{textAlign:'right', color:'#dc2626'}}>Balance</div>
        </div>

        {/* Rows */}
        <div style={{ padding:'6px 8px' }}>
          {rows.map(({ calc, m, manual, manualNote, paid }, idx) => {
            const isEditing = editingUser === calc.user.id
            const pctColor = m.pct >= 200 ? '#15803d' : m.pct >= 150 ? '#7c3aed' : m.pct >= 100 ? '#2563eb' : m.pct >= 85 ? '#b45309' : '#6b7280'
            const rowBg = m.pct >= 150 ? '#faf5ff' : m.pct >= 100 ? '#eff6ff' : 'transparent'
            const eligible = m.incentive > 0
            const [bg, color] = avatarColor(calc.user.full_name)
            const roleBadge = getRoleColor(calc.user.role)

            return (
              <div key={calc.user.id} style={{
                display:'grid', gridTemplateColumns:'36px 1fr 90px 100px 55px 90px 100px 100px 100px 100px',
                gap:8, padding:'10px 8px', borderRadius:8,
                background:rowBg, marginBottom:2, alignItems:'center',
              }}>
                <div style={{ fontSize:13, fontWeight:600, color:'#94a3b8', textAlign:'center' }}>{idx+1}</div>

                {/* Name */}
                <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                  <div style={{
                    width:32, height:32, borderRadius:'50%', background:bg, color,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontWeight:700, fontSize:11, flexShrink:0,
                  }}>{initials(calc.user.full_name)}</div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:13, color:'#1e293b', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {calc.user.full_name}
                    </div>
                    <span style={{ fontSize:10, padding:'1px 6px', borderRadius:100, background:roleBadge.bg, color:roleBadge.color, fontWeight:600 }}>
                      {getRoleLabel(calc.user.role)}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize:13, color:'#6b7280', textAlign:'right' }}>{fmtINR(m.target)}</div>
                <div style={{ fontSize:13, fontWeight:600, color:'#374151', textAlign:'right' }}>{fmtINR(m.achieved)}</div>
                <div style={{ fontSize:14, fontWeight:800, color:pctColor, textAlign:'right' }}>{m.pct}%</div>

                {/* Eligibility */}
                <div style={{ textAlign:'right' }}>
                  {eligible
                    ? <span style={{ fontSize:11, fontWeight:600, color:'#16a34a', background:'#f0fdf4', padding:'2px 8px', borderRadius:100, border:'1px solid #bbf7d0' }}>✓ Eligible</span>
                    : <span style={{ fontSize:11, color:'#9ca3af' }}>—</span>
                  }
                </div>

                {/* Policy reward */}
                <div style={{ fontSize:14, fontWeight:700, color: eligible?'#15803d':'#9ca3af', textAlign:'right' }}>
                  {eligible ? fmtINR(m.incentive) : 'Nil'}
                </div>

                {/* Manual bonus — inline edit */}
                <div style={{ textAlign:'right' }}>
                  {isEditing ? (
                    <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                      <input
                        type="number"
                        value={editAmt}
                        onChange={e => setEditAmt(e.target.value)}
                        placeholder="0"
                        style={{ width:72, padding:'4px 6px', borderRadius:6, border:'1px solid #8b5cf6', fontSize:12, fontFamily:'inherit', outline:'none' }}
                      />
                      <button onClick={() => {
                        onMonthManual(calc.user.id, selectedFyMonth, Number(editAmt)||0, editNote)
                        setEditingUser(null)
                      }} style={{ padding:'4px 8px', background:'#7c3aed', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontSize:12 }}>✓</button>
                      <button onClick={() => setEditingUser(null)} style={{ padding:'4px 6px', background:'transparent', color:'#6b7280', border:'1px solid #e5e7eb', borderRadius:6, cursor:'pointer', fontSize:12 }}>✕</button>
                    </div>
                  ) : (
                    <div
                      onClick={() => { setEditingUser(calc.user.id); setEditAmt(String(manual||'')); setEditNote(manualNote) }}
                      style={{ cursor:'pointer', fontSize:13, fontWeight: manual>0?700:400, color: manual>0?'#7c3aed':'#d1d5db' }}
                      title={manualNote || 'Click to add manual bonus'}
                    >
                      {manual > 0 ? fmtINR(manual) : '+ Add'}
                    </div>
                  )}
                </div>
                {/* Paid — inline edit */}
                <div style={{ textAlign:'right' }}>
                  {editingPaidUser === calc.user.id ? (
                    <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                      <input
                        type='number'
                        value={editPaidAmt}
                        onChange={e => setEditPaidAmt(e.target.value)}
                        placeholder='0'
                        style={{ width:72, padding:'4px 6px', borderRadius:6, border:'1px solid #16a34a', fontSize:12, fontFamily:'inherit', outline:'none' }}
                      />
                      <button onClick={() => {
                        onPaidMonthly(calc.user.id, selectedFyMonth, Number(editPaidAmt)||0)
                        setEditingPaidUser(null)
                      }} style={{ padding:'4px 8px', background:'#16a34a', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontSize:12 }}>✓</button>
                      <button onClick={() => setEditingPaidUser(null)} style={{ padding:'4px 6px', background:'transparent', color:'#6b7280', border:'1px solid #e5e7eb', borderRadius:6, cursor:'pointer', fontSize:12 }}>✕</button>
                    </div>
                  ) : (
                    <div
                      onClick={() => { setEditingPaidUser(calc.user.id); setEditPaidAmt(String(paid||'')) }}
                      style={{ cursor:'pointer', fontSize:13, fontWeight: paid>0?700:400, color: paid>0?'#16a34a':'#d1d5db' }}
                    >
                      {paid > 0 ? fmtINR(paid) : '+ Add'}
                    </div>
                  )}
                </div>
                {/* Balance */}
                <div style={{ textAlign:'right' }}>
                  {(() => {
                    const balance = m.incentive + manual - paid
                    return balance === 0
                      ? <span style={{ fontSize:12, color:'#16a34a', fontWeight:600 }}>✓ Settled</span>
                      : <span style={{ fontSize:14, fontWeight:800, color: balance > 0 ? '#dc2626' : '#16a34a' }}>{fmtINR(Math.abs(balance))}{balance < 0 ? ' ↑' : ''}</span>
                  })()}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer totals */}
        <div style={{
          display:'grid', gridTemplateColumns:'36px 1fr 90px 100px 55px 90px 100px 100px 100px 100px',
          gap:8, padding:'12px 16px',
          borderTop:'2px solid #e5e7eb', background:'#f8fafc',
        }}>
          <div />
          <div style={{ fontWeight:700, fontSize:13, color:'#374151' }}>
            {monthName} Total
          </div>
          <div style={{ fontSize:13, fontWeight:600, color:'#374151', textAlign:'right' }}>
            {fmtINR(rows.reduce((s,r)=>s+r.m.target,0))}
          </div>
          <div style={{ fontSize:13, fontWeight:600, color:'#374151', textAlign:'right' }}>
            {fmtINR(rows.reduce((s,r)=>s+r.m.achieved,0))}
          </div>
          <div style={{ fontSize:14, fontWeight:800, color:'#1e293b', textAlign:'right' }}>
            {rows.length > 0 ? Math.round(rows.reduce((s,r)=>s+r.m.pct,0)/rows.length) : 0}%
          </div>
          <div />
          <div style={{ fontSize:14, fontWeight:800, color:'#15803d', textAlign:'right' }}>
            {fmtINR(totalPolicy)}
          </div>
          <div style={{ fontSize:14, fontWeight:800, color:'#7c3aed', textAlign:'right' }}>
            {fmtINR(totalManual)}
          </div>
          <div style={{ fontSize:14, fontWeight:800, color:'#16a34a', textAlign:'right' }}>
            {fmtINR(totalPaid)}
          </div>
          <div style={{ fontSize:14, fontWeight:800, color: totalBalance>0?'#dc2626':'#16a34a', textAlign:'right' }}>
            {fmtINR(totalBalance)}
          </div>
        </div>

        <div style={{ padding:'8px 16px', background:'#fafafa', fontSize:11, color:'#94a3b8', borderTop:'1px solid #f1f5f9' }}>
          ℹ️ Reward = 1% flat on achieved revenue · Eligible only at 150%+ achievement · Below 50% avg = Nil
        </div>
      </div>
    </div>
  )
}

// ── Policy Banner ─────────────────────────────────────────────────────────────

function PolicyBanner({ view, half, setHalf, hyPayoutMonth }: {
  view: string; half: 'H1'|'H2'
  setHalf: (h:'H1'|'H2') => void
  hyPayoutMonth: string
}) {
  if (view === 'monthly') return (
    <div style={{
      background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:12,
      padding:'14px 20px', marginBottom:20, fontSize:13, color:'#1e40af',
      display:'flex', flexWrap:'wrap', gap:16, alignItems:'center',
    }}>
      <span>📋 <strong>Monthly Reward Policy:</strong> Flat 1% on achievement · Min 150% threshold · Below 50% avg = Nil · Reneges reversed next month</span>
    </div>
  )
  if (view === 'halfyearly') return (
    <div style={{ marginBottom:20 }}>
      <div style={{
        background:'#faf5ff', border:'1px solid #ddd6fe', borderRadius:12,
        padding:'14px 20px', fontSize:13, color:'#6d28d9', marginBottom:12,
        display:'flex', flexWrap:'wrap', gap:16, alignItems:'center',
      }}>
        <span>📋 <strong>Half-Yearly Policy:</strong> Team threshold ₹1Cr · Avg monthly &lt;60% = Null &amp; Void · Payout: <strong>{hyPayoutMonth}</strong></span>
        <div style={{ display:'flex', gap:6, marginLeft:'auto' }}>
          {(['H1','H2'] as const).map(h => (
            <button key={h} onClick={() => setHalf(h)} style={{
              padding:'5px 16px', borderRadius:100, cursor:'pointer', fontWeight:600,
              fontSize:13, fontFamily:'inherit', border:'1px solid #8b5cf6',
              background: half===h ? '#7c3aed' : 'transparent',
              color: half===h ? '#fff' : '#7c3aed',
            }}>{h} {h==='H1'?'(Apr–Sep)':'(Oct–Mar)'}</button>
          ))}
        </div>
      </div>
      {/* Slab table */}
      <div style={{
        background:'#fff', border:'1px solid #e5e7eb', borderRadius:12,
        overflow:'hidden', marginBottom:4,
      }}>
        <div style={{
          display:'grid', gridTemplateColumns:'100px 1fr 80px 1fr',
          background:'#f8fafc', borderBottom:'1px solid #e5e7eb',
          padding:'8px 16px', fontSize:11, fontWeight:700,
          letterSpacing:'1px', textTransform:'uppercase', color:'#6b7280',
        }}>
          <div>Slab</div><div>Achievement</div><div>Rate</div><div>Example (on ₹1Cr target)</div>
        </div>
        {HALF_YEARLY_SLABS.map(s => (
          <div key={s.label} style={{
            display:'grid', gridTemplateColumns:'100px 1fr 80px 1fr',
            padding:'8px 16px', fontSize:13, borderBottom:'1px solid #f1f5f9',
            alignItems:'center',
          }}>
            <div style={{ fontWeight:600, color: s.color }}>{s.label}</div>
            <div style={{ color:'#374151' }}>{s.desc}</div>
            <div style={{ fontWeight:700, color: s.rate===0?'#9ca3af':s.color }}>
              {s.rate===0 ? 'Nil' : `${(s.rate*100).toFixed(0)}%`}
            </div>
            <div style={{ color:'#6b7280', fontSize:12 }}>
              {s.rate===0 ? '—' : fmtINR(1_00_00_000 * s.rate)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
  return (
    <div style={{
      background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:12,
      padding:'14px 20px', marginBottom:20, fontSize:13, color:'#15803d',
    }}>
      📋 <strong>Annual Variable Policy:</strong> 100% payout on achieving 100%+ annual target · Null &amp; void on resignation/termination
    </div>
  )
}

// ── Summary Bar ───────────────────────────────────────────────────────────────

function SummaryBar({ calcs, view, half }: { calcs: RecruiterCalc[]; view: string; half: 'H1'|'H2' }) {
  const hyIndices = half === 'H1' ? [0,1,2,3,4,5] : [6,7,8,9,10,11]

  const totalMonthly = calcs.reduce((s,c) => s + c.months.reduce((ms,m) => ms+m.incentive+m.manual, 0), 0)
  const totalHY = calcs.reduce((s,c) => s + c.halfYearly.incentive + c.halfYearly.manualBonus, 0)
  const totalAnn = calcs.reduce((s,c) => s + c.annual.payout + c.annual.manualBonus, 0)
  const voidCount = calcs.filter(c => c.halfYearly.isVoid).length
  const qualifiedAnn = calcs.filter(c => c.annual.eligible).length

  const items =
    view === 'monthly' ? [
      { label:'Total Monthly Payout', value: fmtINR(totalMonthly), color:'#2563eb' },
      { label:'Recruiters with Rewards', value: String(calcs.filter(c=>c.months.some(m=>m.incentive>0)).length), color:'#16a34a' },
      { label:'Recruiters at 150%+', value: String(calcs.filter(c=>c.months.some(m=>m.pct>=150)).length), color:'#7c3aed' },
    ] : view === 'halfyearly' ? [
      { label:`${half} Total Incentive`, value: fmtINR(totalHY), color:'#7c3aed' },
      { label:'Void (avg < 60%)', value: String(voidCount), color:'#dc2626' },
      { label:'Eligible Recruiters', value: String(calcs.length - voidCount), color:'#16a34a' },
    ] : [
      { label:'Annual Variable Pool', value: fmtINR(totalAnn), color:'#15803d' },
      { label:'Eligible (≥100%)', value: String(qualifiedAnn), color:'#16a34a' },
      { label:'Not Eligible', value: String(calcs.length - qualifiedAnn), color:'#dc2626' },
    ]

  return (
    <div style={{ display:'flex', gap:12 }}>
      {items.map(item => (
        <div key={item.label} style={{
          flex:1, background:'#fff', border:'1px solid #e5e7eb',
          borderRadius:12, padding:'16px 20px',
        }}>
          <div style={{ fontSize:22, fontWeight:800, color:item.color }}>{item.value}</div>
          <div style={{ fontSize:12, color:'#6b7280', marginTop:3 }}>{item.label}</div>
        </div>
      ))}
    </div>
  )
}

// ── Recruiter Card ────────────────────────────────────────────────────────────

function RecruiterCard({ calc, view, half, expanded, onToggle, onMonthManual, onHYManual, onAnnualManual }: {
  calc: RecruiterCalc
  view: string
  half: 'H1'|'H2'
  expanded: boolean
  onToggle: () => void
  onMonthManual: (fyIdx: number, amount: number, note: string) => void
  onHYManual: (amount: number, note: string) => void
  onAnnualManual: (amount: number, note: string) => void
}) {
  const { user, months, halfYearly, annual } = calc
  const [bg, color] = avatarColor(user.full_name)
  const roleBadge = getRoleColor(user.role)
  const hyIndices = half === 'H1' ? [0,1,2,3,4,5] : [6,7,8,9,10,11]

  // What to show in summary row
  const monthlyTotal = months.reduce((s,m) => s+m.incentive+m.manual, 0)
  const hyTotal = halfYearly.incentive + halfYearly.manualBonus

  const summaryPct = view === 'monthly'
    ? (months.reduce((s,m)=>s+m.pct,0)/12).toFixed(0)
    : view === 'halfyearly'
    ? halfYearly.pct
    : annual.pct

  const summaryAmt = view === 'monthly' ? monthlyTotal
    : view === 'halfyearly' ? hyTotal
    : annual.payout + annual.manualBonus

  const pctColor = Number(summaryPct) >= 150 ? '#15803d' : Number(summaryPct) >= 100 ? '#1d4ed8' : Number(summaryPct) >= 85 ? '#b45309' : '#dc2626'

  return (
    <div style={{
      background:'#fff', border:'1px solid #e5e7eb',
      borderRadius:14, overflow:'hidden',
      boxShadow: expanded ? '0 4px 16px rgba(0,0,0,0.08)' : 'none',
      transition:'box-shadow 0.2s',
    }}>
      {/* Summary row */}
      <div
        onClick={onToggle}
        style={{
          display:'grid',
          gridTemplateColumns:'36px 1fr 100px 120px 140px 36px',
          gap:12, alignItems:'center', padding:'16px 20px',
          cursor:'pointer',
        }}
      >
        <div style={{
          width:36, height:36, borderRadius:'50%', background:bg, color,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontWeight:700, fontSize:13, flexShrink:0,
        }}>{initials(user.full_name)}</div>

        <div>
          <div style={{ fontWeight:700, fontSize:15, color:'#1e293b' }}>{user.full_name}</div>
          <span style={{
            fontSize:10, padding:'2px 8px', borderRadius:100,
            background:roleBadge.bg, color:roleBadge.color, fontWeight:600,
          }}>{getRoleLabel(user.role)}</span>
        </div>

        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:12, color:'#94a3b8' }}>Target</div>
          <div style={{ fontWeight:600, fontSize:13, color:'#374151' }}>
            {fmtINR(view==='monthly' ? user.monthly_target
              : view==='halfyearly' ? halfYearly.totalTarget
              : annual.totalTarget)}
          </div>
        </div>

        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:12, color:'#94a3b8' }}>Achievement</div>
          <div style={{ fontWeight:800, fontSize:18, color:pctColor }}>{summaryPct}%</div>
        </div>

        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:12, color:'#94a3b8' }}>
            {view==='monthly' ? 'Total Rewards' : view==='halfyearly' ? `${half} Incentive` : 'Annual Variable'}
          </div>
          <div style={{ fontWeight:800, fontSize:16, color:'#1e293b' }}>
            {fmtINR(summaryAmt)}
          </div>
          {view==='halfyearly' && halfYearly.isVoid && (
            <span style={{ fontSize:10, color:'#dc2626', fontWeight:600 }}>⚠️ Void</span>
          )}
        </div>

        <div style={{ fontSize:18, color:'#94a3b8', textAlign:'center' }}>
          {expanded ? '▲' : '▼'}
        </div>
      </div>

      {/* Detail panel */}
      {expanded && (
        <div style={{ borderTop:'1px solid #f1f5f9', padding:'20px' }}>

          {/* ── Monthly view ── */}
          {view === 'monthly' && (
            <div>
              <div style={{
                display:'grid',
                gridTemplateColumns:'80px 90px 100px 60px 90px 90px 1fr',
                gap:8, padding:'6px 8px',
                fontSize:11, color:'#94a3b8', fontWeight:600,
                letterSpacing:'0.8px', textTransform:'uppercase',
                borderBottom:'1px solid #f1f5f9', marginBottom:4,
              }}>
                <div>Month</div><div style={{textAlign:'right'}}>Target</div>
                <div style={{textAlign:'right'}}>Achieved</div>
                <div style={{textAlign:'right'}}>%</div>
                <div style={{textAlign:'right'}}>Reward</div>
                <div style={{textAlign:'right'}}>Manual Bonus</div>
                <div style={{textAlign:'right'}}>Note</div>
              </div>
              {months.map((m, fyIdx) => (
                <MonthRow
                  key={fyIdx} month={m} fyIdx={fyIdx}
                  onManual={(amount, note) => onMonthManual(fyIdx, amount, note)}
                />
              ))}
              <div style={{
                display:'flex', justifyContent:'flex-end', gap:24,
                padding:'12px 8px 4px', borderTop:'1px solid #f1f5f9', marginTop:8,
              }}>
                <span style={{ fontSize:13, color:'#6b7280' }}>Total Policy Rewards</span>
                <span style={{ fontWeight:800, fontSize:16, color:'#1e293b' }}>
                  {fmtINR(months.reduce((s,m)=>s+m.incentive,0))}
                </span>
                <span style={{ fontSize:13, color:'#6b7280', marginLeft:16 }}>Total Manual</span>
                <span style={{ fontWeight:800, fontSize:16, color:'#7c3aed' }}>
                  {fmtINR(months.reduce((s,m)=>s+m.manual,0))}
                </span>
                <span style={{ fontSize:13, color:'#6b7280', marginLeft:16 }}>Grand Total</span>
                <span style={{ fontWeight:800, fontSize:16, color:'#16a34a' }}>
                  {fmtINR(months.reduce((s,m)=>s+m.incentive+m.manual,0))}
                </span>
              </div>
            </div>
          )}

          {/* ── Half-yearly view ── */}
          {view === 'halfyearly' && (
            <div>
              {/* Month breakdown */}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#374151', marginBottom:8 }}>
                  Monthly breakdown ({half === 'H1' ? 'Apr–Sep' : 'Oct–Mar'})
                </div>
                <div style={{
                  display:'grid',
                  gridTemplateColumns:'repeat(6,1fr)',
                  gap:8,
                }}>
                  {hyIndices.map(fyIdx => {
                    const m = months[fyIdx]
                    const tier = m.pct >= 200 ? '#10b981' : m.pct >= 150 ? '#8b5cf6' : m.pct >= 100 ? '#3b82f6' : m.pct >= 85 ? '#f59e0b' : '#6b7280'
                    return (
                      <div key={fyIdx} style={{
                        background:'#f8fafc', borderRadius:10, padding:'10px 12px',
                        border:'1px solid #e5e7eb', textAlign:'center',
                      }}>
                        <div style={{ fontSize:11, color:'#6b7280', marginBottom:4 }}>{m.month.split(' ')[0]}</div>
                        <div style={{ fontWeight:800, fontSize:17, color:tier }}>{m.pct}%</div>
                        <div style={{ fontSize:11, color:'#94a3b8' }}>{fmtINR(m.achieved)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* HY summary */}
              <div style={{
                display:'grid', gridTemplateColumns:'repeat(4,1fr)',
                gap:12, marginBottom:16,
              }}>
                {[
                  { label:'Total Target', val: fmtINR(halfYearly.totalTarget), color:'#374151' },
                  { label:'Total Achieved', val: fmtINR(halfYearly.totalAchieved), color:'#374151' },
                  { label:'Achievement %', val: `${halfYearly.pct}%`, color: halfYearly.isVoid?'#dc2626':'#1d4ed8' },
                  { label:'Avg Monthly %', val: `${halfYearly.avgMonthlyPct}%`, color: halfYearly.avgMonthlyPct < HY_AVG_MIN ? '#dc2626':'#16a34a' },
                ].map(item => (
                  <div key={item.label} style={{
                    background:'#f8fafc', borderRadius:10, padding:'12px 16px',
                    border:'1px solid #e5e7eb',
                  }}>
                    <div style={{ fontSize:11, color:'#94a3b8' }}>{item.label}</div>
                    <div style={{ fontWeight:800, fontSize:20, color:item.color }}>{item.val}</div>
                  </div>
                ))}
              </div>

              {halfYearly.isVoid ? (
                <div style={{
                  background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10,
                  padding:'12px 16px', color:'#dc2626', fontWeight:600, marginBottom:16,
                }}>
                  ⚠️ Incentive is NULL & VOID — Average monthly achievement ({halfYearly.avgMonthlyPct}%) is below 60% threshold.
                </div>
              ) : (
                <div style={{
                  background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10,
                  padding:'12px 16px', marginBottom:16, display:'flex', alignItems:'center', gap:16,
                }}>
                  <div>
                    <div style={{ fontSize:12, color:'#6b7280' }}>Applicable Slab</div>
                    <div style={{ fontWeight:700, fontSize:15, color: halfYearly.slab?.color }}>
                      {halfYearly.slab?.label} — {halfYearly.slab?.desc} @ {halfYearly.slab ? (halfYearly.slab.rate*100).toFixed(0) : 0}%
                    </div>
                  </div>
                  <div style={{ marginLeft:'auto' }}>
                    <div style={{ fontSize:12, color:'#6b7280' }}>Policy Incentive</div>
                    <div style={{ fontWeight:800, fontSize:22, color:'#15803d' }}>
                      {fmtINR(halfYearly.incentive)}
                    </div>
                  </div>
                </div>
              )}

              {/* Manual bonus */}
              <ManualInput
                label="Special / Manual Bonus"
                value={halfYearly.manualBonus}
                note={halfYearly.manualNote}
                onChange={onHYManual}
              />
            </div>
          )}

          {/* ── Annual view ── */}
          {view === 'annual' && (
            <div>
              <div style={{
                display:'grid', gridTemplateColumns:'repeat(4,1fr)',
                gap:12, marginBottom:16,
              }}>
                {[
                  { label:'Annual Target', val: fmtINR(annual.totalTarget), color:'#374151' },
                  { label:'Total Achieved', val: fmtINR(annual.totalAchieved), color:'#374151' },
                  { label:'Achievement %', val: `${annual.pct}%`, color: annual.eligible ? '#15803d':'#dc2626' },
                  { label:'Eligibility', val: annual.eligible ? '✅ Eligible':'❌ Not Eligible', color: annual.eligible ? '#15803d':'#dc2626' },
                ].map(item => (
                  <div key={item.label} style={{
                    background:'#f8fafc', borderRadius:10, padding:'12px 16px',
                    border:'1px solid #e5e7eb',
                  }}>
                    <div style={{ fontSize:11, color:'#94a3b8' }}>{item.label}</div>
                    <div style={{ fontWeight:800, fontSize:18, color:item.color }}>{item.val}</div>
                  </div>
                ))}
              </div>

              {annual.eligible ? (
                <div style={{
                  background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10,
                  padding:'12px 16px', marginBottom:16, display:'flex', alignItems:'center', gap:16,
                }}>
                  <div>
                    <div style={{ fontSize:13, color:'#6b7280' }}>Annual Variable Payout (100% of achieved revenue)</div>
                    <div style={{ fontSize:11, color:'#94a3b8', marginTop:2 }}>100% target achieved — full variable unlocked</div>
                  </div>
                  <div style={{ fontWeight:800, fontSize:24, color:'#15803d', marginLeft:'auto' }}>
                    {fmtINR(annual.payout)}
                  </div>
                </div>
              ) : (
                <div style={{
                  background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10,
                  padding:'12px 16px', color:'#dc2626', fontWeight:600, marginBottom:16,
                }}>
                  Annual target not achieved ({annual.pct}% vs 100% required). Variable payout = Nil.
                </div>
              )}

              <ManualInput
                label="Special / Manual Annual Bonus"
                value={annual.manualBonus}
                note={annual.manualNote}
                onChange={onAnnualManual}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Month Row ─────────────────────────────────────────────────────────────────

function MonthRow({ month: m, fyIdx, onManual }: {
  month: MonthEntry; fyIdx: number
  onManual: (amount: number, note: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [amt, setAmt] = useState(String(m.manual || ''))
  const [note, setNote] = useState(m.manualNote || '')

  const pctColor = m.pct >= 200 ? '#15803d' : m.pct >= 150 ? '#7c3aed' : m.pct >= 100 ? '#1d4ed8' : m.pct >= 85 ? '#b45309' : '#6b7280'
  const rowBg = m.pct >= 150 ? '#faf5ff' : m.pct >= 100 ? '#eff6ff' : 'transparent'

  return (
    <div style={{
      display:'grid',
      gridTemplateColumns:'80px 90px 100px 60px 90px 90px 1fr',
      gap:8, alignItems:'center', padding:'8px 8px',
      borderRadius:8, background:rowBg, marginBottom:2,
    }}>
      <div style={{ fontSize:13, fontWeight:600, color:'#374151' }}>{m.month.split(' ')[0]}</div>
      <div style={{ fontSize:13, color:'#6b7280', textAlign:'right' }}>{fmtINR(m.target)}</div>
      <div style={{ fontSize:13, color:'#374151', textAlign:'right' }}>{fmtINR(m.achieved)}</div>
      <div style={{ fontWeight:700, fontSize:14, color:pctColor, textAlign:'right' }}>{m.pct}%</div>
      <div style={{ fontWeight:700, fontSize:13, color:'#15803d', textAlign:'right' }}>
        {m.incentive > 0 ? fmtINR(m.incentive) : <span style={{color:'#94a3b8'}}>—</span>}
      </div>
      {editing ? (
        <>
          <div style={{ display:'flex', gap:4 }}>
            <input
              type="number"
              value={amt}
              onChange={e => setAmt(e.target.value)}
              placeholder="0"
              style={{
                width:'100%', padding:'4px 8px', borderRadius:6,
                border:'1px solid #8b5cf6', fontSize:12,
                fontFamily:'inherit', outline:'none',
              }}
            />
          </div>
          <div style={{ display:'flex', gap:4 }}>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Reason..."
              style={{
                flex:1, padding:'4px 8px', borderRadius:6,
                border:'1px solid #e5e7eb', fontSize:12,
                fontFamily:'inherit', outline:'none',
              }}
            />
            <button
              onClick={() => { onManual(Number(amt)||0, note); setEditing(false) }}
              style={{
                padding:'4px 10px', background:'#7c3aed', color:'#fff',
                border:'none', borderRadius:6, cursor:'pointer', fontSize:12,
                fontFamily:'inherit',
              }}>✓</button>
            <button
              onClick={() => setEditing(false)}
              style={{
                padding:'4px 8px', background:'transparent', color:'#6b7280',
                border:'1px solid #e5e7eb', borderRadius:6, cursor:'pointer', fontSize:12,
              }}>✕</button>
          </div>
        </>
      ) : (
        <>
          <div
            onClick={() => setEditing(true)}
            style={{
              fontSize:13, color: m.manual>0 ? '#7c3aed':'#d1d5db',
              textAlign:'right', cursor:'pointer', fontWeight: m.manual>0?700:400,
            }}>
            {m.manual > 0 ? fmtINR(m.manual) : '+ Add'}
          </div>
          <div style={{ fontSize:12, color:'#94a3b8', textAlign:'right' }}>
            {m.manualNote || '—'}
          </div>
        </>
      )}
    </div>
  )
}

// ── Manual Input ──────────────────────────────────────────────────────────────

function ManualInput({ label, value, note, onChange }: {
  label: string; value: number; note: string
  onChange: (amount: number, note: string) => void
}) {
  const [amt, setAmt] = useState(String(value || ''))
  const [n, setN] = useState(note || '')

  return (
    <div style={{
      background:'#faf5ff', border:'1px dashed #c4b5fd', borderRadius:10,
      padding:'14px 16px',
    }}>
      <div style={{ fontSize:12, fontWeight:700, color:'#7c3aed', marginBottom:10 }}>
        ✦ {label}
      </div>
      <div style={{ display:'flex', gap:10, alignItems:'flex-end' }}>
        <div style={{ flex:'0 0 160px' }}>
          <div style={{ fontSize:11, color:'#6b7280', marginBottom:4 }}>Amount (₹)</div>
          <input
            type="number"
            value={amt}
            onChange={e => setAmt(e.target.value)}
            placeholder="Enter amount..."
            style={{
              width:'100%', padding:'8px 12px', borderRadius:8,
              border:'1px solid #c4b5fd', fontSize:14,
              fontFamily:'inherit', outline:'none',
            }}
          />
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, color:'#6b7280', marginBottom:4 }}>Reason / Note</div>
          <input
            type="text"
            value={n}
            onChange={e => setN(e.target.value)}
            placeholder="e.g. Special category bonus, Performance award..."
            style={{
              width:'100%', padding:'8px 12px', borderRadius:8,
              border:'1px solid #c4b5fd', fontSize:13,
              fontFamily:'inherit', outline:'none',
            }}
          />
        </div>
        <button
          onClick={() => onChange(Number(amt)||0, n)}
          style={{
            padding:'8px 20px', background:'#7c3aed', color:'#fff',
            border:'none', borderRadius:8, cursor:'pointer',
            fontSize:14, fontWeight:600, fontFamily:'inherit',
            flexShrink:0,
          }}>
          Save
        </button>
      </div>
      {value > 0 && (
        <div style={{ marginTop:10, fontSize:13, color:'#6d28d9', fontWeight:600 }}>
          Current: {fmtINR(value)} {note ? `— "${note}"` : ''}
        </div>
      )}
    </div>
  )
}

// ── Shared Styles ─────────────────────────────────────────────────────────────

const navBtn: React.CSSProperties = {
  width:32, height:32, borderRadius:'50%',
  border:'1px solid #e5e7eb', background:'#fff',
  cursor:'pointer', fontSize:16, color:'#374151',
  display:'flex', alignItems:'center', justifyContent:'center',
  fontFamily:'inherit',
}