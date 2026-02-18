// app/recruiter/dashboard/page.tsx - AI-POWERED WITH REALISTIC ACHIEVEMENTS
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function RecruiterDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    total: 0,
    sourced: 0,
    screening: 0,
    interview: 0,
    offered: 0,
    joined: 0,
    thisMonth: 0,
    thisWeek: 0,
    offersAccepted: 0,
  })
  const [monthlyTarget, setMonthlyTarget] = useState<any>(null)
  const [aiPrediction, setAiPrediction] = useState<any>(null)
  const [achievements, setAchievements] = useState<any[]>([])
  const [personalRecords, setPersonalRecords] = useState<any[]>([])
  const [featuredAchievement, setFeaturedAchievement] = useState<any>(null)
  const [recentCandidates, setRecentCandidates] = useState<any[]>([])
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      loadDashboard(parsedUser.id)
    }
  }, [])

  const loadDashboard = async (userId: string) => {
    setLoading(true)
    try {
      await Promise.all([
        loadStats(userId),
        loadMonthlyTarget(userId),
        loadAIPrediction(userId),
        loadAchievements(userId),
        loadPersonalRecords(userId),
        loadRecentCandidates(userId),
      ])
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async (userId: string) => {
    const { data } = await supabase
      .from('candidates')
      .select('current_stage, date_joined, date_sourced')
      .eq('assigned_to', userId)

    if (!data) return

    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    setStats({
      total: data.length,
      sourced: data.filter(c => c.current_stage === 'sourced').length,
      screening: data.filter(c => c.current_stage === 'screening').length,
      interview: data.filter(c => c.current_stage.includes('interview')).length,
      offered: data.filter(c => c.current_stage.includes('offer')).length,
      joined: data.filter(c => c.current_stage === 'joined').length,
      thisMonth: data.filter(c => c.date_joined && new Date(c.date_joined) >= monthStart).length,
      thisWeek: data.filter(c => c.date_sourced && new Date(c.date_sourced) >= weekAgo).length,
      offersAccepted: data.filter(c => c.current_stage === 'offer_accepted').length,
    })
  }

  const loadMonthlyTarget = async (userId: string) => {
    const currentMonth = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    
    const { data } = await supabase
      .from('monthly_targets')
      .select('*')
      .eq('user_id', userId)
      .eq('month_year', currentMonth)
      .single()

    if (data) {
      setMonthlyTarget(data)
    } else {
      // Create default target
      const { data: newTarget } = await supabase
        .from('monthly_targets')
        .insert([{
          user_id: userId,
          month_year: currentMonth,
          target_joinings: 2,
          actual_joinings: stats.thisMonth,
          achievement_percentage: stats.thisMonth > 0 ? (stats.thisMonth / 2 * 100) : 0,
        }])
        .select()
        .single()
      
      if (newTarget) setMonthlyTarget(newTarget)
    }
  }

  const loadAIPrediction = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .rpc('generate_ai_prediction', { recruiter_id: userId })

      if (data && !error) {
        setAiPrediction(data)
        
        // Save prediction
        await supabase.from('ai_predictions').insert([{
          user_id: userId,
          predicted_joinings_this_month: data.predicted_joinings,
          predicted_target_achievement: (data.predicted_joinings / 2 * 100),
          confidence_score: data.confidence,
          factors: data.factors,
        }])
      }
    } catch (error) {
      console.error('AI prediction error:', error)
    }
  }

  const loadAchievements = async (userId: string) => {
    const { data } = await supabase
      .from('recruiter_achievements')
      .select('*')
      .eq('user_id', userId)
      .order('achieved_at', { ascending: false })
      .limit(6)

    if (data) {
      setAchievements(data)
      
      // Pick a random unviewed achievement for motivation
      const unviewed = data.filter(a => !a.is_viewed)
      if (unviewed.length > 0) {
        const random = unviewed[Math.floor(Math.random() * unviewed.length)]
        setFeaturedAchievement(random)
        
        // Mark as viewed
        await supabase
          .from('recruiter_achievements')
          .update({ is_viewed: true })
          .eq('id', random.id)
      } else if (data.length > 0) {
        // All viewed, pick random from all
        const random = data[Math.floor(Math.random() * data.length)]
        setFeaturedAchievement(random)
      }
    }
  }

  const loadPersonalRecords = async (userId: string) => {
    const { data } = await supabase
      .from('personal_records')
      .select('*')
      .eq('user_id', userId)

    if (data) setPersonalRecords(data)
  }

  const loadRecentCandidates = async (userId: string) => {
    const { data } = await supabase
      .from('candidates')
      .select(`
        *,
        jobs (
          job_title,
          job_code,
          clients (company_name)
        )
      `)
      .eq('assigned_to', userId)
      .order('date_sourced', { ascending: false })
      .limit(5)

    if (data) setRecentCandidates(data)
  }

  const getAchievementBadgeStyle = (color: string) => {
    const styles: { [key: string]: string } = {
      gold: 'from-yellow-400 to-yellow-600',
      silver: 'from-gray-300 to-gray-500',
      bronze: 'from-orange-400 to-orange-600',
      blue: 'from-blue-400 to-blue-600',
    }
    return styles[color] || 'from-blue-400 to-blue-600'
  }

  const getProgressColor = (percentage: number) => {
    if (percentage >= 200) return 'bg-purple-600'
    if (percentage >= 150) return 'bg-green-600'
    if (percentage >= 100) return 'bg-blue-600'
    if (percentage >= 75) return 'bg-yellow-600'
    return 'bg-gray-400'
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
        {/* Welcome Section with Featured Achievement */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome back, {user?.full_name?.split(' ')[0]}! 👋
          </h1>
          
          {featuredAchievement && (
            <div className={`inline-block bg-gradient-to-r ${getAchievementBadgeStyle(featuredAchievement.badge_color)} text-white rounded-lg p-6 mt-3 shadow-lg`}>
              <div className="flex items-center gap-4 justify-center">
                <span className="text-5xl">{featuredAchievement.badge_icon}</span>
                <div className="text-left">
                  <div className="text-2xl font-bold">
                    {featuredAchievement.achievement_title}
                  </div>
                  <div className="text-sm opacity-90">
                    {featuredAchievement.achievement_description}
                  </div>
                  {featuredAchievement.month_year && (
                    <div className="text-xs opacity-75 mt-1">
                      {featuredAchievement.month_year}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Monthly Target & AI Prediction */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Monthly Target Progress */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">
              📊 Monthly Target Progress
            </h3>
            
            {monthlyTarget && (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-5xl font-bold text-gray-900 mb-2">
                    {monthlyTarget.actual_joinings} / {monthlyTarget.target_joinings}
                  </div>
                  <div className="text-sm text-gray-600">Joinings this month</div>
                </div>

                {/* Progress Bar */}
                <div className="relative">
                  <div className="w-full bg-gray-200 rounded-full h-6">
                    <div
                      className={`h-6 rounded-full transition-all duration-500 flex items-center justify-center text-white text-sm font-bold ${getProgressColor(monthlyTarget.achievement_percentage)}`}
                      style={{ width: `${Math.min(monthlyTarget.achievement_percentage, 100)}%` }}
                    >
                      {monthlyTarget.achievement_percentage >= 20 && `${Math.round(monthlyTarget.achievement_percentage)}%`}
                    </div>
                  </div>
                  {monthlyTarget.achievement_percentage < 20 && (
                    <div className="text-center mt-1 text-sm font-bold text-gray-700">
                      {Math.round(monthlyTarget.achievement_percentage)}%
                    </div>
                  )}
                </div>

                {/* Achievement Badges */}
                <div className="grid grid-cols-3 gap-2 mt-4">
                  <div className={`text-center p-3 rounded-lg ${monthlyTarget.achievement_percentage >= 100 ? 'bg-blue-100 border-2 border-blue-500' : 'bg-gray-50'}`}>
                    <div className="text-2xl">⭐</div>
                    <div className="text-xs font-bold mt-1">100%</div>
                    <div className="text-xs text-gray-600">Star</div>
                  </div>
                  <div className={`text-center p-3 rounded-lg ${monthlyTarget.achievement_percentage >= 150 ? 'bg-green-100 border-2 border-green-500' : 'bg-gray-50'}`}>
                    <div className="text-2xl">🚀</div>
                    <div className="text-xs font-bold mt-1">150%</div>
                    <div className="text-xs text-gray-600">Achiever</div>
                  </div>
                  <div className={`text-center p-3 rounded-lg ${monthlyTarget.achievement_percentage >= 200 ? 'bg-purple-100 border-2 border-purple-500' : 'bg-gray-50'}`}>
                    <div className="text-2xl">👑</div>
                    <div className="text-xs font-bold mt-1">200%</div>
                    <div className="text-xs text-gray-600">Legend</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* AI Prediction */}
          <div className="card bg-gradient-to-br from-purple-50 to-blue-50 border-2 border-purple-200">
            <h3 className="text-lg font-semibold text-purple-900 mb-4 text-center">
              🤖 AI-Powered Prediction
            </h3>
            
            {aiPrediction && (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-sm text-purple-700 mb-1">Predicted joinings by month-end</div>
                  <div className="text-5xl font-bold text-purple-900 mb-1">
                    {aiPrediction.predicted_joinings}
                  </div>
                  <div className="text-xs text-purple-600">
                    Confidence: {(aiPrediction.confidence * 100).toFixed(0)}%
                  </div>
                </div>

                <div className="bg-white rounded-lg p-4 space-y-2">
                  <div className="text-sm font-semibold text-gray-900 mb-2">Based on:</div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-purple-50 p-2 rounded">
                      <div className="text-purple-600">Historical Avg</div>
                      <div className="font-bold text-purple-900">{aiPrediction.factors.historical_avg}</div>
                    </div>
                    <div className="bg-blue-50 p-2 rounded">
                      <div className="text-blue-600">Active Pipeline</div>
                      <div className="font-bold text-blue-900">{aiPrediction.factors.active_pipeline}</div>
                    </div>
                    <div className="bg-green-50 p-2 rounded">
                      <div className="text-green-600">Month So Far</div>
                      <div className="font-bold text-green-900">{aiPrediction.factors.current_month_so_far}</div>
                    </div>
                    <div className="bg-orange-50 p-2 rounded">
                      <div className="text-orange-600">Days Left</div>
                      <div className="font-bold text-orange-900">{aiPrediction.factors.days_remaining}</div>
                    </div>
                  </div>
                </div>

                {aiPrediction.predicted_joinings >= monthlyTarget?.target_joinings && (
                  <div className="bg-green-100 border border-green-300 rounded-lg p-3 text-center">
                    <div className="text-sm font-bold text-green-900">
                      🎯 You're on track to hit your target!
                    </div>
                  </div>
                )}
                
                {aiPrediction.predicted_joinings < monthlyTarget?.target_joinings && (
                  <div className="bg-yellow-100 border border-yellow-300 rounded-lg p-3 text-center">
                    <div className="text-sm font-bold text-yellow-900">
                      ⚡ {monthlyTarget.target_joinings - aiPrediction.predicted_joinings} more needed to hit target!
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Personal Records */}
        {personalRecords.length > 0 && (
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">
              🏆 Your Personal Records
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {personalRecords.map(record => (
                <div key={record.id} className="bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-300 rounded-lg p-4 text-center">
                  <div className="text-3xl mb-2">🏆</div>
                  <div className="font-bold text-yellow-900 mb-1">
                    {record.record_type === 'most_joinings_month' && 'Most Joinings in a Month'}
                    {record.record_type === 'fastest_placement' && 'Fastest Placement'}
                    {record.record_type === 'highest_revenue_month' && 'Highest Revenue Month'}
                  </div>
                  <div className="text-2xl font-bold text-yellow-900">
                    {record.record_type === 'fastest_placement' ? `${record.record_value} days` : record.record_value}
                  </div>
                  <div className="text-xs text-yellow-700 mt-1">
                    {record.record_details?.month || new Date(record.achieved_date).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="kpi-card text-center">
            <div className="kpi-title">Total Pipeline</div>
            <div className="kpi-value">{stats.total}</div>
          </div>

          <div className="kpi-card kpi-warning text-center">
            <div className="kpi-title">This Week</div>
            <div className="kpi-value">{stats.thisWeek}</div>
            <div className="text-xs text-gray-500">CVs Sourced</div>
          </div>

          <div className="kpi-card kpi-success text-center">
            <div className="kpi-title">This Month</div>
            <div className="kpi-value">{stats.thisMonth}</div>
            <div className="text-xs text-gray-500">Joinings</div>
          </div>

          <div className="kpi-card text-center">
            <div className="kpi-title">Offers Accepted</div>
            <div className="kpi-value">{stats.offersAccepted}</div>
            <div className="text-xs text-gray-500">Close to join!</div>
            
          </div>
          </div>

        {/* Pipeline Stages */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">
            Pipeline Breakdown
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-700">{stats.sourced}</div>
              <div className="text-xs text-gray-600 mt-1">Sourced</div>
            </div>
            <div className="text-center p-4 bg-yellow-50 rounded-lg">
              <div className="text-2xl font-bold text-yellow-700">{stats.screening}</div>
              <div className="text-xs text-yellow-600 mt-1">Screening</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-700">{stats.interview}</div>
              <div className="text-xs text-purple-600 mt-1">Interview</div>
            </div>
            <div className="text-center p-4 bg-indigo-50 rounded-lg">
              <div className="text-2xl font-bold text-indigo-700">{stats.offered}</div>
              <div className="text-xs text-indigo-600 mt-1">Offered</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-700">{stats.joined}</div>
              <div className="text-xs text-green-600 mt-1">Joined</div>
            </div>
          </div>
        </div>

        {/* Recent Achievements */}
        {achievements.length > 0 && (
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">
              🏅 Recent Achievements
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {achievements.slice(0, 6).map(achievement => (
                <div
                  key={achievement.id}
                  className={`bg-gradient-to-br ${getAchievementBadgeStyle(achievement.badge_color)} text-white rounded-lg p-4 text-center shadow-md`}
                >
                  <div className="text-4xl mb-2">{achievement.badge_icon}</div>
                  <div className="font-bold mb-1 text-sm">
                    {achievement.achievement_title}
                  </div>
                  <div className="text-xs opacity-90">
                    {achievement.achievement_description}
                  </div>
                  {achievement.month_year && (
                    <div className="text-xs opacity-75 mt-2">
                      {achievement.month_year}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Candidates */}
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Recent Candidates
            </h3>
            <button
              onClick={() => router.push('/recruiter/candidates')}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              View All →
            </button>
          </div>

          {recentCandidates.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="mb-3">No candidates yet</p>
              <button
                onClick={() => router.push('/recruiter/candidates/add')}
                className="btn-primary"
              >
                Add Your First Candidate
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {recentCandidates.map(candidate => (
                <div
                  key={candidate.id}
                  onClick={() => router.push(`/recruiter/candidates/${candidate.id}`)}
                  className="p-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm cursor-pointer transition"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">
                        {candidate.full_name}
                      </div>
                      <div className="text-sm text-gray-600">
                        {candidate.jobs?.job_title} • {candidate.jobs?.clients?.company_name}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {candidate.jobs?.job_code}
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      candidate.current_stage === 'joined' ? 'bg-green-100 text-green-700' :
                      candidate.current_stage.includes('interview') ? 'bg-purple-100 text-purple-700' :
                      candidate.current_stage.includes('offer') ? 'bg-indigo-100 text-indigo-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {candidate.current_stage.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button
              onClick={() => router.push('/recruiter/candidates/add')}
              className="p-4 bg-blue-50 hover:bg-blue-100 rounded-lg text-center transition"
            >
              <div className="text-3xl mb-2">➕</div>
              <div className="font-medium text-blue-900">Add Candidate</div>
            </button>
            <button
              onClick={() => router.push('/recruiter/candidates')}
              className="p-4 bg-purple-50 hover:bg-purple-100 rounded-lg text-center transition"
            >
              <div className="text-3xl mb-2">📋</div>
              <div className="font-medium text-purple-900">View Pipeline</div>
            </button>
            <button
              onClick={() => router.push('/recruiter/jobs')}
              className="p-4 bg-green-50 hover:bg-green-100 rounded-lg text-center transition"
            >
              <div className="text-3xl mb-2">💼</div>
              <div className="font-medium text-green-900">My Jobs</div>
            </button>
            <button
              onClick={() => router.push('/recruiter/candidates?stage=interview')}
              className="p-4 bg-orange-50 hover:bg-orange-100 rounded-lg text-center transition"
            >
              <div className="text-3xl mb-2">📅</div>
              <div className="font-medium text-orange-900">Interviews</div>
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}