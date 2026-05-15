'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// ── Policy constants (must match incentives page) ─────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────────
const FY_CAL_MONTHS = [3,4,5,6,7,8,9,10,11,0,1,2]
const MONTH_NAMES   = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']

function fmtINR(n: number) {
  if (n >= 100000) return `₹${(n/100000).toFixed(1)}L`
  if (n >= 1000)   return `₹${(n/1000).toFixed(1)}K`
  return `₹${Math.round(n)}`
}
function fmtINRFull(n: number) {
  return new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 }).format(n)
}
function getHYSlab(pct: number) {
  return HALF_YEARLY_SLABS.find(s => pct >= s.min && pct <= s.max) ?? HALF_YEARLY_SLABS[0]
}
function calcMonthlyReward(achieved: number, pct: number) {
  if (pct < MONTHLY_MIN_PCT || pct < MONTHLY_BONUS_THRESHOLD) return 0
  return Math.round(achieved * MONTHLY_RATE)
}
function calcHYIncentive(achieved: number, pct: number) {
  const slab = getHYSlab(pct)
  return Math.round(achieved * slab.rate)
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface RenegeCand {
  id: string
  full_name: string
  revenue_earned: number
  renege_date: string
  renege_reason: string
}

interface MonthData {
  fyIdx: number
  name: string
  target: number
  achieved: number
  pct: number
  reward: number
  renegeDeduction: number
  netReward: number
}

interface RewardsPanelProps {
  userId: string
  monthlyTarget: number
  monthlyRevenue: number
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function RewardsPanel({ userId, monthlyTarget, monthlyRevenue }: RewardsPanelProps) {
  const [tab, setTab]               = useState<'monthly'|'halfyearly'>('monthly')
  const [viewFyIdx, setViewFyIdx]   = useState<number>(-1)
  const [monthsData, setMonthsData] = useState<MonthData[]>([])
  const [reneges, setReneges]       = useState<RenegeCand[]>([])
  const [loading, setLoading]       = useState(true)
  const [annualTarget, setAnnualTarget] = useState(0)

  const now      = new Date()
  const fyStart  = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  const curFyIdx = FY_CAL_MONTHS.indexOf(now.getMonth())
  const half: 'H1'|'H2' = curFyIdx <= 5 ? 'H1' : 'H2'
  const hyIndices = half === 'H1' ? [0,1,2,3,4,5] : [6,7,8,9,10,11]

  // ── Load full FY revenue from offers table ─────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)

    // 1. Fetch user targets
    const { data: userData } = await supabase
      .from('users')
      .select('monthly_target, annual_target')
      .eq('id', userId)
      .single()

    const mTarget = userData?.monthly_target ?? monthlyTarget ?? 0
    const aTarget = userData?.annual_target  ?? mTarget * 12
    setAnnualTarget(aTarget)

    // 2. Fetch candidates joined this FY — join offers for live revenue calc
    const { data: candidates } = await supabase
      .from('candidates')
      .select(`
        id, full_name, date_joined, is_renege, renege_date, renege_reason,
        offers ( fixed_ctc, revenue_percentage )
      `)
      .eq('assigned_to', userId)
      .in('current_stage', ['joined', 'renege'])
      .not('date_joined', 'is', null)
      .gte('date_joined', `${fyStart}-04-01`)
      .lte('date_joined', `${fyStart + 1}-03-31`)

    // 3. Build per-month revenue and renege maps
    const revMap:    Record<number, number> = {}
    const deductMap: Record<number, number> = {}
    const renegeList: RenegeCand[]          = []

    for (const c of (candidates ?? [])) {
      if (!c.date_joined) continue
      const calMonth = new Date(c.date_joined).getMonth()
      const fyIdx    = FY_CAL_MONTHS.indexOf(calMonth)
      if (fyIdx === -1) continue

      // ── Live revenue from offers table ──────────────────────────────────
      const offer = Array.isArray(c.offers) ? c.offers[0] : c.offers
      const rev   = offer
        ? ((parseFloat(offer.fixed_ctc) || 0) * (parseFloat(offer.revenue_percentage) || 8.33)) / 100
        : 0

      if (c.is_renege && c.renege_date) {
        const rCalMonth = new Date(c.renege_date).getMonth()
        const rFyIdx    = FY_CAL_MONTHS.indexOf(rCalMonth)
        const sameMonth = rCalMonth === calMonth &&
          new Date(c.renege_date).getFullYear() === new Date(c.date_joined).getFullYear()

        if (sameMonth) {
          // Renege in same month → no credit at all
          revMap[fyIdx] = (revMap[fyIdx] ?? 0) + 0
        } else {
          // Credit in joining month, deduct in renege month
          revMap[fyIdx]     = (revMap[fyIdx]     ?? 0) + rev
          deductMap[rFyIdx] = (deductMap[rFyIdx] ?? 0) + rev
          renegeList.push({
            id:             c.id,
            full_name:      c.full_name,
            revenue_earned: rev,
            renege_date:    c.renege_date,
            renege_reason:  c.renege_reason ?? '',
          })
        }
      } else {
        revMap[fyIdx] = (revMap[fyIdx] ?? 0) + rev
      }
    }

    setReneges(renegeList)

    // 4. Build month entries
    const months: MonthData[] = FY_CAL_MONTHS.map((_, fyIdx) => {
      const calYear     = FY_CAL_MONTHS[fyIdx] >= 3 ? fyStart : fyStart + 1
      const achieved    = revMap[fyIdx]    ?? 0
      const deduction   = deductMap[fyIdx] ?? 0
      const netAchieved = Math.max(0, achieved - deduction)
      const pct         = mTarget > 0 ? Math.round((netAchieved / mTarget) * 100) : 0
      const reward      = calcMonthlyReward(netAchieved, pct)
      return {
        fyIdx,
        name:            `${MONTH_NAMES[fyIdx]} ${calYear}`,
        target:          mTarget,
        achieved:        netAchieved,
        pct,
        reward,
        renegeDeduction: deduction,
        netReward:       reward,
      }
    })

    setMonthsData(months)
    setViewFyIdx(prev => prev === -1 ? curFyIdx : prev)
    setLoading(false)
  }, [userId, fyStart, monthlyTarget])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="card bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-200 flex items-center justify-center" style={{ minHeight: 400 }}>
      <div style={{ textAlign:'center', color:'#7c3aed', fontSize:14 }}>Loading rewards...</div>
    </div>
  )

  // ── Derived ────────────────────────────────────────────────────────────────
  const activeFyIdx    = viewFyIdx === -1 ? curFyIdx : viewFyIdx
  const isFutureMonth  = activeFyIdx > curFyIdx
  const isCurrentMonth = activeFyIdx === curFyIdx
  const curMonth       = monthsData[activeFyIdx]
  const curPct         = curMonth?.pct ?? 0
  const curReward      = curMonth?.netReward ?? 0
  const curRenege      = curMonth?.renegeDeduction ?? 0
  const needFor150     = curMonth ? Math.max(0, curMonth.target * 1.5 - curMonth.achieved) : 0
  const needFor200     = curMonth ? Math.max(0, curMonth.target * 2   - curMonth.achieved) : 0

  const tier = curPct >= 200 ? { emoji:'👑', label:'Legend',   color:'#15803d', bg:'#f0fdf4', border:'#bbf7d0' }
             : curPct >= 150 ? { emoji:'🚀', label:'Achiever', color:'#6d28d9', bg:'#faf5ff', border:'#ddd6fe' }
             : curPct >= 100 ? { emoji:'⭐', label:'Star',     color:'#92400e', bg:'#fefce8', border:'#fde68a' }
             : null

  // Half-yearly
  const hyMonths      = hyIndices.map(i => monthsData[i]).filter(Boolean)
  const hyAchieved    = hyMonths.reduce((s, m) => s + m.achieved, 0)
  const hyTarget      = hyMonths.reduce((s, m) => s + m.target,   0)
  const hyPct         = hyTarget > 0 ? Math.round((hyAchieved / hyTarget) * 100) : 0
  const avgMonthlyPct = hyMonths.length > 0
    ? Math.round(hyMonths.reduce((s, m) => s + m.pct, 0) / hyMonths.length) : 0
  const isVoid        = avgMonthlyPct < HY_AVG_MIN
  const hySlab        = isVoid ? null : getHYSlab(hyPct)
  const hyIncentive   = isVoid ? 0    : calcHYIncentive(hyAchieved, hyPct)
  const hyPayoutMonth = half === 'H1' ? 'December 2026' : 'July 2027'
  const remainingInHalf = hyIndices.filter(i => i > curFyIdx).length

  return (
    <div className="card" style={{
      background:'linear-gradient(135deg, #faf5ff 0%, #eff6ff 100%)',
      border:'2px solid #ddd6fe',
      padding: 0,
      overflow:'hidden',
    }}>
      {/* Header */}
      <div style={{
        background:'linear-gradient(135deg, #7c3aed, #4f46e5)',
        padding:'16px 20px',
        display:'flex', alignItems:'center', justifyContent:'space-between',
      }}>
        <div>
          <div style={{ color:'#fff', fontWeight:800, fontSize:16 }}>💰 My Rewards</div>
          <div style={{ color:'rgba(255,255,255,0.7)', fontSize:12, marginTop:2 }}>
            {tab === 'monthly' ? (curMonth?.name ?? MONTH_NAMES[activeFyIdx]) : `${half} · ${half === 'H1' ? 'Apr–Sep' : 'Oct–Mar'}`} · FY {fyStart}-{String(fyStart+1).slice(2)}
          </div>
        </div>
        {tier && (
          <div style={{
            background: tier.bg, color: tier.color,
            border:`1px solid ${tier.border}`,
            padding:'4px 14px', borderRadius:100,
            fontWeight:700, fontSize:13,
          }}>
            {tier.emoji} {tier.label}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:'1px solid #e5e7eb', background:'#fff' }}>
        {(['monthly','halfyearly'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex:1, padding:'10px', border:'none', background:'transparent',
            cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:'inherit',
            color: tab===t ? '#7c3aed' : '#6b7280',
            borderBottom: tab===t ? '2px solid #7c3aed' : '2px solid transparent',
            marginBottom:-1, transition:'all 0.15s',
          }}>
            {t === 'monthly' ? '📅 This Month' : '📊 Half-Yearly'}
          </button>
        ))}
      </div>

      <div style={{ padding:'16px 20px' }}>

        {/* ── MONTHLY TAB ── */}
        {tab === 'monthly' && (
          <div>
            {/* Month navigator */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, gap:8 }}>
              <button
                onClick={() => setViewFyIdx(i => Math.max(0, i - 1))}
                disabled={activeFyIdx <= 0}
                style={{
                  width:32, height:32, borderRadius:'50%', border:'1px solid #e5e7eb',
                  background: activeFyIdx <= 0 ? '#f9fafb' : '#fff',
                  cursor: activeFyIdx <= 0 ? 'not-allowed' : 'pointer',
                  fontSize:18, color: activeFyIdx <= 0 ? '#d1d5db' : '#374151',
                  display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                }}>&#8249;</button>

              <div style={{ textAlign:'center', flex:1 }}>
                <div style={{ fontWeight:700, fontSize:15, color:'#1e293b' }}>
                  {curMonth?.name ?? '—'}
                  {isCurrentMonth && (
                    <span style={{ fontSize:10, color:'#7c3aed', fontWeight:600, marginLeft:6,
                      background:'#ede9fe', padding:'1px 7px', borderRadius:100 }}>Current</span>
                  )}
                  {isFutureMonth && (
                    <span style={{ fontSize:10, color:'#94a3b8', fontWeight:600, marginLeft:6,
                      background:'#f1f5f9', padding:'1px 7px', borderRadius:100 }}>Upcoming</span>
                  )}
                  {!isCurrentMonth && (
                    <button onClick={() => setViewFyIdx(curFyIdx)} style={{
                      fontSize:9, color:'#7c3aed', marginLeft:6, background:'none',
                      border:'none', cursor:'pointer', textDecoration:'underline', padding:0,
                    }}>back to current</button>
                  )}
                </div>
                <div style={{ fontSize:10, color:'#94a3b8', marginTop:1 }}>
                  {activeFyIdx + 1} of 12 · FY {fyStart}-{String(fyStart+1).slice(2)}
                </div>
              </div>

              <button
                onClick={() => setViewFyIdx(i => Math.min(11, i + 1))}
                disabled={activeFyIdx >= 11}
                style={{
                  width:32, height:32, borderRadius:'50%', border:'1px solid #e5e7eb',
                  background: activeFyIdx >= 11 ? '#f9fafb' : '#fff',
                  cursor: activeFyIdx >= 11 ? 'not-allowed' : 'pointer',
                  fontSize:18, color: activeFyIdx >= 11 ? '#d1d5db' : '#374151',
                  display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                }}>&#8250;</button>
            </div>

            {/* Big reward number */}
            <div style={{ textAlign:'center', marginBottom:16 }}>
              <div style={{ fontSize:11, color:'#6b7280', letterSpacing:'1px', textTransform:'uppercase' }}>
                {isFutureMonth ? 'Projected Reward' : 'Monthly Reward Earned'}
              </div>
              <div style={{
                fontSize: curReward > 0 ? 42 : 32,
                fontWeight:800, lineHeight:1.1, marginTop:4,
                color: curReward > 0 ? '#15803d' : isFutureMonth ? '#c4b5fd' : '#94a3b8',
              }}>
                {isFutureMonth ? '— Upcoming —' : curReward > 0 ? fmtINRFull(curReward) : 'Not yet earned'}
              </div>
              {curReward > 0 && (
                <div style={{ fontSize:12, color:'#6b7280', marginTop:2 }}>
                  1% of {fmtINRFull(curMonth?.achieved ?? 0)} revenue
                </div>
              )}
            </div>

            {/* Achievement meter */}
            <div style={{ marginBottom:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#6b7280', marginBottom:6 }}>
                <span>Achievement</span>
                <span style={{
                  fontWeight:800,
                  color: curPct >= 150 ? '#6d28d9' : curPct >= 100 ? '#1d4ed8' : curPct >= 50 ? '#b45309' : '#dc2626',
                }}>{curPct}%</span>
              </div>
              <div style={{ position:'relative', height:12, background:'#f1f5f9', borderRadius:100, overflow:'visible' }}>
                <div style={{
                  height:'100%', borderRadius:100,
                  width:`${Math.min(100, curPct)}%`,
                  background: curPct >= 200 ? 'linear-gradient(90deg,#059669,#10b981)'
                    : curPct >= 150 ? 'linear-gradient(90deg,#7c3aed,#8b5cf6)'
                    : curPct >= 100 ? 'linear-gradient(90deg,#2563eb,#3b82f6)'
                    : 'linear-gradient(90deg,#f59e0b,#fbbf24)',
                  transition:'width 0.6s ease',
                }} />
                {[{pct:50,label:'50%'},{pct:100,label:'⭐'},{pct:150,label:'🚀'},{pct:200,label:'👑'}].map(m => (
                  <div key={m.pct} style={{
                    position:'absolute', top:-18, left:`${Math.min(m.pct,100)}%`,
                    transform:'translateX(-50%)', fontSize:10, color:'#94a3b8', whiteSpace:'nowrap',
                  }}>{m.label}</div>
                ))}
              </div>
              <div style={{ marginTop:20 }} />
            </div>

            {/* Policy cards */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
              <div style={{
                background: curPct >= MONTHLY_BONUS_THRESHOLD ? '#f0fdf4' : '#fef2f2',
                border:`1px solid ${curPct >= MONTHLY_BONUS_THRESHOLD ? '#bbf7d0' : '#fecaca'}`,
                borderRadius:10, padding:'10px 12px',
              }}>
                <div style={{ fontSize:10, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.5px' }}>
                  Policy Threshold
                </div>
                <div style={{ fontWeight:700, fontSize:14, color: curPct >= 150 ? '#15803d' : '#dc2626', marginTop:2 }}>
                  {curPct >= MONTHLY_BONUS_THRESHOLD ? '✓ Crossed 150%' : `Need ${MONTHLY_BONUS_THRESHOLD - curPct}% more`}
                </div>
                <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>Reward unlocks at 150%</div>
              </div>
              <div style={{
                background:'#f8fafc', border:'1px solid #e5e7eb',
                borderRadius:10, padding:'10px 12px',
              }}>
                <div style={{ fontSize:10, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.5px' }}>
                  To reach 200% 👑
                </div>
                <div style={{ fontWeight:700, fontSize:14, color:'#1e293b', marginTop:2 }}>
                  {needFor200 > 0 ? `${fmtINR(needFor200)} more` : '🎉 Achieved!'}
                </div>
                <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>
                  {needFor150 > 0 ? `${fmtINR(needFor150)} to 🚀 Achiever` : '✓ Achiever unlocked'}
                </div>
              </div>
            </div>

            {/* Renege alert */}
            {curRenege > 0 && (
              <div style={{
                background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10,
                padding:'10px 14px', marginBottom:16,
                display:'flex', alignItems:'flex-start', gap:10,
              }}>
                <span style={{ fontSize:18, flexShrink:0 }}>⚠️</span>
                <div>
                  <div style={{ fontWeight:700, fontSize:13, color:'#dc2626' }}>
                    Renege Deduction This Month
                  </div>
                  <div style={{ fontSize:12, color:'#7f1d1d', marginTop:2 }}>
                    {fmtINRFull(curRenege)} deducted from your earnings this month due to candidate renege.
                    This amount will be adjusted against your salary.
                  </div>
                </div>
              </div>
            )}

            {/* All reneges this FY */}
            {reneges.length > 0 && (
              <details style={{ marginBottom:12 }}>
                <summary style={{
                  cursor:'pointer', fontSize:12, fontWeight:600, color:'#dc2626',
                  padding:'8px 12px', background:'#fef2f2', borderRadius:8,
                  border:'1px solid #fecaca', listStyle:'none',
                }}>
                  ⚠️ {reneges.length} renege(s) this FY — impact on rewards
                </summary>
                <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:6 }}>
                  {reneges.map(r => (
                    <div key={r.id} style={{
                      background:'#fff', border:'1px solid #fecaca',
                      borderRadius:8, padding:'8px 12px', fontSize:12,
                    }}>
                      <div style={{ fontWeight:600, color:'#7f1d1d' }}>{r.full_name}</div>
                      <div style={{ color:'#6b7280', marginTop:2 }}>
                        Renege date: {new Date(r.renege_date).toLocaleDateString('en-IN')} ·
                        Revenue reversed: <strong>{fmtINRFull(r.revenue_earned)}</strong>
                      </div>
                      {r.renege_reason && (
                        <div style={{ color:'#9ca3af', fontStyle:'italic', marginTop:1 }}>
                          Reason: {r.renege_reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Policy note */}
            <div style={{
              background:'#f8fafc', borderRadius:8, padding:'10px 12px',
              fontSize:11, color:'#6b7280', borderLeft:'3px solid #e5e7eb',
            }}>
              <strong>Policy:</strong> 1% flat reward at 150%+ · Below 50% = Nil ·
              Reneges reversed against next month salary · Paid in current month
            </div>
          </div>
        )}

        {/* ── HALF-YEARLY TAB ── */}
        {tab === 'halfyearly' && (
          <div>
            <div style={{ textAlign:'center', marginBottom:16 }}>
              <div style={{ fontSize:11, color:'#6b7280', letterSpacing:'1px', textTransform:'uppercase' }}>
                {half} Incentive ({half === 'H1' ? 'Apr–Sep' : 'Oct–Mar'})
              </div>
              {isVoid ? (
                <div style={{ marginTop:8 }}>
                  <div style={{ fontSize:26, fontWeight:800, color:'#dc2626' }}>⚠️ At Risk</div>
                  <div style={{ fontSize:12, color:'#dc2626', marginTop:4 }}>
                    Avg monthly {avgMonthlyPct}% — below 60% minimum
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize:38, fontWeight:800, color:'#6d28d9', lineHeight:1.1, marginTop:4 }}>
                    {fmtINRFull(hyIncentive)}
                  </div>
                  <div style={{ fontSize:12, color:'#6b7280', marginTop:2 }}>
                    {hySlab?.label} · {hySlab ? (hySlab.rate*100).toFixed(0) : 0}% of {fmtINRFull(hyAchieved)}
                  </div>
                </>
              )}
            </div>

            {/* Slab indicator */}
            <div style={{ marginBottom:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:6 }}>
                <span style={{ color:'#6b7280' }}>Overall {half} Achievement</span>
                <span style={{ fontWeight:800, color: hySlab?.color ?? '#6b7280' }}>{hyPct}%</span>
              </div>
              <div style={{ display:'flex', gap:3 }}>
                {HALF_YEARLY_SLABS.filter(s => s.rate > 0).map(s => (
                  <div key={s.label} style={{
                    flex:1, height:8, borderRadius:4,
                    background: hyPct >= s.min ? s.color : '#e5e7eb',
                    transition:'background 0.3s',
                  }} />
                ))}
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#94a3b8', marginTop:4 }}>
                <span>85%</span><span>100%</span><span>150%</span><span>200%</span>
              </div>
            </div>

            {/* 6-month mini grid */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6, marginBottom:14 }}>
              {hyIndices.map(fyIdx => {
                const m = monthsData[fyIdx]
                if (!m) return null
                const isCurrent = fyIdx === curFyIdx
                const isFuture  = fyIdx > curFyIdx
                const c = m.pct >= 200 ? '#10b981' : m.pct >= 150 ? '#8b5cf6'
                  : m.pct >= 100 ? '#3b82f6' : m.pct >= 85 ? '#f59e0b' : '#6b7280'
                return (
                  <div key={fyIdx} style={{
                    background: isCurrent ? '#faf5ff' : isFuture ? '#f8fafc' : '#fff',
                    border:`1px solid ${isCurrent ? '#c4b5fd' : '#e5e7eb'}`,
                    borderRadius:8, padding:'8px 10px', textAlign:'center',
                    opacity: isFuture ? 0.5 : 1,
                  }}>
                    <div style={{ fontSize:10, color:'#6b7280' }}>
                      {m.name.split(' ')[0]}{isCurrent ? ' 🔵' : ''}
                    </div>
                    <div style={{ fontWeight:800, fontSize:16, color: isFuture ? '#94a3b8' : c }}>
                      {isFuture ? '—' : `${m.pct}%`}
                    </div>
                    {m.renegeDeduction > 0 && (
                      <div style={{ fontSize:9, color:'#dc2626' }}>-{fmtINR(m.renegeDeduction)}</div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Avg monthly & void warning */}
            <div style={{
              background: isVoid ? '#fef2f2' : avgMonthlyPct >= HY_AVG_MIN ? '#f0fdf4' : '#fefce8',
              border:`1px solid ${isVoid ? '#fecaca' : avgMonthlyPct >= HY_AVG_MIN ? '#bbf7d0' : '#fde68a'}`,
              borderRadius:10, padding:'10px 14px', marginBottom:14,
              display:'flex', justifyContent:'space-between', alignItems:'center',
            }}>
              <div>
                <div style={{ fontSize:11, color:'#6b7280' }}>Avg Monthly Achievement</div>
                <div style={{ fontWeight:800, fontSize:20, color: isVoid ? '#dc2626' : '#15803d' }}>
                  {avgMonthlyPct}%
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:11, color:'#6b7280' }}>Min required</div>
                <div style={{ fontWeight:700, fontSize:14, color:'#374151' }}>{HY_AVG_MIN}%</div>
              </div>
            </div>

            {/* Renege impact on HY */}
            {reneges.length > 0 && (
              <div style={{
                background:'#fef2f2', border:'1px solid #fecaca',
                borderRadius:8, padding:'10px 14px', marginBottom:12, fontSize:12,
              }}>
                <div style={{ fontWeight:700, color:'#dc2626', marginBottom:4 }}>
                  ⚠️ Renege Impact on {half} Incentive
                </div>
                <div style={{ color:'#7f1d1d' }}>
                  {reneges.length} renege(s) have reduced your achieved revenue.
                  Total impact: <strong>{fmtINRFull(reneges.reduce((s,r) => s + r.revenue_earned, 0))}</strong> deducted from {half} calculation.
                  Salary reversal adjusted in the month of renege.
                </div>
              </div>
            )}

            {/* Payout info */}
            <div style={{
              background:'#f8fafc', borderRadius:8, padding:'10px 12px',
              fontSize:11, color:'#6b7280', borderLeft:'3px solid #7c3aed',
            }}>
              <strong>Payout:</strong> {hyPayoutMonth} · Based on client payouts received ·
              Avg &lt;60% = Null &amp; Void · {remainingInHalf} month(s) left in {half}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}