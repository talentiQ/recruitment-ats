'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// ── Policy constants ──────────────────────────────────────────────────────────
const MONTHLY_RATE            = 0.01
const MONTHLY_BONUS_THRESHOLD = 150
const MONTHLY_MIN_PCT         = 50
const HY_AVG_MIN              = 60
const HALF_YEARLY_SLABS = [
  { min: 0,   max: 84.99,    rate: 0,    desc: '0–84%',    color: '#6b7280', label: 'Slab I'   },
  { min: 85,  max: 99.99,    rate: 0.03, desc: '85–99%',   color: '#f59e0b', label: 'Slab II'  },
  { min: 100, max: 149.99,   rate: 0.06, desc: '100–149%', color: '#3b82f6', label: 'Slab III' },
  { min: 150, max: 199.99,   rate: 0.07, desc: '150–199%', color: '#8b5cf6', label: 'Slab IV'  },
  { min: 200, max: Infinity, rate: 0.08, desc: '200%+',    color: '#10b981', label: 'Slab V'   },
]

const FY_CAL_MONTHS = [3,4,5,6,7,8,9,10,11,0,1,2]
const MONTH_NAMES   = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']

function fmtINR(n: number) {
  if (n >= 100000) return `₹${(n/100000).toFixed(1)}L`
  if (n >= 1000)   return `₹${(n/1000).toFixed(1)}K`
  return `₹${Math.round(n)}`
}
function fmtINRFull(n: number) {
  return new Intl.NumberFormat('en-IN', {
    style:'currency', currency:'INR', maximumFractionDigits:0,
  }).format(n)
}
function getHYSlab(pct: number) {
  return HALF_YEARLY_SLABS.find(s => pct >= s.min && pct <= s.max) ?? HALF_YEARLY_SLABS[0]
}
function calcMonthlyReward(achieved: number, pct: number) {
  if (pct < MONTHLY_MIN_PCT || pct < MONTHLY_BONUS_THRESHOLD) return 0
  return Math.round(achieved * MONTHLY_RATE)
}
function calcHYIncentive(achieved: number, pct: number) {
  return Math.round(achieved * getHYSlab(pct).rate)
}

interface MonthData {
  fyIdx: number; name: string; target: number
  achieved: number; pct: number; reward: number
  renegeDeduction: number
}

interface TeamRewardSummary {
  name: string
  pct: number
  reward: number
  tier: string
}

interface TLRewardsSectionProps {
  tlUserId: string
  // Pass recruiterDetails already computed in TL dashboard
  // to avoid re-fetching — shape matches RecruiterDetail in tl/dashboard
  recruiterDetails: Array<{
    id: string
    name: string
    role: string
    monthlyTarget: number
    monthlyRevenue: number
    monthlyAchievement: number
  }>
}

