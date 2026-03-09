// app/management/offers/page.tsx
'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase as supabaseAdmin } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

interface OfferRecord {
  id: string
  status: string
  offered_ctc: number
  fixed_ctc: number
  variable_ctc: number
  revenue_percentage: number
  offer_date: string
  expected_joining_date: string
  actual_joining_date: string
  offer_valid_until: string
  _candidateName: string
  _candidateId: string
  _currentStage: string
  _jobTitle: string
  _clientName: string
  _recruiterName: string
  _tlName: string | null
  _teamName: string
  _guaranteeEnds: string | null
  _daysRemaining: number | null
  _safetyStatus: 'critical' | 'at_risk' | 'monitoring' | 'safe' | null
  _placementStatus: string | null
}

export default function ManagementOffersPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [offers, setOffers]         = useState<OfferRecord[]>([])
  const [filtered, setFiltered]     = useState<OfferRecord[]>([])
  const [search, setSearch]         = useState('')
  const [teamFilter, setTeamFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [teams, setTeams]           = useState<string[]>([])

  // ── Auth ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) { router.push('/'); return }
    const parsedUser = JSON.parse(userData)
    if (!['ceo', 'ops_head', 'finance_head', 'system_admin'].includes(parsedUser.role)) {
      alert('Access denied. Management only.')
      router.push('/')
      return
    }
    setUser(parsedUser)
    loadOffers()
  }, [])

  // ── Filters ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let result = [...offers]
    if (statusFilter !== 'all') result = result.filter(o => o.status === statusFilter)
    if (teamFilter   !== 'all') result = result.filter(o => o._teamName === teamFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(o =>
        o._candidateName.toLowerCase().includes(q) ||
        o._recruiterName.toLowerCase().includes(q) ||
        o._clientName.toLowerCase().includes(q)    ||
        o._teamName.toLowerCase().includes(q)      ||
        o._jobTitle.toLowerCase().includes(q)
      )
    }
    setFiltered(result)
  }, [offers, search, teamFilter, statusFilter])

  // ── Team head resolver (walks reports_to chain) ────────────────────────────
  const resolveTeamHead = (
    userId: string,
    userMap: Record<string, { id: string; full_name: string; role: string; reports_to: string | null }>,
    visited = new Set<string>()
  ): { teamName: string; tlName: string | null } => {
    if (visited.has(userId)) return { teamName: '—', tlName: null }
    visited.add(userId)
    const u = userMap[userId]
    if (!u) return { teamName: '—', tlName: null }
    // This user IS the team head if they have no manager or are sr_team_leader
    if (u.role === 'sr_team_leader' || !u.reports_to) {
      return { teamName: u.full_name, tlName: null }
    }
    // Walk up one level
    const parent = userMap[u.reports_to]
    if (!parent) return { teamName: u.full_name, tlName: null }
    if (parent.role === 'sr_team_leader' || !parent.reports_to) {
      // u is the TL, parent is the team head
      return { teamName: parent.full_name, tlName: u.full_name }
    }
    // More levels — keep walking (rare but safe)
    const higher = resolveTeamHead(u.reports_to, userMap, visited)
    return { teamName: higher.teamName, tlName: u.full_name }
  }

  // ── Data loader ────────────────────────────────────────────────────────────
  const loadOffers = async () => {
    setLoading(true)
    try {
      // 1. All users (for hierarchy resolution)
      const { data: allUsers } = await supabaseAdmin
        .from('users')
        .select('id, full_name, role, reports_to')
        .in('role', ['sr_team_leader', 'team_leader', 'recruiter'])
        .eq('is_active', true)

      const userMap: Record<string, any> = {}
      ;(allUsers || []).forEach((u: any) => { userMap[u.id] = u })

      // 2. All offers with related data
      const { data: rawOffers, error } = await supabaseAdmin
        .from('offers')
        .select(`
          id, status,
          offered_ctc, fixed_ctc, variable_ctc,
          revenue_percentage,
          offer_date, expected_joining_date, actual_joining_date, offer_valid_until,
          recruiter_id,
          candidates (
            id, full_name, current_stage,
            guarantee_period_ends, placement_status,
            jobs ( job_title, clients ( company_name ) )
          )
        `)
        .order('offer_date', { ascending: false })

      if (error) throw error

      const now = Date.now()

      const mapped: OfferRecord[] = (rawOffers || []).map((o: any) => {
        const candidate = o.candidates
        const job       = candidate?.jobs
        const client    = job?.clients

        // Team resolution
        const { teamName, tlName } = o.recruiter_id
          ? resolveTeamHead(o.recruiter_id, userMap)
          : { teamName: '—', tlName: null }

        const recruiterName = userMap[o.recruiter_id]?.full_name || '—'

        // Safety status
        let safetyStatus: OfferRecord['_safetyStatus'] = null
        let daysRemaining: number | null = null
        if (o.status === 'joined' && candidate?.guarantee_period_ends) {
          daysRemaining = Math.max(0, Math.floor(
            (new Date(candidate.guarantee_period_ends).getTime() - now) / (1000 * 60 * 60 * 24)
          ))
          if (candidate.placement_status === 'safe')  safetyStatus = 'safe'
          else if (daysRemaining <= 7)  safetyStatus = 'critical'
          else if (daysRemaining <= 30) safetyStatus = 'at_risk'
          else                          safetyStatus = 'monitoring'
        }

        return {
          id:                    o.id,
          status:                o.status,
          offered_ctc:           o.offered_ctc,
          fixed_ctc:             o.fixed_ctc,
          variable_ctc:          o.variable_ctc,
          revenue_percentage:    o.revenue_percentage || 8.33,
          offer_date:            o.offer_date,
          expected_joining_date: o.expected_joining_date,
          actual_joining_date:   o.actual_joining_date,
          offer_valid_until:     o.offer_valid_until,
          _candidateName:        candidate?.full_name   || '—',
          _candidateId:          candidate?.id          || '',
          _currentStage:         candidate?.current_stage || '—',
          _jobTitle:             job?.job_title          || '—',
          _clientName:           client?.company_name   || '—',
          _recruiterName:        recruiterName,
          _tlName:               tlName,
          _teamName:             teamName,
          _guaranteeEnds:        candidate?.guarantee_period_ends || null,
          _daysRemaining:        daysRemaining,
          _safetyStatus:         safetyStatus,
          _placementStatus:      candidate?.placement_status || null,
        }
      })

      setOffers(mapped)

      // Unique team names for filter dropdown
      const uniqueTeams = [...new Set(mapped.map(o => o._teamName).filter(t => t !== '—'))].sort()
      setTeams(uniqueTeams)

    } catch (err) {
      console.error('Error loading offers:', err)
    } finally {
      setLoading(false)
    }
  }

  // ── KPI helpers ────────────────────────────────────────────────────────────
  const kpis = {
    all:      offers.length,
    extended: offers.filter(o => o.status === 'extended').length,
    accepted: offers.filter(o => o.status === 'accepted').length,
    joined:   offers.filter(o => o.status === 'joined').length,
    renege:   offers.filter(o => o.status === 'renege').length,
    rejected: offers.filter(o => o.status === 'rejected').length,
  }

  const joinedOffers = offers.filter(o => o.status === 'joined')
  const safetyKpis = {
    critical:   joinedOffers.filter(o => o._safetyStatus === 'critical').length,
    at_risk:    joinedOffers.filter(o => o._safetyStatus === 'at_risk').length,
    monitoring: joinedOffers.filter(o => o._safetyStatus === 'monitoring').length,
    safe:       joinedOffers.filter(o => o._safetyStatus === 'safe').length,
  }

  const feePercent = (o: OfferRecord) => o.revenue_percentage || 8.33
  const calcRevenue = (o: OfferRecord) => ((o.fixed_ctc || 0) * feePercent(o)) / 100

  const totalRevenue = joinedOffers.reduce((sum, o) => sum + calcRevenue(o), 0)
  const criticalRev  = joinedOffers.filter(o => o._safetyStatus === 'critical').reduce((sum, o) => sum + calcRevenue(o), 0)
  const atRiskRev    = joinedOffers.filter(o => o._safetyStatus === 'at_risk').reduce((sum, o) => sum + calcRevenue(o), 0)
  const provisionalRev = joinedOffers.filter(o => o._safetyStatus === 'monitoring').reduce((sum, o) => sum + calcRevenue(o), 0)
  const confirmedRev   = joinedOffers.filter(o => o._safetyStatus === 'safe').reduce((sum, o) => sum + calcRevenue(o), 0)

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      extended: 'bg-blue-100 text-blue-800',
      accepted: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      expired:  'bg-gray-100 text-gray-800',
      joined:   'bg-purple-100 text-purple-800',
      renege:   'bg-orange-100 text-orange-800',
    }
    return map[status] || 'bg-gray-100 text-gray-800'
  }

  const getSafetyBadge = (o: OfferRecord) => {
    if (!o._safetyStatus) return null
    const map: Record<string, string> = {
      critical:   'bg-red-100 text-red-700 border border-red-300',
      at_risk:    'bg-yellow-100 text-yellow-700 border border-yellow-300',
      monitoring: 'bg-blue-100 text-blue-700 border border-blue-300',
      safe:       'bg-green-100 text-green-700 border border-green-300',
    }
    const icons: Record<string, string> = {
      critical: '🚨', at_risk: '⚠️', monitoring: '🟢', safe: '✅',
    }
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${map[o._safetyStatus]}`}>
        {icons[o._safetyStatus]} {o._daysRemaining !== null ? `${o._daysRemaining}d left` : o._safetyStatus}
      </span>
    )
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6 pb-8">

        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-700 rounded-lg p-6 text-white flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-1">📋 Company-Wide Offers & Placements</h1>
            <p className="text-blue-200">Full organisation view · All teams · Safety monitoring</p>
          </div>
          <div className="bg-white/20 rounded-lg px-4 py-2 text-center">
            <div className="text-2xl font-bold">{kpis.all}</div>
            <div className="text-xs text-blue-200">Total Offers</div>
          </div>
        </div>

        {/* ── Status KPIs ── */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { label: 'All Offers', count: kpis.all,      color: 'text-gray-900',    active: statusFilter === 'all',      key: 'all'      },
            { label: 'Extended',   count: kpis.extended,  color: 'text-blue-600',    active: statusFilter === 'extended',  key: 'extended' },
            { label: 'Accepted',   count: kpis.accepted,  color: 'text-green-600',   active: statusFilter === 'accepted',  key: 'accepted' },
            { label: 'Joined',     count: kpis.joined,    color: 'text-purple-600',  active: statusFilter === 'joined',    key: 'joined'   },
            { label: 'Renege',     count: kpis.renege,    color: 'text-orange-600',  active: statusFilter === 'renege',    key: 'renege'   },
            { label: 'Rejected',   count: kpis.rejected,  color: 'text-red-600',     active: statusFilter === 'rejected',  key: 'rejected' },
          ].map(({ label, count, color, active, key }) => (
            <button key={key} onClick={() => setStatusFilter(key)}
              className={`bg-white rounded-lg p-4 shadow text-center transition hover:shadow-md border-2 ${active ? 'border-blue-500' : 'border-transparent'}`}>
              <div className="text-xs text-gray-500 mb-1">{label}</div>
              <div className={`text-2xl font-bold ${color}`}>{count}</div>
            </button>
          ))}
        </div>

        {/* ── Safety Monitor ── */}
        {joinedOffers.length > 0 && (
          <div className="bg-gray-700 rounded-lg p-5 text-white">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">🛡️</span>
              <div>
                <h2 className="text-lg font-bold">Organisation Placement Safety Monitor</h2>
                <p className="text-gray-300 text-sm">{joinedOffers.length} active placements · ₹{totalRevenue.toFixed(2)} total revenue</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-white rounded-lg p-4">
                <div className="text-xs text-gray-900 uppercase mb-1">Total Revenue</div>
                <div className="text-xl font-bold text-gray-500">₹{totalRevenue.toFixed(2)}</div>
                <div className="text-xs text-gray-900">{joinedOffers.length} placements</div>
              </div>
              {[
                { label: 'Critical ≤7d',  count: safetyKpis.critical,   rev: criticalRev,   textColor: 'text-red-400',    subColor: 'text-red-500',    dot: '🔴' },
                { label: 'At Risk ≤30d',  count: safetyKpis.at_risk,    rev: atRiskRev,     textColor: 'text-yellow-400', subColor: 'text-yellow-500', dot: '🟡' },
                { label: 'Monitoring',    count: safetyKpis.monitoring,  rev: provisionalRev, textColor: 'text-blue-400',  subColor: 'text-blue-500',   dot: '🟢' },
                { label: 'Safe',          count: safetyKpis.safe,        rev: confirmedRev,  textColor: 'text-green-400',  subColor: 'text-green-500',  dot: '✅' },
              ].map(({ label, count, rev, textColor, subColor, dot }) => (
                <div key={label} className="bg-white rounded-lg p-4">
                  <div className="text-xs text-gray-900 uppercase mb-1">{dot} {label}</div>
                  <div className={`text-xl font-bold ${textColor}`}>{count}</div>
                  <div className={`text-xs ${subColor}`}>₹{rev.toFixed(2)} {count > 0 ? (label === 'Safe' ? 'confirmed' : 'at risk') : ''}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm border-t border-gray-700 pt-4">
              <span className="text-gray-100">Provisional: <span className="text-white font-semibold">₹{provisionalRev.toFixed(2)}</span></span>
              <span className="text-gray-100">Confirmed: <span className="text-green-400 font-semibold">₹{confirmedRev.toFixed(2)}</span></span>
              <span className="text-gray-100">Success Rate: <span className="text-white font-semibold">{joinedOffers.length > 0 ? Math.round((safetyKpis.safe / joinedOffers.length) * 100) : 0}%</span></span>
              <span className="text-gray-100">At Risk: <span className="text-red-400 font-semibold">₹{(criticalRev + atRiskRev).toFixed(2)}</span></span>
            </div>
          </div>
        )}

        {/* ── Filters ── */}
        <div className="bg-white rounded-lg shadow p-4 flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Search candidate, recruiter, client, team, job..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-64 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={teamFilter}
            onChange={e => setTeamFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Teams ({teams.length})</option>
            {teams.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="text-sm text-gray-500 ml-auto">Showing {filtered.length} of {offers.length}</span>
        </div>

        {/* ── Offer Cards ── */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-gray-500 font-medium">No offers found</p>
            <button onClick={() => { setSearch(''); setTeamFilter('all'); setStatusFilter('all') }}
              className="mt-3 text-blue-600 text-sm hover:underline">Clear all filters</button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(offer => {
              const revenue = calcRevenue(offer)
              return (
                <div key={offer.id}
                  onClick={() => router.push(`/management/offers/${offer.id}`)}
                  className="bg-white rounded-lg shadow hover:shadow-md transition cursor-pointer border border-gray-100 hover:border-blue-200">
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      {/* Left: candidate + meta */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-bold text-gray-900 text-lg">{offer._candidateName}</h3>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getStatusBadge(offer.status)}`}>
                            {offer.status.toUpperCase()}
                          </span>
                          {offer._safetyStatus && getSafetyBadge(offer)}
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">
                            👥 {offer._teamName}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-600 flex-wrap">
                          <span>💼 {offer._jobTitle}</span>
                          <span>🏢 {offer._clientName}</span>
                          <span>👤 {offer._recruiterName}</span>
                          {offer._tlName && <span>• TL: {offer._tlName}</span>}
                        </div>
                      </div>

                      {/* Right: financials */}
                      <div className="text-right flex-shrink-0">
                        <div className="text-lg font-bold text-gray-900">₹{(offer.offered_ctc || 0).toLocaleString('en-IN')}</div>
                        <div className="text-sm text-blue-600 font-semibold">Fixed: ₹{(offer.fixed_ctc || 0).toLocaleString('en-IN')}</div>
                        <div className="text-sm text-green-600 font-semibold">Rev ({feePercent(offer)}%): ₹{revenue.toFixed(2)}</div>
                      </div>
                    </div>

                    {/* Bottom row: dates */}
                    <div className="flex items-center gap-6 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500 flex-wrap">
                      {offer.offer_date && (
                        <span>📅 Offer: <strong>{new Date(offer.offer_date).toLocaleDateString()}</strong></span>
                      )}
                      {offer.expected_joining_date && (
                        <span>🗓️ Expected Join: <strong className="text-blue-600">{new Date(offer.expected_joining_date).toLocaleDateString()}</strong></span>
                      )}
                      {offer.actual_joining_date && (
                        <span>✅ Joined: <strong className="text-green-600">{new Date(offer.actual_joining_date).toLocaleDateString()}</strong></span>
                      )}
                      {offer._guaranteeEnds && offer.status === 'joined' && (
                        <span>🛡️ Safe After: <strong className={offer._safetyStatus === 'critical' ? 'text-red-600' : offer._safetyStatus === 'safe' ? 'text-green-600' : 'text-gray-700'}>{new Date(offer._guaranteeEnds).toLocaleDateString()}</strong></span>
                      )}
                      <span className="ml-auto text-gray-400">→</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </div>
    </DashboardLayout>
  )
}
