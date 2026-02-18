'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function TeamLeadersPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [teamLeaders, setTeamLeaders] = useState<any[]>([])

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      
      if (parsedUser.role !== 'sr_team_leader') {
        alert('Access denied')
        router.push('/')
        return
      }
      
      loadTeamLeaders(parsedUser)
    }
  }, [])

  const loadTeamLeaders = async (user: any) => {
    setLoading(true)
    try {
      // Get all team leaders in this team
      const { data: tlData } = await supabase
        .from('users')
        .select(`
          *,
          teams (name)
        `)
        .eq('team_id', user.team_id)
        .eq('role', 'team_leader')
        .eq('is_active', true)
        .order('full_name')

      if (tlData) {
        // Get performance stats for each TL
        const tlsWithStats = await Promise.all(
          tlData.map(async (tl) => {
            // Get recruiter count
            const { data: recruiters } = await supabase
              .from('users')
              .select('id')
              .eq('reports_to', tl.id)
              .eq('role', 'recruiter')
              .eq('is_active', true)

            // Get candidates count
            const { data: candidates } = await supabase
              .from('candidates')
              .select('id, current_stage, date_joined')
              .eq('assigned_to', tl.id)

            // Get this month joinings
            const monthStart = new Date()
            monthStart.setDate(1)
            const thisMonthJoinings = candidates?.filter(c => 
              c.current_stage === 'joined' && 
              c.date_joined && 
              new Date(c.date_joined) >= monthStart
            ).length || 0

            return {
              ...tl,
              recruiter_count: recruiters?.length || 0,
              candidates_count: candidates?.length || 0,
              this_month_joinings: thisMonthJoinings,
              pipeline_count: candidates?.filter(c => 
                ['screening', 'interview_scheduled', 'interview_completed', 'offer_extended', 'offer_accepted'].includes(c.current_stage)
              ).length || 0
            }
          })
        )

        setTeamLeaders(tlsWithStats)
      }
    } catch (error) {
      console.error('Error loading team leaders:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 text-center">Team Leaders</h2>
          <p className="text-gray-600 text-center">Manage and monitor your team leaders</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="kpi-card text-center">
            <div className="kpi-title">Total Team Leaders</div>
            <div className="kpi-value">{teamLeaders.length}</div>
          </div>

          <div className="kpi-card text-center">
            <div className="kpi-title">Total Recruiters</div>
            <div className="kpi-value">
              {teamLeaders.reduce((sum, tl) => sum + tl.recruiter_count, 0)}
            </div>
          </div>

          <div className="kpi-card text-center">
            <div className="kpi-title">Total Candidates</div>
            <div className="kpi-value">
              {teamLeaders.reduce((sum, tl) => sum + tl.candidates_count, 0)}
            </div>
          </div>

          <div className="kpi-card kpi-success text-center">
            <div className="kpi-title">This Month Joinings</div>
            <div className="kpi-value">
              {teamLeaders.reduce((sum, tl) => sum + tl.this_month_joinings, 0)}
            </div>
          </div>
        </div>

        {/* Team Leaders List */}
        {loading ? (
          <div className="card text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : teamLeaders.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-600 mb-4">No team leaders found</p>
            <p className="text-sm text-gray-500">Assign team leaders to see them here</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {teamLeaders.map(tl => (
              <div key={tl.id} className="card">
                {/* TL Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{tl.full_name}</h3>
                    <p className="text-sm text-gray-600">{tl.email}</p>
                    <p className="text-xs text-gray-500 mt-1">{tl.job_title || 'Team Leader'}</p>
                  </div>
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                    TEAM LEADER
                  </span>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-purple-50 p-3 rounded-lg text-center">
                    <div className="text-xs text-purple-600 font-medium">Recruiters</div>
                    <div className="text-2xl font-bold text-purple-900">{tl.recruiter_count}</div>
                  </div>
                  <div className="bg-blue-50 p-3 rounded-lg text-center">
                    <div className="text-xs text-blue-600 font-medium">Candidates</div>
                    <div className="text-2xl font-bold text-blue-900">{tl.candidates_count}</div>
                  </div>
                  <div className="bg-green-50 p-3 rounded-lg text-center">
                    <div className="text-xs text-green-600 font-medium">Joinings</div>
                    <div className="text-2xl font-bold text-green-900">{tl.this_month_joinings}</div>
                  </div>
                  <div className="bg-orange-50 p-3 rounded-lg text-center">
                    <div className="text-xs text-orange-600 font-medium">Pipeline</div>
                    <div className="text-2xl font-bold text-orange-900">{tl.pipeline_count}</div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => router.push(`/sr-tl/team-leaders/${tl.id}`)}
                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
                  >
                    View Details
                  </button>
                  <button
                    onClick={() => router.push(`/sr-tl/candidates?tl=${tl.id}`)}
                    className="flex-1 bg-white border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 text-sm font-medium"
                  >
                    View Candidates
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}