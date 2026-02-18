// app/recruiter/offers/page.tsx - UPDATED WITH SAFETY TRACKING
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function RecruiterOffersPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [offers, setOffers] = useState<any[]>([])
  const [filter, setFilter] = useState('all')
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      loadOffers(parsedUser.id)
    }

    // Auto-refresh every 2 minutes
    const interval = setInterval(() => {
      if (user) loadOffers(user.id)
    }, 120000)

    return () => clearInterval(interval)
  }, [filter])

  const loadOffers = async (userId: string) => {
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
            jobs (
              job_title,
              job_code,
              clients (
                company_name,
                replacement_guarantee_days
              )
            )
          )
        `)
        .eq('recruiter_id', userId)
        .order('created_at', { ascending: false })

      // Apply filter
      if (filter !== 'all') {
        query = query.eq('status', filter)
      }

      const { data, error } = await query

      if (error) throw error

      // Calculate days remaining for joined candidates
      const enhanced = data?.map(offer => {
        let daysRemaining = null
        let safetyStatus = null

        if (offer.status === 'joined' && offer.candidates?.guarantee_period_ends) {
          daysRemaining = Math.max(0, Math.floor(
            (new Date(offer.candidates.guarantee_period_ends).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
          ))
          
          if (offer.candidates.placement_status === 'safe') {
            safetyStatus = 'safe'
          } else if (daysRemaining <= 7) {
            safetyStatus = 'critical'
          } else if (daysRemaining <= 30) {
            safetyStatus = 'at_risk'
          } else {
            safetyStatus = 'monitoring'
          }
        }

        return {
          ...offer,
          daysRemaining,
          safetyStatus
        }
      }) || []

      setOffers(enhanced)

    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const badges: { [key: string]: string } = {
      extended: 'bg-blue-100 text-blue-800',
      accepted: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      expired: 'bg-gray-100 text-gray-800',
      joined: 'bg-purple-100 text-purple-800',
      renege: 'bg-orange-100 text-orange-800',
    }
    return badges[status] || 'bg-gray-100 text-gray-800'
  }

  const getSafetyBadge = (safetyStatus: string | null, daysRemaining: number | null) => {
    if (!safetyStatus) return null
    
    const badges: { [key: string]: { class: string, label: string, icon: string } } = {
      critical: { class: 'bg-red-100 text-red-800 border-red-300', label: `🔴 ${daysRemaining}d left`, icon: '🔴' },
      at_risk: { class: 'bg-yellow-100 text-yellow-800 border-yellow-300', label: `🟡 ${daysRemaining}d left`, icon: '🟡' },
      monitoring: { class: 'bg-blue-100 text-blue-800 border-blue-300', label: `🟢 ${daysRemaining}d left`, icon: '🟢' },
      safe: { class: 'bg-green-100 text-green-800 border-green-300', label: '✅ Safe', icon: '✅' },
    }
    return badges[safetyStatus]
  }

  // Calculate stats
  const counts = {
    all: offers.length,
    extended: offers.filter(o => o.status === 'extended').length,
    accepted: offers.filter(o => o.status === 'accepted').length,
    joined: offers.filter(o => o.status === 'joined').length,
    renege: offers.filter(o => o.status === 'renege').length,
  }

  // Revenue and safety stats
  const totalRevenue = offers
    .filter(o => o.status === 'joined')
    .reduce((sum, o) => sum + (o.fixed_ctc * 0.0833), 0)

  const criticalPlacements = offers.filter(o => o.safetyStatus === 'critical')
  const atRiskPlacements = offers.filter(o => o.safetyStatus === 'at_risk')
  const monitoringPlacements = offers.filter(o => o.safetyStatus === 'monitoring')
  const safePlacements = offers.filter(o => o.safetyStatus === 'safe')

  const criticalRevenue = criticalPlacements.reduce((sum, o) => sum + (o.candidates?.revenue_earned || 0), 0)
  const atRiskRevenue = atRiskPlacements.reduce((sum, o) => sum + (o.candidates?.revenue_earned || 0), 0)
  const monitoringRevenue = monitoringPlacements.reduce((sum, o) => sum + (o.candidates?.revenue_earned || 0), 0)
  const safeRevenue = safePlacements.reduce((sum, o) => sum + (o.candidates?.revenue_earned || 0), 0)

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">My Offers & Placements</h2>
            <p className="text-gray-600">Track offers and monitor placement safety</p>
          </div>
        </div>

        {/* Offer Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <button
            onClick={() => setFilter('all')}
            className={`kpi-card text-center cursor-pointer transition ${
              filter === 'all' ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="kpi-title">All Offers</div>
            <div className="kpi-value">{counts.all}</div>
          </button>

          <button
            onClick={() => setFilter('extended')}
            className={`kpi-card text-center cursor-pointer transition ${
              filter === 'extended' ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="kpi-title">Extended</div>
            <div className="kpi-value text-blue-600">{counts.extended}</div>
          </button>

          <button
            onClick={() => setFilter('accepted')}
            className={`kpi-card kpi-success text-center cursor-pointer transition ${
              filter === 'accepted' ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="kpi-title">Accepted</div>
            <div className="kpi-value">{counts.accepted}</div>
          </button>

          <button
            onClick={() => setFilter('joined')}
            className={`kpi-card text-center cursor-pointer transition ${
              filter === 'joined' ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="kpi-title">Joined</div>
            <div className="kpi-value text-purple-600">{counts.joined}</div>
          </button>

          <button
            onClick={() => setFilter('renege')}
            className={`kpi-card text-center cursor-pointer transition ${
              filter === 'renege' ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="kpi-title">Renege</div>
            <div className="kpi-value text-red-600">{counts.renege}</div>
          </button>
        </div>

        {/* Safety Monitoring Stats - Only show if there are joined candidates */}
        {counts.joined > 0 && (
          <div className="card bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                🛡️ Placement Safety Monitor
              </h3>
              {criticalPlacements.length > 0 && (
                <span className="px-4 py-2 bg-red-600 text-white rounded-full font-bold text-sm animate-pulse">
                  ⚠️ {criticalPlacements.length} CRITICAL
                </span>
              )}
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center p-4 bg-white rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Total Revenue</div>
                <div className="text-2xl font-bold text-blue-900">₹{totalRevenue.toFixed(2)}L</div>
                <div className="text-xs text-gray-500 mt-1">{counts.joined} placements</div>
              </div>
              
              <div className="text-center p-4 bg-red-50 rounded-lg border-2 border-red-200">
                <div className="text-sm text-red-600 mb-1 font-semibold">🔴 Critical (≤7d)</div>
                <div className="text-2xl font-bold text-red-900">
                  {criticalPlacements.length}
                </div>
                <div className="text-xs text-red-600 mt-1 font-semibold">
                  ₹{criticalRevenue.toFixed(2)}L at risk
                </div>
              </div>
              
              <div className="text-center p-4 bg-yellow-50 rounded-lg border-2 border-yellow-200">
                <div className="text-sm text-yellow-600 mb-1 font-semibold">🟡 At Risk (≤30d)</div>
                <div className="text-2xl font-bold text-yellow-900">
                  {atRiskPlacements.length}
                </div>
                <div className="text-xs text-yellow-600 mt-1 font-semibold">
                  ₹{atRiskRevenue.toFixed(2)}L at risk
                </div>
              </div>
              
              <div className="text-center p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
                <div className="text-sm text-blue-600 mb-1 font-semibold">🟢 Monitoring</div>
                <div className="text-2xl font-bold text-blue-900">
                  {monitoringPlacements.length}
                </div>
                <div className="text-xs text-blue-600 mt-1 font-semibold">
                  ₹{monitoringRevenue.toFixed(2)}L provisional
                </div>
              </div>
              
              <div className="text-center p-4 bg-green-50 rounded-lg border-2 border-green-200">
                <div className="text-sm text-green-600 mb-1 font-semibold">✅ Safe</div>
                <div className="text-2xl font-bold text-green-900">
                  {safePlacements.length}
                </div>
                <div className="text-xs text-green-600 mt-1 font-semibold">
                  ₹{safeRevenue.toFixed(2)}L confirmed
                </div>
              </div>
            </div>

            {/* Quick Insights */}
            <div className="mt-4 pt-4 border-t border-blue-200">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-6">
                  <span className="text-gray-700">
                    <strong>Provisional:</strong> ₹{(criticalRevenue + atRiskRevenue + monitoringRevenue).toFixed(2)}L
                  </span>
                  <span className="text-gray-700">
                    <strong>Confirmed:</strong> ₹{safeRevenue.toFixed(2)}L
                  </span>
                  <span className="text-gray-700">
                    <strong>Success Rate:</strong> {counts.joined > 0 ? ((safePlacements.length / counts.joined) * 100).toFixed(1) : 0}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Offers List */}
        {loading ? (
          <div className="card text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : offers.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-600">No offers found</p>
            {filter !== 'all' && (
              <button
                onClick={() => setFilter('all')}
                className="mt-4 text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                Show all offers
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {offers.map(offer => {
              const safetyBadge = getSafetyBadge(offer.safetyStatus, offer.daysRemaining)
              
              return (
                <div
                  key={offer.id}
                  className={`card hover:shadow-lg transition cursor-pointer ${
                    offer.safetyStatus === 'critical' ? 'border-2 border-red-300 bg-red-50' :
                    offer.safetyStatus === 'at_risk' ? 'border-2 border-yellow-300 bg-yellow-50' :
                    ''
                  }`}
                  onClick={() => router.push(`/recruiter/offers/${offer.id}`)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-bold text-gray-900 text-lg">
                          {offer.candidates?.full_name}
                        </h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(offer.status)}`}>
                          {offer.status.toUpperCase()}
                        </span>
                        {safetyBadge && (
                          <span className={`px-3 py-1 rounded-full text-xs font-bold border-2 ${safetyBadge.class}`}>
                            {safetyBadge.label}
                          </span>
                        )}
                      </div>

                      <div className="text-sm text-gray-600 mb-3">
                        {offer.candidates?.jobs?.job_title} • {offer.candidates?.jobs?.clients?.company_name}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div>
                          <div className="text-xs text-gray-500">Total CTC</div>
                          <div className="text-sm font-bold text-gray-900">₹{offer.offered_ctc}L</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Fixed CTC</div>
                          <div className="text-sm font-bold text-blue-600">₹{offer.fixed_ctc}L</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Revenue</div>
                          <div className="text-sm font-bold text-green-600">
                            ₹{(offer.fixed_ctc * 0.0833).toFixed(2)}L
                          </div>
                        </div>
                        
                        {offer.status === 'joined' ? (
                          <>
                            <div>
                              <div className="text-xs text-gray-500">Joined On</div>
                              <div className="text-sm font-medium text-gray-900">
                                {offer.candidates?.date_joined 
                                  ? new Date(offer.candidates.date_joined).toLocaleDateString() 
                                  : 'N/A'}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500">Safe After</div>
                              <div className="text-sm font-medium text-gray-900">
                                {offer.candidates?.guarantee_period_ends 
                                  ? new Date(offer.candidates.guarantee_period_ends).toLocaleDateString() 
                                  : 'N/A'}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="col-span-2">
                            <div className="text-xs text-gray-500">Expected Joining</div>
                            <div className="text-sm font-medium text-gray-900">
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
                          <div className="flex items-center gap-2 text-red-900">
                            <span className="text-xl animate-pulse">⚠️</span>
                            <div className="text-sm">
                              <strong>URGENT:</strong> Only {offer.daysRemaining} day{offer.daysRemaining !== 1 ? 's' : ''} left in guarantee period! 
                              Revenue at stake: <strong>₹{offer.candidates?.revenue_earned?.toFixed(2)}L</strong>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* At Risk Warning */}
                      {offer.safetyStatus === 'at_risk' && (
                        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-300 rounded-lg">
                          <div className="flex items-center gap-2 text-yellow-900">
                            <span className="text-lg">⚠️</span>
                            <div className="text-sm">
                              <strong>Attention Needed:</strong> {offer.daysRemaining} days remaining in guarantee period.
                              Revenue: ₹{offer.candidates?.revenue_earned?.toFixed(2)}L
                            </div>
                          </div>
                        </div>
                      )}
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