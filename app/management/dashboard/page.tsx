// app/management/dashboard/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function ManagementDashboard() {
  const [companyStats, setCompanyStats] = useState({
    totalCandidates: 0,
    totalRecruiters: 0,
    totalRevenue: 0,
    thisMonthJoinings: 0,
  })

  useEffect(() => {
    loadCompanyStats()
  }, [])

  const loadCompanyStats = async () => {
    // All candidates
    const { data: candidates } = await supabase
      .from('candidates')
      .select('date_joined, revenue_generated')

    // All recruiters
    const { data: recruiters } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'recruiter')

    const thisMonth = new Date().toISOString().slice(0, 7)
    const thisMonthJoinings = candidates?.filter(c => 
      c.date_joined?.startsWith(thisMonth)
    ).length || 0

    const totalRevenue = candidates?.reduce((sum, c) => 
      sum + (c.revenue_generated || 0), 0
    ) || 0

    setCompanyStats({
      totalCandidates: candidates?.length || 0,
      totalRecruiters: recruiters?.length || 0,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      thisMonthJoinings,
    })
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Management Dashboard
          </h2>
          <p className="text-gray-600">Company-wide overview and analytics</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-lg p-6">
            <p className="text-sm font-medium opacity-90">Total Candidates</p>
            <p className="text-4xl font-bold mt-2">{companyStats.totalCandidates}</p>
          </div>
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-lg p-6">
            <p className="text-sm font-medium opacity-90">Recruiters</p>
            <p className="text-4xl font-bold mt-2">{companyStats.totalRecruiters}</p>
          </div>
          <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-lg p-6">
            <p className="text-sm font-medium opacity-90">Joined This Month</p>
            <p className="text-4xl font-bold mt-2">{companyStats.thisMonthJoinings}</p>
          </div>
          <div className="bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-lg p-6">
            <p className="text-sm font-medium opacity-90">Total Revenue</p>
            <p className="text-4xl font-bold mt-2">₹{companyStats.totalRevenue}L</p>
          </div>
        </div>

        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-6 text-center">
          <p className="text-indigo-800 font-medium">
            📊 Team comparisons, revenue analytics, and detailed reports coming in Week 3!
          </p>
        </div>
      </div>
    </DashboardLayout>
  )
}