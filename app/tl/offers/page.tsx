// app/tl/offers/page.tsx - UPDATED WITH DYNAMIC FEE%
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function TLOffersPage() {
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
      loadOffers(parsedUser.team_id)
    }

    const interval = setInterval(() => {
      if (user) loadOffers(user.team_id)
    }, 120000)

    return () => clearInterval(interval)
  }, [filter])

  const loadOffers = async (teamId: string) => {
    setLoading(true)
    try {
      const { data: teamCandidates } = await supabase
        .from('candidates')
        .select('id')
        .eq('team_id', teamId)

      if (!teamCandidates || teamCandidates.length === 0) {
        setOffers([])
        setLoading(false)
        return
      }

      const candidateIds = teamCandidates.map(c => c.id)

      let query = supabase
        .from('offers')
        .select(`
          *,
          candidates (
            id,
            full_name,
            phone,
            revenue_earned,
            date_joined,
            guarantee_period_ends,
            placement_status,
            jobs (
              job_title,
              job_code,
              clients (company_name)
            )
          ),
          recruiter:recruiter_id (
            full_name
          )
        `)
        .in('candidate_id', candidateIds)
        .order('created_at', { ascending: false })

      if (filter !== 'all') {
        query = query.eq('status', filter)
      }

      const { data, error } = await query

      if (error) throw error

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

        return { ...offer, daysRemaining, safetyStatus }
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
      joined: 'bg-purple-100 text-purple-800',
      renege: 'bg-orange-100 text-orange-800',
    }
    return badges[status] || 'bg-gray-100 text-gray-800'
  }

  const getSafetyBadge = (safetyStatus: string | null, daysRemaining: number | null) => {
    if (!safetyStatus) return null
    const badges: { [key: string]: { class: string, label: string } } = {
      critical: { class: 'bg-red-100 text-red-800 border-red-300', label: `🔴 ${daysRemaining}d` },
      at_risk: { class: 'bg-yellow-100 text-yellow-800 border-yellow-300', label: `🟡 ${daysRemaining}d` },
      monitoring: { class: 'bg-blue-100 text-blue-800 border-blue-300', label: `🟢 ${daysRemaining}d` },
      safe: { class: 'bg-green-100 text-green-800 border-green-300', label: '✅ Safe' },
    }
    return badges[safetyStatus]
  }

  const totalRevenue = offers.filter(o => o.status === 'joined')
    .reduce((sum, o) => sum + ((o.fixed_ctc * (o.revenue_percentage || 8.33) / 100) / 100000), 0)

  const counts = {
    all: offers.length,
    extended: offers.filter(o => o.status === 'extended').length,
    accepted: offers.filter(o => o.status === 'accepted').length,
    joined: offers.filter(o => o.status === 'joined').length,
    renege: offers.filter(o => o.status === 'renege').length,
  }

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
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Team Offers & Placements</h2>
          <p className="text-gray-600">Monitor team offers and placement safety</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { key: 'all', label: 'All', color: 'text-gray-900' },
            { key: 'extended', label: 'Extended', color: 'text-blue-600' },
            { key: 'accepted', label: 'Accepted', color: 'text-green-600' },
            { key: 'joined', label: 'Joined', color: 'text-purple-600' },
            { key: 'renege', label: 'Renege', color: 'text-red-600' },
          ].map(item => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={`kpi-card text-center cursor-pointer transition ${
                filter === item.key ? 'ring-2 ring-blue-500' : ''
              }`}
            >
              <div className="kpi-title">{item.label}</div>
              <div className={`kpi-value ${item.color}`}>
                {counts[item.key as keyof typeof counts]}
              </div>
            </button>
          ))}
        </div>

        {counts.joined > 0 && (
          <div className="card bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold mb-3">🛡️ Team Safety Monitor</h3>
              {criticalPlacements.length > 0 && (
                <span className="px-4 py-2 bg-red-600 text-white rounded-full font-bold text-sm animate-pulse">
                  ⚠️ {criticalPlacements.length} CRITICAL
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center p-4 bg-white rounded-lg">
                <div className="text-sm text-gray-600">Total Revenue</div>
                <div className="text-2xl font-bold text-blue-900">₹{totalRevenue.toFixed(2)}L</div>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg border-2 border-red-200">
                <div className="text-sm text-red-600">🔴 Critical</div>
                <div className="text-2xl font-bold text-red-900">
                  {criticalPlacements.length}
                </div>
                <div className="text-xs text-red-600 mt-1">₹{criticalRevenue.toFixed(2)}L</div>
              </div>
              <div className="text-center p-4 bg-yellow-50 rounded-lg border-2 border-yellow-200">
                <div className="text-sm text-yellow-600">🟡 At Risk</div>
                <div className="text-2xl font-bold text-yellow-900">{atRiskPlacements.length}</div>
                <div className="text-xs text-yellow-600 mt-1">₹{atRiskRevenue.toFixed(2)}L</div>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
                <div className="text-sm text-blue-600">🟢 Monitoring</div>
                <div className="text-2xl font-bold text-blue-900">{monitoringPlacements.length}</div>
                <div className="text-xs text-blue-600 mt-1">₹{monitoringRevenue.toFixed(2)}L</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg border-2 border-green-200">
                <div className="text-sm text-green-600">✅ Safe</div>
                <div className="text-2xl font-bold text-green-900">{safePlacements.length}</div>
                <div className="text-xs text-green-600 mt-1">₹{safeRevenue.toFixed(2)}L</div>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="card text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : offers.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-600">No offers found</p>
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
                    offer.safetyStatus === 'at_risk' ? 'border-2 border-yellow-300 bg-yellow-50' : ''
                  }`}
                  onClick={() => router.push(`/tl/candidates/${offer.candidate_id}`)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-bold text-gray-900">{offer.candidates?.full_name}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(offer.status)}`}>
                          {offer.status.toUpperCase()}
                        </span>
                        {safetyBadge && (
                          <span className={`px-3 py-1 rounded-full text-xs font-bold border-2 ${safetyBadge.class}`}>
                            {safetyBadge.label}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mb-3">
                        {offer.candidates?.jobs?.job_title} • {offer.candidates?.jobs?.clients?.company_name}
                        {' '} • 👤 {offer.recruiter?.full_name}
                      </p>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <div className="text-xs text-gray-500">Total CTC</div>
                          <div className="font-bold text-gray-900">₹{offer.offered_ctc}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Fixed CTC</div>
                          <div className="font-bold text-blue-600">₹{offer.fixed_ctc}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Revenue ({offer.revenue_percentage || 8.33}%)</div>
                          <div className="font-bold text-green-600">
                            ₹{((offer.fixed_ctc * (offer.revenue_percentage || 8.33) / 100) / 100000).toFixed(2)}L
                          </div>
                        </div>
                      </div>
                      {offer.safetyStatus === 'critical' && (
                        <div className="mt-3 p-2 bg-red-100 border border-red-300 rounded text-sm text-red-900">
                          <strong>⚠️ URGENT:</strong> {offer.daysRemaining} days left! Revenue: ₹{offer.candidates?.revenue_earned?.toFixed(2)}L
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
