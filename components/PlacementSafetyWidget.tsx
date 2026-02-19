// components/PlacementSafetyWidget.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface PlacementSafetyWidgetProps {
  userRole: 'recruiter' | 'team_leader' | 'sr_team_leader'
  userId: string
  teamId?: string
}

export default function PlacementSafetyWidget({ userRole, userId, teamId }: PlacementSafetyWidgetProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [placements, setPlacements] = useState<any[]>([])

  useEffect(() => {
    loadPlacements()
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(loadPlacements, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [userId, userRole])

  const loadPlacements = async () => {
    try {
      let query = supabase
        .from('placement_safety_tracker')
        .select(`
          *,
          candidates (
            id,
            full_name,
            phone,
            revenue_earned,
            jobs (
              job_title,
              clients (company_name)
            )
          )
        `)
        .in('safety_status', ['monitoring', 'at_risk'])
        .order('days_remaining', { ascending: true })

      // Role-based filtering
      if (userRole === 'recruiter') {
        query = query.eq('recruiter_id', userId)
      } else if (userRole === 'team_leader') {
        // Get team recruiters
        const { data: teamRecruiters } = await supabase
          .from('users')
          .select('id')
          .eq('team_id', teamId)
        
        const recruiterIds = teamRecruiters?.map(r => r.id) || []
        query = query.in('recruiter_id', recruiterIds)
      }
      // Sr. TL sees all

      const { data, error } = await query.limit(5)

      if (error) throw error
      
      // Calculate days remaining
      const updated = data?.map(p => ({
        ...p,
        days_remaining: Math.max(0, Math.floor(
          (new Date(p.guarantee_period_ends).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
        ))
      })) || []

      setPlacements(updated)
    } catch (error) {
      console.error('Error loading placements:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (days: number) => {
    if (days <= 7) return 'bg-red-100 text-red-800 border-red-300'
    if (days <= 15) return 'bg-orange-100 text-orange-800 border-orange-300'
    if (days <= 30) return 'bg-yellow-100 text-yellow-800 border-yellow-300'
    return 'bg-blue-100 text-blue-800 border-blue-300'
  }

  const getStatusIcon = (days: number) => {
    if (days <= 7) return '🔴'
    if (days <= 15) return '🟠'
    if (days <= 30) return '🟡'
    return '🟢'
  }

  const getDaysLabel = (days: number) => {
    if (days === 0) return 'Today!'
    if (days === 1) return '1 day'
    return `${days} days`
  }

  if (loading) {
    return (
      <div className="card">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="h-20 bg-gray-100 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (placements.length === 0) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          🛡️ Placement Safety Monitor
        </h3>
        <div className="text-center py-8">
          <div className="text-4xl mb-2">✅</div>
          <p className="text-gray-600">All placements are safe!</p>
          <p className="text-sm text-gray-500 mt-1">No active monitoring needed</p>
        </div>
      </div>
    )
  }

  const criticalCount = placements.filter(p => p.days_remaining <= 7).length
  const atRiskCount = placements.filter(p => p.days_remaining <= 30).length

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            🛡️ Placement Safety Monitor
          </h3>
          <p className="text-sm text-gray-600">
            {criticalCount > 0 && (
              <span className="text-red-600 font-semibold">
                {criticalCount} critical
              </span>
            )}
            {criticalCount > 0 && atRiskCount > criticalCount && ' • '}
            {atRiskCount > criticalCount && (
              <span className="text-orange-600 font-semibold">
                {atRiskCount - criticalCount} at risk
              </span>
            )}
            {atRiskCount === 0 && <span className="text-green-600">All good</span>}
          </p>
        </div>
        <button
          onClick={() => router.push(`/${userRole === 'sr_team_leader' ? 'sr-tl' : userRole === 'team_leader' ? 'tl' : 'recruiter'}/placements`)}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
        >
          View All →
        </button>
      </div>

      {/* Placements List */}
      <div className="space-y-3">
        {placements.map(placement => (
          <div
            key={placement.id}
            className={`p-4 rounded-lg border-2 cursor-pointer hover:shadow-md transition ${getStatusColor(placement.days_remaining)}`}
            onClick={() => router.push(`/${userRole === 'sr_team_leader' ? 'sr-tl' : userRole === 'team_leader' ? 'tl' : 'recruiter'}/candidates/${placement.candidate_id}`)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{getStatusIcon(placement.days_remaining)}</span>
                  <h4 className="font-bold text-gray-900">
                    {placement.candidates?.full_name}
                  </h4>
                </div>
                <p className="text-sm text-gray-600 mb-2">
                  {placement.candidates?.jobs?.job_title} • {placement.candidates?.jobs?.clients?.company_name}
                </p>
                <div className="flex items-center gap-4 text-xs">
                  <span className="font-semibold">
                    {getDaysLabel(placement.days_remaining)} left
                  </span>
                  <span className="text-gray-500">
                    Revenue: ₹{placement.candidates?.revenue_earned?.toFixed(2)}L
                  </span>
                  {placement.last_followup_date && (
                    <span className="text-gray-500">
                      Last contact: {Math.floor((new Date().getTime() - new Date(placement.last_followup_date).getTime()) / (1000 * 60 * 60 * 24))}d ago
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  // TODO: Open follow-up modal
                }}
                className="ml-4 text-xs bg-white px-3 py-1 rounded-full font-medium hover:bg-gray-50"
              >
                Follow Up
              </button>
            </div>
          </div>
        ))}
      </div>

      {placements.length > 0 && (
        <button
          onClick={() => router.push(`/${userRole === 'sr_team_leader' ? 'sr-tl' : userRole === 'team_leader' ? 'tl' : 'recruiter'}/placements`)}
          className="w-full mt-4 bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200 font-medium text-sm"
        >
          View All {placements.length > 5 ? 'Placements' : ''}
        </button>
      )}
    </div>
  )
}