// app/tl/dashboard/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function TLDashboard() {
  const [teamStats, setTeamStats] = useState({
    totalCandidates: 0,
    teamMembers: 0,
    thisMonthJoinings: 0,
  })

  useEffect(() => {
    loadTeamStats()
  }, [])

  const loadTeamStats = async () => {
    const userData = JSON.parse(localStorage.getItem('user') || '{}')
    
    // Get team candidates count
    const { data: candidates } = await supabase
      .from('candidates')
      .select('id, date_joined')
      .eq('team_id', userData.team_id)

    // Get team members count
    const { data: members } = await supabase
      .from('users')
      .select('id')
      .eq('team_id', userData.team_id)
      .eq('role', 'recruiter')

    const thisMonth = new Date().toISOString().slice(0, 7) // YYYY-MM
    const thisMonthJoinings = candidates?.filter(c => 
      c.date_joined?.startsWith(thisMonth)
    ).length || 0

    setTeamStats({
      totalCandidates: candidates?.length || 0,
      teamMembers: members?.length || 0,
      thisMonthJoinings,
    })
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Team Dashboard
          </h2>
          <p className="text-gray-600">Manage and monitor your team's performance</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border-2 border-blue-200 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600">Team Members</p>
            <p className="text-4xl font-bold text-blue-600 mt-2">
              {teamStats.teamMembers}
            </p>
          </div>
          <div className="bg-white border-2 border-purple-200 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600">Total Pipeline</p>
            <p className="text-4xl font-bold text-purple-600 mt-2">
              {teamStats.totalCandidates}
            </p>
          </div>
          <div className="bg-white border-2 border-green-200 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600">Joined This Month</p>
            <p className="text-4xl font-bold text-green-600 mt-2">
              {teamStats.thisMonthJoinings}
            </p>
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <p className="text-yellow-800 font-medium">
            📊 Team member performance, reassignment tools, and analytics coming in Week 3!
          </p>
        </div>
      </div>
    </DashboardLayout>
  )
}