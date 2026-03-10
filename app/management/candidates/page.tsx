// app/management/candidates/page.tsx
'use client'
export const dynamic = 'force-dynamic'
import { Suspense, useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { useRouter } from 'next/navigation'
import { supabase as supabaseAdmin } from '@/lib/supabase'

function CandidatesTable() {
  const router = useRouter()
  const [candidates, setCandidates]           = useState<any[]>([])
  const [loading, setLoading]                 = useState(true)
  const [stageFilter, setStageFilter]         = useState('all')
  const [searchQuery, setSearchQuery]         = useState('')
  const [recruiterFilter, setRecruiterFilter] = useState('all')
  const [teamFilter, setTeamFilter]           = useState('all')
  const [user, setUser]                       = useState<any>(null)
  const [teamMembers, setTeamMembers]         = useState<any[]>([])
  const [teams, setTeams]                     = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) { router.push('/'); return }
    const parsedUser = JSON.parse(userData)
    if (!['ceo', 'ops_head', 'finance_head', 'system_admin'].includes(parsedUser.role)) {
      alert('Access denied. Management only.'); router.push('/'); return
    }
    setUser(parsedUser)
    loadTeamMembers()
  }, [])

  useEffect(() => {
    if (teamMembers.length > 0) loadCandidates()
  }, [teamMembers, stageFilter, searchQuery, recruiterFilter, teamFilter])

  const loadTeamMembers = async () => {
    try {
      const { data: allUsers } = await supabaseAdmin
        .from('users')
        .select('id, full_name, role, reports_to')
        .in('role', ['sr_team_leader', 'team_leader', 'recruiter'])
        .eq('is_active', true)

      const uMap: Record<string, any> = {}
      ;(allUsers || []).forEach((u: any) => { uMap[u.id] = u })

      const resolveTeamHead = (userId: string): string => {
        const u = uMap[userId]
        if (!u) return '—'
        if (!u.reports_to) return u.full_name
        const parent = uMap[u.reports_to]
        if (!parent) return u.full_name
        if (!parent.reports_to) return parent.full_name
        const grandparent = uMap[parent.reports_to]
        return grandparent ? grandparent.full_name : parent.full_name
      }

      const members = (allUsers || []).map((u: any) => ({
        ...u,
        _teamHead: resolveTeamHead(u.id),
      }))

      setTeamMembers(members)

      const uniqueTeams = [...new Map(
        members.map((m: any) => [m._teamHead, { id: m._teamHead, name: m._teamHead }])
      ).values()]
      setTeams(uniqueTeams)
    } catch (err) {
      console.error('Error loading team members:', err)
      setTeamMembers([])
    }
  }

  const loadCandidates = async () => {
    setLoading(true)
    try {
      let scopedIds = teamMembers.map((m: any) => m.id)
      if (teamFilter !== 'all') {
        scopedIds = teamMembers.filter((m: any) => m._teamHead === teamFilter).map((m: any) => m.id)
      }
      if (recruiterFilter !== 'all') {
        scopedIds = [recruiterFilter]
      }
      if (scopedIds.length === 0) { setCandidates([]); setLoading(false); return }

      let query = supabaseAdmin
        .from('candidates')
        .select(`
          *,
          jobs ( job_title, job_code, clients ( company_name ) ),
          users:assigned_to ( full_name, role )
        `)
        .in('assigned_to', scopedIds)
        .order('created_at', { ascending: false })

      if (stageFilter !== 'all') query = query.eq('current_stage', stageFilter)
      if (searchQuery) {
        query = query.or(`full_name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
      }

      const { data, error } = await query
      if (error) throw error
      setCandidates(data || [])
    } catch (err) {
      console.error('Error loading candidates:', err)
    } finally {
      setLoading(false)
    }
  }

  const getStageBadge = (stage: string) => {
    const map: Record<string, string> = {
      sourced:             'bg-gray-100 text-gray-800',
      screening:           'bg-yellow-100 text-yellow-800',
      interview_scheduled: 'bg-blue-100 text-blue-800',
      interview_completed: 'bg-purple-100 text-purple-800',
      shortlisted:         'bg-cyan-100 text-cyan-800',
      offer_sent:          'bg-indigo-100 text-indigo-800',
      offer_extended:      'bg-orange-100 text-orange-800',
      offer_accepted:      'bg-green-100 text-green-800',
      negotiation:         'bg-amber-100 text-amber-800',
      joined:              'bg-green-600 text-white',
      rejected:            'bg-red-100 text-red-800',
      dropped:             'bg-gray-200 text-gray-600',
      on_hold:             'bg-gray-100 text-gray-700',
      renege:              'bg-orange-100 text-orange-700',
    }
    return map[stage] || 'bg-gray-100 text-gray-700'
  }

  const STAGES = [
    'sourced', 'screening', 'interview_scheduled', 'interview_completed',
    'shortlisted', 'offer_sent', 'offer_extended', 'offer_accepted',
    'negotiation', 'joined', 'rejected', 'dropped', 'on_hold', 'renege',
  ]

  if (!user) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
    </div>
  )

  const activeCount   = candidates.filter(c => !['rejected', 'dropped', 'joined', 'renege'].includes(c.current_stage)).length
  const joinedCount   = candidates.filter(c => c.current_stage === 'joined').length
  const rejectedCount = candidates.filter(c => c.current_stage === 'rejected').length

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-700 to-blue-700 rounded-xl p-6 text-white flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-1">👥 All Candidates</h1>
          <p className="text-indigo-200">
            Company-wide pipeline · {teamMembers.length} recruiters · {teams.length} teams
          </p>
        </div>
        <button
          onClick={() => router.push('/management/candidates/add')}
          className="px-4 py-2 bg-white text-indigo-700 font-semibold rounded-lg hover:bg-indigo-50 transition text-sm">
          + Add Candidate
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total',    value: candidates.length, color: 'text-gray-900'  },
          { label: 'Active',   value: activeCount,       color: 'text-blue-700'  },
          { label: 'Joined',   value: joinedCount,       color: 'text-green-700' },
          { label: 'Rejected', value: rejectedCount,     color: 'text-red-600'   },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
            <div className="text-xs text-gray-500 mb-1">{label}</div>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Search</label>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Name, phone, email…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Team</label>
            <select
              value={teamFilter}
              onChange={e => setTeamFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
              <option value="all">All Teams ({teams.length})</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.name}&apos;s Team</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Stage</label>
            <select
              value={stageFilter}
              onChange={e => setStageFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
              <option value="all">All Stages</option>
              {STAGES.map(s => (
                <option key={s} value={s}>
                  {s.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Recruiter</label>
            <select
              value={recruiterFilter}
              onChange={e => setRecruiterFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
              <option value="all">All Recruiters</option>
              {teamMembers
                .filter((m: any) => m.role === 'recruiter')
                .map((m: any) => (
                  <option key={m.id} value={m.id}>{m.full_name}</option>
                ))}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3">
          <span className="text-sm text-gray-500">
            Showing <strong>{candidates.length}</strong> candidates
          </span>
          {(teamFilter !== 'all' || stageFilter !== 'all' || searchQuery || recruiterFilter !== 'all') && (
            <button
              onClick={() => {
                setTeamFilter('all')
                setStageFilter('all')
                setSearchQuery('')
                setRecruiterFilter('all')
              }}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
              ✕ Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto" />
          <p className="mt-4 text-gray-500 text-sm">Loading candidates…</p>
        </div>
      ) : candidates.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="text-5xl mb-3">👥</div>
          <p className="text-gray-500 font-medium">No candidates found</p>
          <p className="text-sm text-gray-400 mt-1">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Candidate', 'Job / Client', 'Stage', 'CTC', 'Assigned To', 'Team', 'Days', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {candidates.map(c => {
                const member = teamMembers.find((m: any) => m.id === c.assigned_to)
                const teamHead = member?._teamHead || '—'
                const days = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000)
                const daysColor = days > 30 ? 'text-red-600' : days > 14 ? 'text-orange-500' : 'text-gray-700'
                return (
                  <tr
                    key={c.id}
                    className="hover:bg-gray-50 transition cursor-pointer"
                    onClick={() => router.push(`/management/candidates/${c.id}`)}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{c.full_name}</div>
                      <div className="text-xs text-gray-500">{c.phone}</div>
                      {c.email && (
                        <div className="text-xs text-gray-400 truncate max-w-[160px]">{c.email}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{c.jobs?.job_title || '—'}</div>
                      <div className="text-xs text-gray-500">{c.jobs?.clients?.company_name || '—'}</div>
                      {c.jobs?.job_code && (
                        <div className="text-xs text-gray-400">{c.jobs.job_code}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getStageBadge(c.current_stage)}`}>
                        {c.current_stage?.replace(/_/g, ' ').toUpperCase() || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {c.expected_ctc ? `₹${c.expected_ctc}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{c.users?.full_name || '—'}</div>
                      <div className="text-xs text-gray-500 capitalize">
                        {c.users?.role?.replace(/_/g, ' ')}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{teamHead}&apos;s Team</td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${daysColor}`}>{days}d</span>
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => router.push(`/management/candidates/${c.id}`)}
                        className="text-indigo-600 hover:text-indigo-800 font-medium text-xs">
                        View →
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function ManagementCandidatesPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
        </div>
      }>
        <CandidatesTable />
      </Suspense>
    </DashboardLayout>
  )
}
