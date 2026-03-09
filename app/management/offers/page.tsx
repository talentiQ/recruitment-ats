// app/management/offers/page.tsx
'use client'
export const dynamic = 'force-dynamic'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function ManagementOffersPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [offers, setOffers] = useState<any[]>([])
  const [filter, setFilter] = useState('all')
  const [teamFilter, setTeamFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [user, setUser] = useState<any>(null)
  const [teams, setTeams] = useState<any[]>([])

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) { router.push('/'); return }
    const parsedUser = JSON.parse(userData)
    if (!['ceo', 'ops_head', 'finance_head', 'system_admin'].includes(parsedUser.role)) {
      router.push('/'); return
    }
    setUser(parsedUser)
    loadOffers()
  }, [filter, teamFilter])

  const loadOffers = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('offers')
        .select(`
          *,
          candidates (
            id,
            full_name,
            phone,
            email,
            revenue_earned,
            date_joined,
            guarantee_period_ends,
            is_placement_safe,
            placement_status,
            team_id,
            jobs (
              job_title,
              job_code,
              clients (
                company_name,
                replacement_guarantee_days
              )
            )
          ),
          recruiter:recruiter_id (
            id,
            full_name,
            team_id,
            reports_to
          )
        `)
        .order('created_at', { ascending: false })

      if (filter !== 'all') query = query.eq('status', filter)

      const { data, error } = await query
      if (error) throw error

      // Enrich with team names & safety status
      const { data: srTLs } = await supabase
        .from('users')
        .select('id, full_name, team_id')
        .eq('role', 'sr_team_leader')
        .eq('is_active', true)

      const { data: tls } = await supabase
        .from('users')
        .select('id, full_name, reports_to')
        .eq('role', 'team_leader')
        .eq('is_active', true)

      // Build team map: recruiter_id → sr_tl name
      const tlToSrTL: Record<string, string> = {}
      tls?.forEach(tl => {
        const srTL = srTLs?.find(s => s.id === tl.reports_to)
        if (srTL) tlToSrTL[tl.id] = srTL.full_name
      })

      // Build unique team list for filter
      const teamSet = new Set<string>()
      srTLs?.forEach(s => teamSet.add(s.full_name))
      setTeams(srTLs || [])

      const enhanced = (data || []).map(offer => {
        let daysRemaining = null
        let safetyStatus = null

        if (offer.status === 'joined' && offer.candidates?.guarantee_period_ends) {
          daysRemaining = Math.max(0, Math.floor(
            (new Date(offer.candidates.guarantee_period_ends).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
          ))
          if (offer.candidates.placement_status === 'safe') safetyStatus = 'safe'
          else if (daysRemaining <= 7) safetyStatus = 'critical'
          else if (daysRemaining <= 30) safetyStatus = 'at_risk'
          else safetyStatus = 'monitoring'
        }

        // Resolve team name
        const recruiterReportsTo = offer.recruiter?.reports_to
        const teamName = recruiterReportsTo
          ? (tlToSrTL[recruiterReportsTo] || srTLs?.find(s => s.id === recruiterReportsTo)?.full_name || '—')
          : '—'

        return { ...offer, daysRemaining, safetyStatus, teamName }
      })

      // Apply team filter
      const filtered = teamFilter === 'all'
        ? enhanced
        : enhanced.filter(o => o.teamName === teamFilter)

      setOffers(filtered)
    } catch (err) {
      console.error('Error loading offers:', err)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      extended:  'bg-blue-100 text-blue-800',
      accepted:  'bg-green-100 text-green-800',
      rejected:  'bg-red-100 text-red-800',
      expired:   'bg-gray-100 text-gray-800',
      joined:    'bg-purple-100 text-purple-800',
      renege:    'bg-orange-100 text-orange-800',
    }
    return badges[status] || 'bg-gray-100 text-gray-800'
  }

  const getSafetyBadge = (safetyStatus: string | null, daysRemaining: number | null) => {
    if (!safetyStatus) return null
    const badges: Record<string, { class: string; label: string }> = {
      critical:   { class: 'bg-red-100 text-red-800 border-red-300',       label: `🔴 ${daysRemaining}d left` },
      at_risk:    { class: 'bg-yellow-100 text-yellow-800 border-yellow-300', label: `🟡 ${daysRemaining}d left` },
      monitoring: { class: 'bg-blue-100 text-blue-800 border-blue-300',     label: `🟢 ${daysRemaining}d left` },
      safe:       { class: 'bg-green-100 text-green-800 border-green-300',  label: '✅ Safe' },
    }
    return badges[safetyStatus]
  }

  const filteredBySearch = offers.filter(o => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      o.candidates?.full_name?.toLowerCase().includes(q) ||
      o.recruiter?.full_name?.toLowerCase().includes(q) ||
      o.candidates?.jobs?.clients?.company_name?.toLowerCase().includes(q) ||
      o.candidates?.jobs?.job_title?.toLowerCase().includes(q) ||
      o.teamName?.toLowerCase().includes(q)
    )
  })

  const counts = {
    all:      offers.length,
    extended: offers.filter(o => o.status === 'extended').length,
    accepted: offers.filter(o => o.status === 'accepted').length,
    joined:   offers.filter(o => o.status === 'joined').length,
    renege:   offers.filter(o => o.status === 'renege').length,
    rejected: offers.filter(o => o.status === 'rejected').length,
  }

  const joinedOffers = offers.filter(o => o.status === 'joined')
  const totalRevenue = joinedOffers.reduce((sum, o) => sum + ((o.fixed_ctc * (o.revenue_percentage || 8.33) / 100)), 0)

  const criticalPlacements  = joinedOffers.filter(o => o.safetyStatus === 'critical')
  const atRiskPlacements    = joinedOffers.filter(o => o.safetyStatus === 'at_risk')
  const monitoringPlacements = joinedOffers.filter(o => o.safetyStatus === 'monitoring')
  const safePlacements      = joinedOffers.filter(o => o.safetyStatus === 'safe')

  const criticalRevenue   = criticalPlacements.reduce((sum, o) => sum + (o.candidates?.revenue_earned || 0), 0)
  const atRiskRevenue     = atRiskPlacements.reduce((sum, o) => sum + (o.candidates?.revenue_earned || 0), 0)
  const monitoringRevenue = monitoringPlacements.reduce((sum, o) => sum + (o.candidates?.revenue_earned || 0), 0)
  const safeRevenue       = safePlacements.reduce((sum, o) => sum + (o.candidates?.revenue_earned || 0), 0)

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6 pb-8">

        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-indigo-700 via-blue-700 to-blue-600 rounded-xl p-6 text-white">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-1">📋 Company-Wide Offers & Placements</h1>
              <p className="text-blue-200">Full organisation view · All teams · Safety monitoring</p>
            </div>
            <div className="text-right text-sm text-blue-200">
              <div className="text-2xl font-bold text-white">{counts.all}</div>
              <div>Total Offers</div>
            </div>
          </div>
        </div>

        {/* ── Status Filter KPI Cards ── */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { key: 'all',      label: 'All Offers',  value: counts.all,      color: 'text-gray-800' },
            { key: 'extended', label: 'Extended',    value: counts.extended,  color: 'text-blue-600' },
            { key: 'accepted', label: 'Accepted',    value: counts.accepted,  color: 'text-green-600' },
            { key: 'joined',   label: 'Joined',      value: counts.joined,    color: 'text-purple-600' },
            { key: 'renege',   label: 'Renege',      value: counts.renege,    color: 'text-orange-600' },
            { key: 'rejected', label: 'Rejected',    value: counts.rejected,  color: 'text-red-600' },
          ].map(({ key, label, value, color }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`bg-white rounded-xl p-4 text-center shadow-sm border-2 transition-all ${
                filter === key ? 'border-blue-500 shadow-md scale-105' : 'border-gray-100 hover:border-gray-300'
              }`}
            >
              <div className="text-xs text-gray-500 mb-1">{label}</div>
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
            </button>
          ))}
        </div>

        {/* ── Placement Safety Monitor ── */}
        {counts.joined > 0 && (
          <div className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🛡️</span>
                <div>
                  <h3 className="text-lg font-bold text-white">Organisation Placement Safety Monitor</h3>
                  <p className="text-slate-400 text-sm">{counts.joined} active placements · ₹{totalRevenue.toFixed(2)} total revenue</p>
                </div>
              </div>
              {criticalPlacements.length > 0 && (
                <span className="px-4 py-2 bg-red-600 text-white rounded-full font-bold text-sm animate-pulse">
                  ⚠️ {criticalPlacements.length} CRITICAL
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-0 divide-x divide-y md:divide-y-0 divide-gray-100">
              <div className="p-5 text-center">
                <div className="text-xs text-gray-500 mb-1 font-medium">TOTAL REVENUE</div>
                <div className="text-2xl font-bold text-blue-900">₹{totalRevenue.toFixed(2)}</div>
                <div className="text-xs text-gray-400 mt-1">{counts.joined} placements</div>
              </div>
              <div className="p-5 text-center bg-red-50">
                <div className="text-xs text-red-600 mb-1 font-bold">🔴 CRITICAL ≤7d</div>
                <div className="text-2xl font-bold text-red-900">{criticalPlacements.length}</div>
                <div className="text-xs text-red-500 mt-1 font-semibold">₹{criticalRevenue.toFixed(2)} at risk</div>
              </div>
              <div className="p-5 text-center bg-yellow-50">
                <div className="text-xs text-yellow-600 mb-1 font-bold">🟡 AT RISK ≤30d</div>
                <div className="text-2xl font-bold text-yellow-900">{atRiskPlacements.length}</div>
                <div className="text-xs text-yellow-500 mt-1 font-semibold">₹{atRiskRevenue.toFixed(2)} at risk</div>
              </div>
              <div className="p-5 text-center bg-blue-50">
                <div className="text-xs text-blue-600 mb-1 font-bold">🟢 MONITORING</div>
                <div className="text-2xl font-bold text-blue-900">{monitoringPlacements.length}</div>
                <div className="text-xs text-blue-500 mt-1 font-semibold">₹{monitoringRevenue.toFixed(2)} provisional</div>
              </div>
              <div className="p-5 text-center bg-green-50">
                <div className="text-xs text-green-600 mb-1 font-bold">✅ SAFE</div>
                <div className="text-2xl font-bold text-green-900">{safePlacements.length}</div>
                <div className="text-xs text-green-500 mt-1 font-semibold">₹{safeRevenue.toFixed(2)} confirmed</div>
              </div>
            </div>

            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-6 text-sm text-gray-600">
              <span><strong>Provisional:</strong> ₹{(criticalRevenue + atRiskRevenue + monitoringRevenue).toFixed(2)}</span>
              <span><strong>Confirmed:</strong> ₹{safeRevenue.toFixed(2)}</span>
              <span><strong>Success Rate:</strong> {counts.joined > 0 ? ((safePlacements.length / counts.joined) * 100).toFixed(1) : 0}%</span>
              <span><strong>At Risk Revenue:</strong> ₹{(criticalRevenue + atRiskRevenue).toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* ── Filters Row ── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-4 items-center">
          {/* Search */}
          <div className="flex-1 min-w-48">
            <input
              type="text"
              placeholder="Search candidate, recruiter, client, team..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>

          {/* Team Filter */}
          <div>
            <select
              value={teamFilter}
              onChange={e => setTeamFilter(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="all">All Teams</option>
              {teams.map(t => (
                <option key={t.id} value={t.full_name}>{t.full_name}'s Team</option>
              ))}
            </select>
          </div>

          <div className="text-sm text-gray-500">
            Showing <strong>{filteredBySearch.length}</strong> offers
          </div>
        </div>

        {/* ── Offers List ── */}
        {loading ? (
          <div className="bg-white rounded-xl p-12 text-center shadow-sm">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading all company offers...</p>
          </div>
        ) : filteredBySearch.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center shadow-sm">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-gray-600 font-medium">No offers found</p>
            {(filter !== 'all' || teamFilter !== 'all' || searchQuery) && (
              <button
                onClick={() => { setFilter('all'); setTeamFilter('all'); setSearchQuery('') }}
                className="mt-3 text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredBySearch.map(offer => {
              const safetyBadge = getSafetyBadge(offer.safetyStatus, offer.daysRemaining)

              return (
                <div
                  key={offer.id}
                  className={`bg-white rounded-xl shadow-sm border-2 hover:shadow-md transition cursor-pointer ${
                    offer.safetyStatus === 'critical'  ? 'border-red-300 bg-red-50' :
                    offer.safetyStatus === 'at_risk'   ? 'border-yellow-300 bg-yellow-50' :
                    'border-gray-100 hover:border-blue-200'
                  }`}
                  onClick={() => router.push(`/management/offers/${offer.id}`)}
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">

                        {/* Name + Badges row */}
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <h3 className="font-bold text-gray-900 text-lg leading-tight">
                            {offer.candidates?.full_name}
                          </h3>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${getStatusBadge(offer.status)}`}>
                            {offer.status.toUpperCase()}
                          </span>
                          {safetyBadge && (
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${safetyBadge.class}`}>
                              {safetyBadge.label}
                            </span>
                          )}
                        </div>

                        {/* Meta info */}
                        <div className="text-sm text-gray-600 mb-3 flex flex-wrap gap-x-3 gap-y-1">
                          <span>💼 {offer.candidates?.jobs?.job_title}</span>
                          <span>🏢 {offer.candidates?.jobs?.clients?.company_name}</span>
                          <span>👤 {offer.recruiter?.full_name}</span>
                          <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                            🏆 {offer.teamName}'s Team
                          </span>
                        </div>

                        {/* CTC Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                          <div>
                            <div className="text-xs text-gray-500">Total CTC</div>
                            <div className="text-sm font-bold text-gray-900">₹{offer.offered_ctc}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500">Fixed CTC</div>
                            <div className="text-sm font-bold text-blue-700">₹{offer.fixed_ctc}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500">Revenue ({offer.revenue_percentage || 8.33}%)</div>
                            <div className="text-sm font-bold text-green-700">
                              ₹{((offer.fixed_ctc * (offer.revenue_percentage || 8.33) / 100)).toFixed(2)}
                            </div>
                          </div>
                          {offer.status === 'joined' ? (
                            <>
                              <div>
                                <div className="text-xs text-gray-500">Joined On</div>
                                <div className="text-sm font-medium text-gray-800">
                                  {offer.candidates?.date_joined
                                    ? new Date(offer.candidates.date_joined).toLocaleDateString()
                                    : 'N/A'}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-500">Safe After</div>
                                <div className="text-sm font-medium text-gray-800">
                                  {offer.candidates?.guarantee_period_ends
                                    ? new Date(offer.candidates.guarantee_period_ends).toLocaleDateString()
                                    : 'N/A'}
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="col-span-2">
                              <div className="text-xs text-gray-500">Expected Joining</div>
                              <div className="text-sm font-medium text-gray-800">
                                {offer.expected_joining_date
                                  ? new Date(offer.expected_joining_date).toLocaleDateString()
                                  : 'TBD'}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Critical Alert */}
                        {offer.safetyStatus === 'critical' && (
                          <div className="mt-3 p-3 bg-red-100 border-2 border-red-300 rounded-lg">
                            <div className="flex items-center gap-2 text-red-900 text-sm">
                              <span className="text-xl animate-pulse">⚠️</span>
                              <div>
                                <strong>URGENT:</strong> Only {offer.daysRemaining} day{offer.daysRemaining !== 1 ? 's' : ''} left in guarantee period!
                                Revenue at stake: <strong>₹{offer.candidates?.revenue_earned?.toFixed(2)}L</strong>
                                {' '}· Recruiter: <strong>{offer.recruiter?.full_name}</strong>
                                {' '}· Team: <strong>{offer.teamName}</strong>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* At Risk Alert */}
                        {offer.safetyStatus === 'at_risk' && (
                          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-300 rounded-lg">
                            <div className="flex items-center gap-2 text-yellow-900 text-sm">
                              <span className="text-lg">⚠️</span>
                              <div>
                                <strong>Attention:</strong> {offer.daysRemaining} days remaining in guarantee period.
                                Revenue: ₹{offer.candidates?.revenue_earned?.toFixed(2)}L
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Arrow */}
                      <div className="flex-shrink-0 text-gray-400 text-lg pt-1">→</div>
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
