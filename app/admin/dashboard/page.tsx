// app/admin/dashboard/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AdminDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalTeams: 0,
    totalUsers: 0,
    activeUsers: 0,
    totalClients: 0,
    totalJobs: 0,
    openJobs: 0,
    totalCandidates: 0,
    thisMonthJoinings: 0,
  })
  const [teamStats, setTeamStats] = useState<any[]>([])
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      
      if (parsedUser.role !== 'system_admin') {
        alert('Access denied. Admin only.')
        router.push('/')
        return
      }
      
      loadDashboard()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadDashboard = async () => {
    setLoading(true)
    try {
      // Load system stats
      const [teams, users, clients, jobs, candidates] = await Promise.all([
        supabase.from('teams').select('*', { count: 'exact' }),
        supabase.from('users').select('*', { count: 'exact' }),
        supabase.from('clients').select('*', { count: 'exact' }),
        supabase.from('jobs').select('*', { count: 'exact' }),
        supabase.from('candidates').select('*', { count: 'exact' }),
      ])

      const activeUsers = users.data?.filter(u => u.is_active).length || 0
      const openJobs = jobs.data?.filter(j => j.status === 'open').length || 0
      
      const monthStart = new Date()
      monthStart.setDate(1)
      const thisMonthJoinings = candidates.data?.filter(c => 
        c.current_stage === 'joined' && 
        c.date_joined && 
        new Date(c.date_joined) >= monthStart
      ).length || 0

      setStats({
        totalTeams: teams.count || 0,
        totalUsers: users.count || 0,
        activeUsers,
        totalClients: clients.count || 0,
        totalJobs: jobs.count || 0,
        openJobs,
        totalCandidates: candidates.count || 0,
        thisMonthJoinings,
      })

      // Load team stats
      const teamData = await Promise.all(
        (teams.data || []).map(async (team) => {
          const { data: teamUsers } = await supabase
            .from('users')
            .select('id')
            .eq('team_id', team.id)

          const { data: teamJobs } = await supabase
            .from('jobs')
            .select('id')
            .eq('assigned_team_id', team.id)

          const { data: teamCandidates } = await supabase
            .from('candidates')
            .select('id, current_stage')
            .eq('team_id', team.id)

          return {
            id: team.id,
            name: team.name,
            userCount: teamUsers?.length || 0,
            jobCount: teamJobs?.length || 0,
            candidateCount: teamCandidates?.length || 0,
            joinings: teamCandidates?.filter(c => c.current_stage === 'joined').length || 0,
          }
        })
      )

      setTeamStats(teamData)
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
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
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">System Administration</h1>
          <p className="text-gray-600">Manage teams, users, and system settings</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="kpi-card text-center">
            <div className="kpi-title">Total Teams</div>
            <div className="kpi-value">{stats.totalTeams}</div>
          </div>

          <div className="kpi-card text-center">
            <div className="kpi-title">Total Users</div>
            <div className="kpi-value">{stats.totalUsers}</div>
            <div className="text-xs text-gray-500">{stats.activeUsers} active</div>
          </div>

          <div className="kpi-card text-center">
            <div className="kpi-title">Total Clients</div>
            <div className="kpi-value">{stats.totalClients}</div>
          </div>

          <div className="kpi-card kpi-success text-center">
            <div className="kpi-title">Open Jobs</div>
            <div className="kpi-value">{stats.openJobs}</div>
            <div className="text-xs text-gray-500">of {stats.totalJobs} total</div>
          </div>

          <div className="kpi-card text-center">
            <div className="kpi-title">Total Candidates</div>
            <div className="kpi-value">{stats.totalCandidates}</div>
          </div>

          <div className="kpi-card kpi-warning text-center">
            <div className="kpi-title">This Month Joinings</div>
            <div className="kpi-value">{stats.thisMonthJoinings}</div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button
              onClick={() => router.push('/admin/teams')}
              className="p-4 bg-blue-50 hover:bg-blue-100 rounded-lg text-center transition"
            >
              <div className="text-3xl mb-2">👥</div>
              <div className="font-medium text-blue-900">Manage Teams</div>
            </button>
            <button
              onClick={() => router.push('/admin/users')}
              className="p-4 bg-purple-50 hover:bg-purple-100 rounded-lg text-center transition"
            >
              <div className="text-3xl mb-2">👤</div>
              <div className="font-medium text-purple-900">Manage Users</div>
            </button>
            <button
              onClick={() => router.push('/tl/clients')}
              className="p-4 bg-green-50 hover:bg-green-100 rounded-lg text-center transition"
            >
              <div className="text-3xl mb-2">🏢</div>
              <div className="font-medium text-green-900">Manage Clients</div>
            </button>
            <button
              onClick={() => router.push('/admin/jobs')}
              className="p-4 bg-orange-50 hover:bg-orange-100 rounded-lg text-center transition"
            >
              <div className="text-3xl mb-2">💼</div>
              <div className="font-medium text-orange-900">View All Jobs</div>
            </button>
          </div>
        </div>

        {/* Team Performance */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">
            Team Performance Overview
          </h3>
          
          {teamStats.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No teams found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Team Name</th>
                    <th>Users</th>
                    <th>Active Jobs</th>
                    <th>Total Candidates</th>
                    <th>Joinings</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {teamStats.map(team => (
                    <tr key={team.id}>
                      <td className="font-medium text-gray-900">{team.name}</td>
                      <td>{team.userCount}</td>
                      <td>{team.jobCount}</td>
                      <td>{team.candidateCount}</td>
                      <td>
                        <span className="font-bold text-green-600">
                          {team.joinings}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => router.push(`/admin/teams`)}
                          className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}