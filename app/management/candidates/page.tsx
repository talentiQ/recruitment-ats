// app/management/candidates/page.tsx
'use client'
export const dynamic = 'force-dynamic'

import { Suspense, useState, useEffect, useCallback } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { useRouter } from 'next/navigation'
import { supabase as supabaseAdmin } from '@/lib/supabase'
import {
  PIPELINE_STAGES,
  getStageLabel,
  isActiveStage,
  isRejectedStage,
} from '@/lib/pipelineStages'

const PAGE_SIZE = 50

// ── Bulk Stage Modal ──────────────────────────────────────────────────────────
function BulkStageModal({
  selectedCount, onClose, onSubmit, submitting,
}: {
  selectedCount: number
  onClose: () => void
  onSubmit: (stage: string) => void
  submitting: boolean
}) {
  const [selectedStage, setSelectedStage] = useState('')

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 460,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden',
      }}>
        <div style={{
          background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
          padding: '18px 24px', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>📋 Update CV Feedback</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>
              Move {selectedCount} candidate{selectedCount !== 1 ? 's' : ''} to a new stage
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
            width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>
        <div style={{ padding: '20px 24px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>
            Select Stage <span style={{ color: '#dc2626' }}>*</span>
          </div>
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 5,
            maxHeight: 340, overflowY: 'auto', paddingRight: 4,
          }}>
            {PIPELINE_STAGES.map(stage => (
              <button
                key={stage}
                onClick={() => setSelectedStage(stage)}
                style={{
                  padding: '9px 14px', borderRadius: 8, cursor: 'pointer',
                  fontSize: 13, fontWeight: 600, textAlign: 'left', fontFamily: 'inherit',
                  border: selectedStage === stage ? '2px solid #4f46e5' : '2px solid #e5e7eb',
                  background: selectedStage === stage ? '#eff6ff' : '#f9fafb',
                  color: selectedStage === stage ? '#4f46e5' : '#374151',
                  transition: 'all 0.12s',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: selectedStage === stage ? '#4f46e5' : '#d1d5db',
                  transition: 'background 0.12s',
                }} />
                {getStageLabel(stage)}
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding: '16px 24px 24px' }}>
          <div style={{
            background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8,
            padding: '9px 13px', fontSize: 12, color: '#1e40af', marginBottom: 16,
          }}>
            ℹ️ Updates <strong>current_stage</strong> for all {selectedCount} selected candidates at once.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{
              padding: '10px 20px', borderRadius: 8, border: '1.5px solid #e5e7eb',
              background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600,
              color: '#374151', fontFamily: 'inherit',
            }}>Cancel</button>
            <button
              onClick={() => onSubmit(selectedStage)}
              disabled={!selectedStage || submitting}
              style={{
                padding: '10px 24px', borderRadius: 8, border: 'none',
                background: !selectedStage || submitting ? '#a5b4fc' : '#4f46e5',
                color: '#fff',
                cursor: !selectedStage || submitting ? 'not-allowed' : 'pointer',
                fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              {submitting ? (
                <>
                  <span style={{
                    width: 13, height: 13,
                    border: '2px solid rgba(255,255,255,0.4)',
                    borderTopColor: '#fff', borderRadius: '50%',
                    display: 'inline-block', animation: 'spin 0.7s linear infinite',
                  }} />
                  Updating…
                </>
              ) : `Update ${selectedCount} Candidate${selectedCount !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ── Inner Table Component ─────────────────────────────────────────────────────
function CandidatesTable() {
  const router = useRouter()

  // Table data
  const [candidates, setCandidates]           = useState<any[]>([])
  const [loading, setLoading]                 = useState(true)
  const [page, setPage]                       = useState(0)       // 0-indexed
  const [totalRows, setTotalRows]             = useState(0)

  // Filters
  const [stageFilter, setStageFilter]         = useState('all')
  const [searchQuery, setSearchQuery]         = useState('')
  const [recruiterFilter, setRecruiterFilter] = useState('all')
  const [teamFilter, setTeamFilter]           = useState('all')
  const [daysFilter, setDaysFilter]           = useState('all')

  // User / team
  const [user, setUser]                       = useState<any>(null)
  const [teamMembers, setTeamMembers]         = useState<any[]>([])
  const [teams, setTeams]                     = useState<{ id: string; name: string }[]>([])

  // Client filter
  const [clientFilter, setClientFilter]       = useState('all')
  const [clients, setClients]                 = useState<{ id: string; name: string }[]>([])

  // True KPI counts (from DB, not filtered slice)
  const [kpiCounts, setKpiCounts]             = useState({ total: 0, active: 0, joined: 0, rejected: 0 })
  const [kpiLoading, setKpiLoading]           = useState(true)

  // Bulk
  const [selectedIds, setSelectedIds]         = useState<Set<string>>(new Set())
  const [showBulkModal, setShowBulkModal]     = useState(false)
  const [bulkSubmitting, setBulkSubmitting]   = useState(false)
  const [bulkSuccess, setBulkSuccess]         = useState('')

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) { router.push('/'); return }
    const parsedUser = JSON.parse(userData)
    if (!['ceo', 'ops_head', 'finance_head', 'system_admin', 'management'].includes(parsedUser.role)) {
      alert('Access denied. Management only.'); router.push('/'); return
    }
    setUser(parsedUser)
    loadTeamMembers()
    loadClients()
  }, [])

  // Reset page when filters change
  useEffect(() => { setPage(0) }, [stageFilter, searchQuery, recruiterFilter, teamFilter, daysFilter, clientFilter])

  useEffect(() => {
    if (teamMembers.length > 0) {
      loadCandidates()
      loadKpiCounts()
    }
  }, [teamMembers, stageFilter, searchQuery, recruiterFilter, teamFilter, daysFilter, clientFilter, page])

  const loadClients = async () => {
    try {
      const { data } = await supabaseAdmin
        .from('clients')
        .select('id, company_name')
        .order('company_name', { ascending: true })
      setClients((data || []).map((c: any) => ({ id: c.id, name: c.company_name })))
    } catch (err) {
      console.error('Error loading clients:', err)
    }
  }

  const loadTeamMembers = async () => {
    try {
      // Include active users + those who left this FY — so exited recruiter candidates appear
      const fyStart = (() => {
        const now = new Date(); const m = now.getMonth() + 1
        return `${m >= 4 ? now.getFullYear() : now.getFullYear() - 1}-04-01`
      })()

      const { data: allUsers } = await supabaseAdmin
        .from('users')
        .select('id, full_name, role, reports_to')
        .in('role', ['sr_team_leader', 'team_leader', 'recruiter'])
        .or(`is_active.eq.true,last_working_date.gte.${fyStart}`)

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
        ...u, _teamHead: resolveTeamHead(u.id),
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

  // Build the team_id list for team/recruiter scoping
  // After DB migration, candidates have team_id directly so we don't need
  // to go through assigned_to → users for team filtering.
  const buildTeamScope = useCallback((): {
    useTeamId: boolean; teamIds: string[] | null; scopedIds: string[] | null
  } => {
    // If a specific recruiter is selected, still filter by assigned_to
    if (recruiterFilter !== 'all') {
      return { useTeamId: false, teamIds: null, scopedIds: [recruiterFilter] }
    }
    // If a team (Sr-TL) is selected, get the team_id of members in that group
    if (teamFilter !== 'all') {
      const ids = teamMembers.filter((m: any) => m._teamHead === teamFilter).map((m: any) => m.id)
      return { useTeamId: false, teamIds: null, scopedIds: ids }
    }
    // No filter — use all team members (active + exited FY), scoped by assigned_to
    const allIds = teamMembers.map((m: any) => m.id)
    return { useTeamId: false, teamIds: null, scopedIds: allIds }
  }, [teamMembers, teamFilter, recruiterFilter])

  // Keep buildScopedIds for backward compat with getClientJobIds
  const buildScopedIds = useCallback(() => {
    const { scopedIds } = buildTeamScope()
    return scopedIds || teamMembers.map((m: any) => m.id)
  }, [buildTeamScope, teamMembers])

  // Returns job IDs for the selected client (null = no filter)
  const getClientJobIds = useCallback(async (): Promise<string[] | null> => {
    if (clientFilter === 'all') return null
    const { data } = await supabaseAdmin
      .from('jobs')
      .select('id')
      .eq('client_id', clientFilter)
    return (data || []).map((j: any) => j.id)
  }, [clientFilter])

  // ── TRUE KPI COUNTS via separate count queries ───────────────────────────
  const loadKpiCounts = async () => {
    setKpiLoading(true)
    try {
      const scopedIds = buildScopedIds()
      if (scopedIds.length === 0) {
        setKpiCounts({ total: 0, active: 0, joined: 0, rejected: 0 })
        setKpiLoading(false)
        return
      }

      const clientJobIds = await getClientJobIds()

      const activeStages   = ['sourced','screening','interview_scheduled','interview_completed','documentation','offer_extended','offer_accepted']
      const rejectedStages = ['screening_rejected','interview_rejected','offer_rejected','renege']

      const applyClientFilter = (q: any) =>
        clientJobIds ? q.in('job_id', clientJobIds.length > 0 ? clientJobIds : ['__none__']) : q

      // Use assigned_to (includes inactive — they're already in scopedIds via FY filter)
      const [totalRes, activeRes, joinedRes, rejectedRes] = await Promise.all([
        applyClientFilter(supabaseAdmin.from('candidates').select('id', { count: 'exact', head: true }).in('assigned_to', scopedIds)),
        applyClientFilter(supabaseAdmin.from('candidates').select('id', { count: 'exact', head: true }).in('assigned_to', scopedIds).in('current_stage', activeStages)),
        applyClientFilter(supabaseAdmin.from('candidates').select('id', { count: 'exact', head: true }).in('assigned_to', scopedIds).eq('current_stage', 'joined')),
        applyClientFilter(supabaseAdmin.from('candidates').select('id', { count: 'exact', head: true }).in('assigned_to', scopedIds).in('current_stage', rejectedStages)),
      ])

      setKpiCounts({
        total:    totalRes.count    ?? 0,
        active:   activeRes.count   ?? 0,
        joined:   joinedRes.count   ?? 0,
        rejected: rejectedRes.count ?? 0,
      })
    } catch (err) {
      console.error('KPI count error:', err)
    } finally {
      setKpiLoading(false)
    }
  }

  // ── PAGINATED TABLE DATA ─────────────────────────────────────────────────
  const loadCandidates = async () => {
    setLoading(true)
    try {
      const scopedIds = buildScopedIds()
      if (scopedIds.length === 0) { setCandidates([]); setTotalRows(0); setLoading(false); return }

      const clientJobIds = await getClientJobIds()
      if (clientJobIds !== null && clientJobIds.length === 0) {
        setCandidates([]); setTotalRows(0); setLoading(false); return
      }

      const from = page * PAGE_SIZE
      const to   = from + PAGE_SIZE - 1

      let query = supabaseAdmin
        .from('candidates')
        .select(`
          *,
          jobs ( job_title, job_code, clients ( company_name ) ),
          users:assigned_to ( full_name, role )
        `, { count: 'exact' })
        .in('assigned_to', scopedIds)   // scopedIds now includes exited recruiters
        .order('created_at', { ascending: false })
        .range(from, to)

      if (clientJobIds !== null) query = query.in('job_id', clientJobIds)
      if (stageFilter !== 'all') query = query.eq('current_stage', stageFilter)
      if (searchQuery) {
        query = query.or(`full_name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
      }
      if (daysFilter !== 'all') {
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - parseInt(daysFilter))
        query = query.lte('created_at', cutoff.toISOString())
      }

      const { data, error, count } = await query
      if (error) throw error
      setCandidates(data || [])
      setTotalRows(count ?? 0)
      setSelectedIds(new Set())
    } catch (err) {
      console.error('Error loading candidates:', err)
    } finally {
      setLoading(false)
    }
  }

  // Selection helpers
  const allVisibleIds = candidates.map(c => c.id)
  const allSelected   = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.has(id))
  const someSelected  = allVisibleIds.some(id => selectedIds.has(id)) && !allSelected

  const toggleAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(allVisibleIds))

  const toggleOne = (id: string) =>
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const handleBulkUpdate = async (stage: string) => {
    setBulkSubmitting(true)
    try {
      const { error } = await supabaseAdmin
        .from('candidates')
        .update({ current_stage: stage })
        .in('id', Array.from(selectedIds))
      if (error) throw error
      setBulkSuccess(
        `✅ Moved ${selectedIds.size} candidate${selectedIds.size !== 1 ? 's' : ''} to "${getStageLabel(stage)}"`
      )
      setShowBulkModal(false)
      setSelectedIds(new Set())
      setTimeout(() => setBulkSuccess(''), 4000)
      await Promise.all([loadCandidates(), loadKpiCounts()])
    } catch (err) {
      console.error(err)
      alert('Failed to update. Please try again.')
    } finally {
      setBulkSubmitting(false)
    }
  }

  const getStageBadgeLocal = (stage: string) => {
    const map: Record<string, string> = {
      sourced:              'bg-gray-100 text-gray-800',
      screening:            'bg-yellow-100 text-yellow-800',
      screening_rejected:   'bg-orange-100 text-orange-800',
      interview_scheduled:  'bg-blue-100 text-blue-800',
      interview_completed:  'bg-purple-100 text-purple-800',
      interview_rejected:   'bg-red-200 text-red-800',
      documentation:        'bg-cyan-100 text-cyan-800',
      offer_extended:       'bg-orange-100 text-orange-800',
      offer_accepted:       'bg-green-100 text-green-800',
      offer_rejected:       'bg-rose-100 text-rose-800',
      joined:               'bg-green-600 text-white',
      renege:               'bg-orange-100 text-orange-700',
      on_hold:              'bg-gray-100 text-gray-700',
    }
    return map[stage] || 'bg-gray-100 text-gray-700'
  }

  const DAYS_OPTIONS = [
    { value: 'all', label: 'Any Duration' },
    { value: '7',   label: '7+ Days Old'  },
    { value: '15',  label: '15+ Days Old' },
    { value: '21',  label: '21+ Days Old' },
    { value: '30',  label: '30+ Days Old' },
  ]

  const totalPages    = Math.ceil(totalRows / PAGE_SIZE)
  const hasActiveFilter = teamFilter !== 'all' || stageFilter !== 'all' ||
    searchQuery || recruiterFilter !== 'all' || daysFilter !== 'all' || clientFilter !== 'all'

  if (!user) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
    </div>
  )

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
          className="px-4 py-2 bg-white text-indigo-700 font-semibold rounded-lg hover:bg-indigo-50 transition text-sm"
        >
          + Add Candidate
        </button>
      </div>

      {/* Bulk success toast */}
      {bulkSuccess && (
        <div style={{
          background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
          padding: '12px 18px', fontSize: 14, fontWeight: 600, color: '#15803d',
        }}>
          {bulkSuccess}
        </div>
      )}

      {/* KPI Strip — counts from DB, not from current page */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total',    value: kpiCounts.total,    color: 'text-gray-900'  },
          { label: 'Active',   value: kpiCounts.active,   color: 'text-blue-700'  },
          { label: 'Joined',   value: kpiCounts.joined,   color: 'text-green-700' },
          { label: 'Rejected', value: kpiCounts.rejected, color: 'text-red-600'   },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
            <div className="text-xs text-gray-500 mb-1">{label}</div>
            <div className={`text-2xl font-bold ${color}`}>
              {kpiLoading ? (
                <span className="inline-block w-8 h-6 bg-gray-100 rounded animate-pulse" />
              ) : value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Search</label>
            <input
              type="text" value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Name, phone, email…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Client</label>
            <select
              value={clientFilter} onChange={e => setClientFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
            >
              <option value="all">All Clients ({clients.length})</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Team</label>
            <select
              value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
            >
              <option value="all">All Teams ({teams.length})</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.name}&apos;s Team</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Stage</label>
            <select
              value={stageFilter} onChange={e => setStageFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
            >
              <option value="all">All Stages</option>
              {PIPELINE_STAGES.map(s => (
                <option key={s} value={s}>{getStageLabel(s)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Recruiter</label>
            <select
              value={recruiterFilter} onChange={e => setRecruiterFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
            >
              <option value="all">All Recruiters</option>
              {teamMembers
                .filter((m: any) => m.role === 'recruiter')
                .map((m: any) => (
                  <option key={m.id} value={m.id}>{m.full_name}</option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Days in Pipeline</label>
            <select
              value={daysFilter} onChange={e => setDaysFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
            >
              {DAYS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between mt-3">
          <span className="text-sm text-gray-500">
            Showing <strong>{((page * PAGE_SIZE) + 1).toLocaleString()}–{Math.min((page + 1) * PAGE_SIZE, totalRows).toLocaleString()}</strong> of <strong>{totalRows.toLocaleString()}</strong> candidates
            {selectedIds.size > 0 && (
              <span className="ml-2 text-indigo-600 font-semibold">· {selectedIds.size} selected</span>
            )}
          </span>
          {hasActiveFilter && (
            <button
              onClick={() => {
                setTeamFilter('all'); setStageFilter('all')
                setSearchQuery(''); setRecruiterFilter('all')
                setDaysFilter('all'); setClientFilter('all')
              }}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              ✕ Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div style={{
          position: 'sticky', top: 16, zIndex: 100,
          background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
          borderRadius: 12, padding: '12px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 8px 24px rgba(79,70,229,0.35)',
        }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>
            ✓ {selectedIds.size} candidate{selectedIds.size !== 1 ? 's' : ''} selected
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setSelectedIds(new Set())} style={{
              padding: '7px 16px', borderRadius: 8,
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
              color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
            }}>Clear</button>
            <button onClick={() => setShowBulkModal(true)} style={{
              padding: '7px 20px', borderRadius: 8, background: '#fff', border: 'none',
              color: '#4f46e5', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
            }}>📋 Update CV Feedback</button>
          </div>
        </div>
      )}

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
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected }}
                    onChange={toggleAll}
                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#4f46e5' }}
                    title="Select all"
                  />
                </th>
                {['Candidate','Job / Client','Stage','CTC','Assigned To','Team','Days','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {candidates.map(c => {
                const member     = teamMembers.find((m: any) => m.id === c.assigned_to)
                const teamHead   = member?._teamHead || '—'
                const days       = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000)
                const daysColor  = days > 30 ? 'text-red-600' : days > 14 ? 'text-orange-500' : 'text-gray-700'
                const isSelected = selectedIds.has(c.id)

                return (
                  <tr
                    key={c.id}
                    className="hover:bg-gray-50 transition"
                    style={{ background: isSelected ? '#eef2ff' : undefined }}
                  >
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(c.id)}
                        style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#4f46e5' }}
                      />
                    </td>
                    <td className="px-4 py-3 cursor-pointer" onClick={() => router.push(`/management/candidates/${c.id}`)}>
                      <div className="font-semibold text-gray-900">{c.full_name}</div>
                      <div className="text-xs text-gray-500">{c.phone}</div>
                      {c.email && <div className="text-xs text-gray-400 truncate max-w-[160px]">{c.email}</div>}
                    </td>
                    <td className="px-4 py-3 cursor-pointer" onClick={() => router.push(`/management/candidates/${c.id}`)}>
                      <div className="font-medium text-gray-800">{c.jobs?.job_title || '—'}</div>
                      <div className="text-xs text-gray-500">{c.jobs?.clients?.company_name || '—'}</div>
                      {c.jobs?.job_code && <div className="text-xs text-gray-400">{c.jobs.job_code}</div>}
                    </td>
                    <td className="px-4 py-3 cursor-pointer" onClick={() => router.push(`/management/candidates/${c.id}`)}>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getStageBadgeLocal(c.current_stage)}`}>
                        {getStageLabel(c.current_stage)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800 cursor-pointer" onClick={() => router.push(`/management/candidates/${c.id}`)}>
                      {c.expected_ctc ? `₹${c.expected_ctc}` : '—'}
                    </td>
                    <td className="px-4 py-3 cursor-pointer" onClick={() => router.push(`/management/candidates/${c.id}`)}>
                      <div className="font-medium text-gray-800">{c.users?.full_name || '—'}</div>
                      <div className="text-xs text-gray-500 capitalize">{c.users?.role?.replace(/_/g, ' ')}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 cursor-pointer" onClick={() => router.push(`/management/candidates/${c.id}`)}>
                      {teamHead}&apos;s Team
                    </td>
                    <td className="px-4 py-3 cursor-pointer" onClick={() => router.push(`/management/candidates/${c.id}`)}>
                      <span className={`font-semibold ${daysColor}`}>{days}d</span>
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => router.push(`/management/candidates/${c.id}`)}
                        className="text-indigo-600 hover:text-indigo-800 font-medium text-xs"
                      >
                        View →
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
              <span className="text-sm text-gray-500">
                Page <strong>{page + 1}</strong> of <strong>{totalPages}</strong>
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(0)}
                  disabled={page === 0}
                  className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white transition"
                >
                  «
                </button>
                <button
                  onClick={() => setPage(p => p - 1)}
                  disabled={page === 0}
                  className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white transition"
                >
                  ‹ Prev
                </button>
                {/* Page number pills */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNum = Math.max(0, Math.min(page - 2, totalPages - 5)) + i
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                        pageNum === page
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'border-gray-200 hover:bg-white'
                      }`}
                    >
                      {pageNum + 1}
                    </button>
                  )
                })}
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white transition"
                >
                  Next ›
                </button>
                <button
                  onClick={() => setPage(totalPages - 1)}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white transition"
                >
                  »
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bulk modal */}
      {showBulkModal && (
        <BulkStageModal
          selectedCount={selectedIds.size}
          onClose={() => setShowBulkModal(false)}
          onSubmit={handleBulkUpdate}
          submitting={bulkSubmitting}
        />
      )}
    </div>
  )
}

// ── Page wrapper ──────────────────────────────────────────────────────────────
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