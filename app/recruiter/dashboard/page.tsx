// app/recruiter/dashboard/page.tsx
interface LoggedInUser {
  id: string
  team_id: string
  role: string
  full_name?: string
}
'use client'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/DashboardLayout'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export default function RecruiterDashboard() {
  const router = useRouter()
  const [stats, setStats] = useState({
    totalCandidates: 0,
    sourced: 0,
    screening: 0,
    interview: 0,
    offered: 0,
    joined: 0,
  })
  const [loading, setLoading] = useState(true)

  const loadStats = useCallback(async () => {
    try {
      // Guard for SSR
      if (typeof window === 'undefined') return

      let userData = {}
      try {
        userData = JSON.parse(localStorage.getItem('user') || '{}')
      } catch (parseError) {
        console.error('Failed to parse user data:', parseError)
      }

      // Get all candidates assigned to this recruiter
      const { data, error } = await supabase
        .from('candidates')
        .select('current_stage')
        .eq('assigned_to', userData.id)

      if (error) throw error

      // Count by stage
      const stats = {
        totalCandidates: data?.length || 0,
        sourced: data?.filter(c => c.current_stage === 'sourced').length || 0,
        screening: data?.filter(c => c.current_stage === 'screening').length || 0,
        interview: data?.filter(c => ['interview_scheduled', 'interview_completed'].includes(c.current_stage)).length || 0,
        offered: data?.filter(c => ['offer_made', 'offer_accepted'].includes(c.current_stage)).length || 0,
        joined: data?.filter(c => c.current_stage === 'joined').length || 0,
      }

      setStats(stats)
    } catch (error) {
      console.error('Error loading stats:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            My Dashboard
          </h2>
          <p className="text-gray-600">Welcome back! Here's your overview.</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard
            label="Total CVs"
            value={stats.totalCandidates}
            color="blue"
            loading={loading}
          />
          <StatCard
            label="Sourced"
            value={stats.sourced}
            color="gray"
            loading={loading}
          />
          <StatCard
            label="Screening"
            value={stats.screening}
            color="yellow"
            loading={loading}
          />
          <StatCard
            label="Interview"
            value={stats.interview}
            color="purple"
            loading={loading}
          />
          <StatCard
            label="Offered"
            value={stats.offered}
            color="indigo"
            loading={loading}
          />
          <StatCard
            label="Joined"
            value={stats.joined}
            color="green"
            loading={loading}
          />
        </div>

{/* Quick Actions */}
<div className="bg-white rounded-lg shadow p-6">
  <h3 className="text-lg font-semibold text-gray-900 mb-4">
    Quick Actions
  </h3>
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <button 
      onClick={() => router.push('/recruiter/candidates/add')}
      className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
    >
      + Add New Candidate
    </button>
    <button 
      onClick={() => router.push('/recruiter/candidates')}
      className="px-4 py-3 bg-white border-2 border-gray-300 text-gray-700 rounded-lg hover:border-blue-500 transition"
    >
      View My Pipeline
    </button>
    <button className="px-4 py-3 bg-white border-2 border-gray-300 text-gray-700 rounded-lg hover:border-blue-500 transition">
      Schedule Interview
    </button>
  </div>
</div>

        {/* Coming Soon */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <p className="text-blue-800 font-medium">
            📊 Candidate list, performance charts, and more features coming in Week 3!
          </p>
        </div>
      </div>
    </DashboardLayout>
  )
}

function StatCard({
  label,
  value,
  color,
  loading,
}: {
  label: string
  value: number
  color: string
  loading: boolean
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    gray: 'bg-gray-50 text-gray-700 border-gray-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    green: 'bg-green-50 text-green-700 border-green-200',
  }

  return (
    <div className={`${colors[color as keyof typeof colors]} border rounded-lg p-4`}>
      <p className="text-sm font-medium opacity-80">{label}</p>
      <p className="text-3xl font-bold mt-1">
        {loading ? '...' : value}
      </p>
    </div>
  )
}