export default function TLRewardsSection({ tlUserId, recruiterDetails }: TLRewardsSectionProps) {
  const [tab, setTab]               = useState<'personal'|'team'>('personal')
  const [subTab, setSubTab]         = useState<'monthly'|'halfyearly'>('monthly')
  const [monthsData, setMonthsData] = useState<MonthData[]>([])
  const [loading, setLoading]       = useState(true)
  const [viewFyIdx, setViewFyIdx]   = useState(-1)

  const now      = new Date()
  const fyStart  = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  const curFyIdx = FY_CAL_MONTHS.indexOf(now.getMonth())
  const half: 'H1'|'H2' = curFyIdx <= 5 ? 'H1' : 'H2'
  const hyIndices = half === 'H1' ? [0,1,2,3,4,5] : [6,7,8,9,10,11]

  // ── Load TL's personal FY revenue ──────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)

    const { data: userData } = await supabase
      .from('users')
      .select('monthly_target')
      .eq('id', tlUserId)
      .single()

    const mTarget = userData?.monthly_target ?? 0

    const { data: candidates } = await supabase
      .from('candidates')
      .select('revenue_earned, date_joined, is_renege, renege_date')
      .eq('assigned_to', tlUserId)
      .in('current_stage', ['joined','renege'])
      .not('date_joined', 'is', null)
      .gte('date_joined', `${fyStart}-04-01`)
      .lte('date_joined', `${fyStart+1}-03-31`)

    const revMap:    Record<number,number> = {}
    const deductMap: Record<number,number> = {}

    for (const c of (candidates ?? [])) {
      if (!c.date_joined) continue
      const calMonth = new Date(c.date_joined).getMonth()
      const fyIdx    = FY_CAL_MONTHS.indexOf(calMonth)
      if (fyIdx === -1) continue
      const rev = c.revenue_earned ?? 0

      if (c.is_renege && c.renege_date) {
        const rCalMonth = new Date(c.renege_date).getMonth()
        const rFyIdx    = FY_CAL_MONTHS.indexOf(rCalMonth)
        const sameMonth = rCalMonth === calMonth &&
          new Date(c.renege_date).getFullYear() === new Date(c.date_joined).getFullYear()
        if (sameMonth) {
          revMap[fyIdx] = (revMap[fyIdx] ?? 0)
        } else {
          revMap[fyIdx]     = (revMap[fyIdx]     ?? 0) + rev
          deductMap[rFyIdx] = (deductMap[rFyIdx] ?? 0) + rev
        }
      } else {
        revMap[fyIdx] = (revMap[fyIdx] ?? 0) + rev
      }
    }

    const months: MonthData[] = FY_CAL_MONTHS.map((_, fyIdx) => {
      const calYear     = FY_CAL_MONTHS[fyIdx] >= 3 ? fyStart : fyStart + 1
      const achieved    = Math.max(0, (revMap[fyIdx] ?? 0) - (deductMap[fyIdx] ?? 0))
      const pct         = mTarget > 0 ? Math.round((achieved / mTarget) * 100) : 0
      const reward      = calcMonthlyReward(achieved, pct)
      return {
        fyIdx, name: `${MONTH_NAMES[fyIdx]} ${calYear}`,
        target: mTarget, achieved, pct, reward,
        renegeDeduction: deductMap[fyIdx] ?? 0,
      }
    })

    setMonthsData(months)
    setViewFyIdx(prev => prev === -1 ? curFyIdx : prev)
    setLoading(false)
  }, [tlUserId, fyStart, curFyIdx])

  useEffect(() => { load() }, [load])

  // ── Derived: personal ──────────────────────────────────────────────────────
  const activeFyIdx    = viewFyIdx === -1 ? curFyIdx : viewFyIdx
  const isCurrentMonth = activeFyIdx === curFyIdx
  const isFutureMonth  = activeFyIdx > curFyIdx
  const curMonth       = monthsData[activeFyIdx]
  const curPct         = curMonth?.pct ?? 0
  const curReward      = curMonth?.reward ?? 0

  const tier = curPct >= 200 ? { emoji:'👑', label:'Legend',   cls:'bg-green-100 text-green-800'  }
             : curPct >= 150 ? { emoji:'🚀', label:'Achiever', cls:'bg-purple-100 text-purple-800' }
             : curPct >= 100 ? { emoji:'⭐', label:'Star',     cls:'bg-yellow-100 text-yellow-800' }
             : null

  // HY personal
  const hyMonths   = hyIndices.map(i => monthsData[i]).filter(Boolean)
  const hyAchieved = hyMonths.reduce((s,m) => s + m.achieved, 0)
  const hyTarget   = hyMonths.reduce((s,m) => s + m.target,   0)
  const hyPct      = hyTarget > 0 ? Math.round((hyAchieved / hyTarget) * 100) : 0
  const avgMoPct   = hyMonths.length > 0
    ? Math.round(hyMonths.reduce((s,m) => s + m.pct, 0) / hyMonths.length) : 0
  const isVoid     = avgMoPct < HY_AVG_MIN
  const hySlab     = isVoid ? null : getHYSlab(hyPct)
  const hyIncentive = isVoid ? 0 : calcHYIncentive(hyAchieved, hyPct)
  const hyPayoutMonth = half === 'H1' ? 'December 2026' : 'July 2027'

  // ── Derived: team rewards summary ─────────────────────────────────────────
  const teamSummary: TeamRewardSummary[] = recruiterDetails.map(r => {
    const pct    = r.monthlyAchievement
    const reward = calcMonthlyReward(r.monthlyRevenue, pct)
    const t      = pct >= 200 ? '👑 Legend' : pct >= 150 ? '🚀 Achiever' : pct >= 100 ? '⭐ Star' : '—'
    return { name: r.name, pct, reward, tier: t }
  }).sort((a,b) => b.pct - a.pct)

  const teamTotalRewards   = teamSummary.reduce((s,r) => s + r.reward, 0)
  const teamQualified      = teamSummary.filter(r => r.reward > 0).length
  const teamLegends        = teamSummary.filter(r => r.tier.includes('Legend')).length
  const teamAchievers      = teamSummary.filter(r => r.tier.includes('Achiever')).length
  const teamStars          = teamSummary.filter(r => r.tier.includes('Star')).length

  if (loading) return (
    <div className="card" style={{ padding:24, textAlign:'center', color:'#7c3aed' }}>
      Loading rewards data...
    </div>
  )

  return (
    <div className="card" style={{ padding:0, overflow:'hidden', border:'2px solid #ddd6fe' }}>

      {/* Header */}
      <div style={{
        background:'linear-gradient(135deg, #7c3aed, #4f46e5)',
        padding:'14px 20px',
        display:'flex', alignItems:'center', justifyContent:'space-between',
      }}>
        <div>
          <div style={{ color:'#fff', fontWeight:800, fontSize:16 }}>
            💰 Rewards & Incentives
          </div>
          <div style={{ color:'rgba(255,255,255,0.7)', fontSize:12, marginTop:2 }}>
            Personal + Team · {half} · FY {fyStart}-{String(fyStart+1).slice(2)}
          </div>
        </div>
        {tier && (
          <span className={`px-3 py-1 rounded-full text-sm font-bold ${tier.cls}`}>
            {tier.emoji} {tier.label}
          </span>
        )}
      </div>

      {/* Main tabs: Personal / Team */}
      <div style={{ display:'flex', background:'#fff', borderBottom:'1px solid #e5e7eb' }}>
        {(['personal','team'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex:1, padding:'10px', border:'none', background:'transparent',
            cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:'inherit',
            color: tab===t ? '#7c3aed' : '#6b7280',
            borderBottom: tab===t ? '2px solid #7c3aed' : '2px solid transparent',
            marginBottom:-1,
          }}>
            {t === 'personal' ? '👤 My Rewards' : '👥 Team Rewards'}
          </button>
        ))}
      </div>

      <div style={{ padding:'16px 20px' }}>

        {/* ── PERSONAL TAB ── */}
        {tab === 'personal' && (
          <div>
            {/* Monthly / HY sub-tabs */}
            <div style={{ display:'flex', gap:6, marginBottom:16 }}>
              {(['monthly','halfyearly'] as const).map(t => (
                <button key={t} onClick={() => setSubTab(t)} style={{
                  flex:1, padding:'7px', borderRadius:8,
                  border:`1px solid ${subTab===t ? '#7c3aed' : '#e5e7eb'}`,
                  background: subTab===t ? '#faf5ff' : '#fff',
                  cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'inherit',
                  color: subTab===t ? '#7c3aed' : '#6b7280',
                }}>
                  {t === 'monthly' ? '📅 Monthly' : '📊 Half-Yearly'}
                </button>
              ))}
            </div>

            {/* ── Personal Monthly ── */}
            {subTab === 'monthly' && (
              <div>
                {/* Month navigator */}
                <div style={{
                  display:'flex', alignItems:'center', justifyContent:'space-between',
                  marginBottom:14, gap:8,
                }}>
                  <button
                    onClick={() => setViewFyIdx(i => Math.max(0, i-1))}
                    disabled={activeFyIdx <= 0}
                    style={{
                      width:30, height:30, borderRadius:'50%',
                      border:'1px solid #e5e7eb', background:'#fff',
                      cursor: activeFyIdx <= 0 ? 'not-allowed' : 'pointer',
                      fontSize:16, color: activeFyIdx <= 0 ? '#d1d5db' : '#374151',
                      display:'flex', alignItems:'center', justifyContent:'center',
                    }}>&#8249;</button>

                  <div style={{ textAlign:'center', flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:14, color:'#1e293b' }}>
                      {curMonth?.name ?? '—'}
                      {isCurrentMonth && (
                        <span style={{
                          fontSize:9, color:'#7c3aed', marginLeft:6,
                          background:'#ede9fe', padding:'1px 6px', borderRadius:100, fontWeight:600,
                        }}>Current</span>
                      )}
                      {!isCurrentMonth && (
                        <button onClick={() => setViewFyIdx(curFyIdx)} style={{
                          fontSize:9, color:'#7c3aed', marginLeft:6, background:'none',
                          border:'none', cursor:'pointer', textDecoration:'underline', padding:0,
                        }}>back</button>
                      )}
                    </div>
                    <div style={{ fontSize:10, color:'#94a3b8' }}>
                      {activeFyIdx+1} of 12
                    </div>
                  </div>

                  <button
                    onClick={() => setViewFyIdx(i => Math.min(11, i+1))}
                    disabled={activeFyIdx >= 11}
                    style={{
                      width:30, height:30, borderRadius:'50%',
                      border:'1px solid #e5e7eb', background:'#fff',
                      cursor: activeFyIdx >= 11 ? 'not-allowed' : 'pointer',
                      fontSize:16, color: activeFyIdx >= 11 ? '#d1d5db' : '#374151',
                      display:'flex', alignItems:'center', justifyContent:'center',
                    }}>&#8250;</button>
                </div>

                {/* Reward + % side by side */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
                  <div style={{
                    textAlign:'center', background:'#f8fafc',
                    borderRadius:10, padding:'12px 8px',
                    border:'1px solid #e5e7eb',
                  }}>
                    <div style={{ fontSize:10, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.5px' }}>
                      {isFutureMonth ? 'Projected' : 'Reward Earned'}
                    </div>
                    <div style={{
                      fontSize:24, fontWeight:800, marginTop:4,
                      color: curReward > 0 ? '#15803d' : isFutureMonth ? '#c4b5fd' : '#94a3b8',
                    }}>
                      {isFutureMonth ? '—' : curReward > 0 ? fmtINR(curReward) : 'Nil'}
                    </div>
                    {curReward > 0 && (
                      <div style={{ fontSize:10, color:'#6b7280', marginTop:2 }}>
                        1% of {fmtINR(curMonth?.achieved ?? 0)}
                      </div>
                    )}
                  </div>
                  <div style={{
                    textAlign:'center', background:'#f8fafc',
                    borderRadius:10, padding:'12px 8px',
                    border:'1px solid #e5e7eb',
                  }}>
                    <div style={{ fontSize:10, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.5px' }}>
                      Achievement
                    </div>
                    <div style={{
                      fontSize:28, fontWeight:800, marginTop:4,
                      color: curPct >= 200 ? '#15803d' : curPct >= 150 ? '#6d28d9'
                        : curPct >= 100 ? '#1d4ed8' : curPct >= 50 ? '#b45309' : '#dc2626',
                    }}>
                      {isFutureMonth ? '—' : `${curPct}%`}
                    </div>
                    <div style={{ fontSize:10, color:'#6b7280', marginTop:2 }}>
                      Target: {fmtINR(curMonth?.target ?? 0)}
                    </div>
                  </div>
                </div>

                {/* Progress bar with ticks */}
                <div style={{ marginBottom:14 }}>
                  <div style={{ position:'relative', height:10, background:'#f1f5f9', borderRadius:100, overflow:'hidden' }}>
                    <div style={{
                      height:'100%', borderRadius:100,
                      width:`${Math.min(100, isFutureMonth ? 0 : curPct)}%`,
                      background: curPct >= 200 ? 'linear-gradient(90deg,#059669,#10b981)'
                        : curPct >= 150 ? 'linear-gradient(90deg,#7c3aed,#8b5cf6)'
                        : curPct >= 100 ? 'linear-gradient(90deg,#2563eb,#3b82f6)'
                        : 'linear-gradient(90deg,#f59e0b,#fbbf24)',
                      transition:'width 0.6s ease',
                    }} />
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:'#94a3b8', marginTop:3 }}>
                    <span>0%</span><span>⭐100%</span><span>🚀150%</span><span>👑200%</span>
                  </div>
                </div>

                {/* Renege deduction */}
                {(curMonth?.renegeDeduction ?? 0) > 0 && (
                  <div style={{
                    background:'#fef2f2', border:'1px solid #fecaca',
                    borderRadius:8, padding:'8px 12px', marginBottom:10,
                    fontSize:12, color:'#dc2626', fontWeight:600,
                  }}>
                    ⚠️ Renege deduction this month: {fmtINRFull(curMonth!.renegeDeduction)}
                    <div style={{ fontWeight:400, color:'#7f1d1d', marginTop:2, fontSize:11 }}>
                      Adjusted against salary. Reward recalculated on net revenue.
                    </div>
                  </div>
                )}

                {/* Policy note */}
                <div style={{
                  fontSize:10, color:'#6b7280', background:'#f8fafc',
                  borderRadius:6, padding:'7px 10px', borderLeft:'3px solid #e5e7eb',
                }}>
                  1% flat at 150%+ · Below 50% = Nil · Reneges reversed in month of renege
                </div>
              </div>
            )}

            {/* ── Personal Half-Yearly ── */}
            {subTab === 'halfyearly' && (
              <div>
                {/* Incentive amount */}
                <div style={{ textAlign:'center', marginBottom:14 }}>
                  <div style={{ fontSize:10, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.5px' }}>
                    {half} Incentive ({half === 'H1' ? 'Apr–Sep' : 'Oct–Mar'})
                  </div>
                  {isVoid ? (
                    <div style={{ fontSize:22, fontWeight:800, color:'#dc2626', marginTop:6 }}>
                      ⚠️ At Risk
                      <div style={{ fontSize:11, fontWeight:400, color:'#dc2626', marginTop:4 }}>
                        Avg {avgMoPct}% — needs {HY_AVG_MIN}% to qualify
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize:32, fontWeight:800, color:'#6d28d9', marginTop:6 }}>
                        {fmtINRFull(hyIncentive)}
                      </div>
                      <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>
                        {hySlab?.label} · {hySlab ? (hySlab.rate*100).toFixed(0) : 0}% of {fmtINR(hyAchieved)}
                      </div>
                    </>
                  )}
                </div>

                {/* 6-month mini grid */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:5, marginBottom:12 }}>
                  {hyIndices.map(fyIdx => {
                    const m = monthsData[fyIdx]
                    if (!m) return null
                    const isCur    = fyIdx === curFyIdx
                    const isFut    = fyIdx > curFyIdx
                    const c = m.pct >= 200 ? '#10b981' : m.pct >= 150 ? '#8b5cf6'
                      : m.pct >= 100 ? '#3b82f6' : m.pct >= 85 ? '#f59e0b' : '#6b7280'
                    return (
                      <div key={fyIdx} style={{
                        background: isCur ? '#faf5ff' : '#f8fafc',
                        border:`1px solid ${isCur ? '#c4b5fd' : '#e5e7eb'}`,
                        borderRadius:6, padding:'6px 8px', textAlign:'center',
                        opacity: isFut ? 0.45 : 1,
                      }}>
                        <div style={{ fontSize:9, color:'#6b7280' }}>
                          {m.name.split(' ')[0]}{isCur ? ' 🔵' : ''}
                        </div>
                        <div style={{ fontWeight:800, fontSize:14, color: isFut ? '#94a3b8' : c }}>
                          {isFut ? '—' : `${m.pct}%`}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Avg monthly */}
                <div style={{
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  background: isVoid ? '#fef2f2' : avgMoPct >= HY_AVG_MIN ? '#f0fdf4' : '#fefce8',
                  border:`1px solid ${isVoid ? '#fecaca' : avgMoPct >= HY_AVG_MIN ? '#bbf7d0' : '#fde68a'}`,
                  borderRadius:8, padding:'8px 12px', marginBottom:10,
                }}>
                  <div>
                    <div style={{ fontSize:10, color:'#6b7280' }}>Avg Monthly</div>
                    <div style={{ fontWeight:800, fontSize:18, color: isVoid ? '#dc2626' : '#15803d' }}>
                      {avgMoPct}%
                    </div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:10, color:'#6b7280' }}>Min required</div>
                    <div style={{ fontWeight:700, fontSize:14, color:'#374151' }}>{HY_AVG_MIN}%</div>
                  </div>
                </div>

                <div style={{
                  fontSize:10, color:'#6b7280', background:'#f8fafc',
                  borderRadius:6, padding:'7px 10px', borderLeft:'3px solid #7c3aed',
                }}>
                  Payout: <strong>{hyPayoutMonth}</strong> · Avg &lt;{HY_AVG_MIN}% = Null &amp; Void
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TEAM REWARDS TAB ── */}
        {tab === 'team' && (
          <div>
            {/* Team summary chips */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:16 }}>
              {[
                { label:'Legends 👑',   val: teamLegends,   color:'#15803d', bg:'#f0fdf4', border:'#bbf7d0' },
                { label:'Achievers 🚀', val: teamAchievers, color:'#6d28d9', bg:'#faf5ff', border:'#ddd6fe' },
                { label:'Stars ⭐',     val: teamStars,     color:'#92400e', bg:'#fefce8', border:'#fde68a' },
                { label:'Total Payout', val: fmtINR(teamTotalRewards), color:'#1e293b', bg:'#f8fafc', border:'#e5e7eb' },
              ].map(item => (
                <div key={item.label} style={{
                  background:item.bg, border:`1px solid ${item.border}`,
                  borderRadius:10, padding:'10px 8px', textAlign:'center',
                }}>
                  <div style={{ fontWeight:800, fontSize:item.label==='Total Payout'?14:20, color:item.color }}>
                    {item.val}
                  </div>
                  <div style={{ fontSize:10, color:'#6b7280', marginTop:2 }}>{item.label}</div>
                </div>
              ))}
            </div>

            {/* Per-recruiter list */}
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {teamSummary.map((r, i) => {
                const pctColor = r.pct >= 200 ? '#15803d' : r.pct >= 150 ? '#6d28d9'
                  : r.pct >= 100 ? '#1d4ed8' : '#94a3b8'
                const hasReward = r.reward > 0
                return (
                  <div key={i} style={{
                    display:'flex', alignItems:'center', gap:10,
                    padding:'10px 12px', borderRadius:10,
                    background: r.tier.includes('Legend') ? '#f0fdf4'
                      : r.tier.includes('Achiever') ? '#faf5ff'
                      : r.tier.includes('Star') ? '#fefce8' : '#f8fafc',
                    border:`1px solid ${r.tier.includes('Legend') ? '#bbf7d0'
                      : r.tier.includes('Achiever') ? '#ddd6fe'
                      : r.tier.includes('Star') ? '#fde68a' : '#e5e7eb'}`,
                  }}>
                    <div style={{
                      width:28, height:28, borderRadius:'50%',
                      background: r.tier.includes('Legend') ? '#dcfce7'
                        : r.tier.includes('Achiever') ? '#ede9fe' : '#f1f5f9',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:12, fontWeight:700, color:'#374151', flexShrink:0,
                    }}>
                      {r.name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}
                    </div>

                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:'#1e293b',
                        whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {r.name}
                      </div>
                      <div style={{ fontSize:10, color:'#6b7280' }}>{r.tier}</div>
                    </div>

                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <div style={{ fontWeight:800, fontSize:15, color:pctColor }}>
                        {r.pct}%
                      </div>
                      <div style={{
                        fontSize:11, fontWeight:600,
                        color: hasReward ? '#15803d' : '#9ca3af',
                      }}>
                        {hasReward ? fmtINRFull(r.reward) : 'Nil'}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{
              marginTop:12, fontSize:10, color:'#6b7280',
              background:'#f8fafc', borderRadius:6, padding:'7px 10px',
              borderLeft:'3px solid #e5e7eb',
            }}>
              Showing current month · 1% flat reward at 150%+ achievement only
            </div>
          </div>
        )}
      </div>
    </div>
  )
}