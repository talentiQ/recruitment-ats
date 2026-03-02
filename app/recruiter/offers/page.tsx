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
    
    const badges: { [key: string]: { class: string, label: string } } = {
      critical: { class: 'bg-red-100 text-red-800 border-red-300', label: `🔴 ${daysRemaining}d left` },
      at_risk: { class: 'bg-yellow-100 text-yellow-800 border-yellow-300', label: `🟡 ${daysRemaining}d left` },
      monitoring: { class: 'bg-blue-100 text-blue-800 border-blue-300', label: `🟢 ${daysRemaining}d left` },
      safe: { class: 'bg-green-100 text-green-800 border-green-300', label: '✅ Safe' },
    }
    return badges[safetyStatus]
  }

  const counts = {
    all: offers.length,
    extended: offers.filter(o => o.status === 'extended').length,
    accepted: offers.filter(o => o.status === 'accepted').length,
    joined: offers.filter(o => o.status === 'joined').length,
    renege: offers.filter(o => o.status === 'renege').length,
  }

  // ✅ FIXED: Use stored revenue for joined
  const totalRevenue = offers
    .filter(o => o.status === 'joined')
    .reduce((sum, o) => sum + (o.candidates?.revenue_earned || 0), 0)

  const criticalPlacements = offers.filter(o => o.safetyStatus === 'critical')
  const atRiskPlacements = offers.filter(o => o.safetyStatus === 'at_risk')
  const monitoringPlacements = offers.filter(o => o.safetyStatus === 'monitoring')
  const safePlacements = offers.filter(o => o.safetyStatus === 'safe')

  const criticalRevenue = criticalPlacements.reduce((sum, o) => sum + (o.candidates?.revenue_earned || 0), 0)
  const atRiskRevenue = atRiskPlacements.reduce((sum, o) => sum + (o.candidates?.revenue_earned || 0), 0)
  const monitoringRevenue = monitoringPlacements.reduce((sum, o) => sum + (o.candidates?.revenue_earned || 0), 0)
  const safeRevenue = safePlacements.reduce((sum, o) => sum + (o.candidates?.revenue_earned || 0), 0)

  const calculateLiveRevenue = (offer: any) => {
    const percent = offer.revenue_percentage || 8.33
    return (offer.fixed_ctc * percent) / 100
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">

        <div>
          <h2 className="text-2xl font-bold text-gray-900">My Offers & Placements</h2>
          <p className="text-gray-600">Track offers and monitor placement safety</p>
        </div>

        {counts.joined > 0 && (
          <div className="card bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">

              <div className="text-center p-4 bg-white rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Total Revenue</div>
                <div className="text-2xl font-bold text-blue-900">
                  ₹{(totalRevenue).toFixed(2)}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {counts.joined} placements
                </div>
              </div>

              <div className="text-center p-4 bg-red-50 rounded-lg border-2 border-red-200">
                <div className="text-sm text-red-600 mb-1 font-semibold">🔴 Critical</div>
                <div className="text-2xl font-bold text-red-900">
                  {criticalPlacements.length}
                </div>
                <div className="text-xs text-red-600 mt-1 font-semibold">
                  ₹{criticalRevenue.toFixed(2)} at risk
                </div>
              </div>

              <div className="text-center p-4 bg-yellow-50 rounded-lg border-2 border-yellow-200">
                <div className="text-sm text-yellow-600 mb-1 font-semibold">🟡 At Risk</div>
                <div className="text-2xl font-bold text-yellow-900">
                  {atRiskPlacements.length}
                </div>
                <div className="text-xs text-yellow-600 mt-1 font-semibold">
                  ₹{atRiskRevenue.toFixed(2)} at risk
                </div>
              </div>

              <div className="text-center p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
                <div className="text-sm text-blue-600 mb-1 font-semibold">🟢 Monitoring</div>
                <div className="text-2xl font-bold text-blue-900">
                  {monitoringPlacements.length}
                </div>
                <div className="text-xs text-blue-600 mt-1 font-semibold">
                  ₹{monitoringRevenue.toFixed(2)} provisional
                </div>
              </div>

              <div className="text-center p-4 bg-green-50 rounded-lg border-2 border-green-200">
                <div className="text-sm text-green-600 mb-1 font-semibold">✅ Safe</div>
                <div className="text-2xl font-bold text-green-900">
                  {safePlacements.length}
                </div>
                <div className="text-xs text-green-600 mt-1 font-semibold">
                  ₹{safeRevenue.toFixed(2)} confirmed
                </div>
              </div>

            </div>
          </div>
        )}

        {!loading && (
          <div className="space-y-4">
            {offers.map(offer => {
              const safetyBadge = getSafetyBadge(offer.safetyStatus, offer.daysRemaining)

              const revenueDisplay =
                offer.status === 'joined'
                  ? (offer.candidates?.revenue_earned || 0).toFixed(2)
                  : calculateLiveRevenue(offer).toFixed(2)

              return (
                <div
                  key={offer.id}
                  className="card hover:shadow-lg transition cursor-pointer"
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

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <div className="text-xs text-gray-500">Total CTC</div>
                          <div className="text-sm font-bold">₹{offer.offered_ctc}</div>
                        </div>

                        <div>
                          <div className="text-xs text-gray-500">Fixed CTC</div>
                          <div className="text-sm font-bold text-blue-600">₹{offer.fixed_ctc}</div>
                        </div>

                        <div>
                          <div className="text-xs text-gray-500">Revenue</div>
                          <div className="text-sm font-bold text-green-600">
                            ₹{revenueDisplay}
                          </div>
                        </div>

                      </div>

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