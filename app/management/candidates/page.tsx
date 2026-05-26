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
} from '@/lib/pipelineStages'

const PAGE_SIZE = 50

function BulkStageModal({
  selectedCount,
  onClose,
  onSubmit,
  submitting,
}: {
  selectedCount: number
  onClose: () => void
  onSubmit: (stage: string) => void
  submitting: boolean
}) {
  const [selectedStage, setSelectedStage] = useState('')

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          width: '100%',
          maxWidth: 460,
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
            padding: '18px 24px',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>
              📋 Update CV Feedback
            </div>
            <div
              style={{
                fontSize: 13,
                color: 'rgba(255,255,255,0.75)',
                marginTop: 2,
              }}
            >
              Move {selectedCount} candidate
              {selectedCount !== 1 ? 's' : ''} to a new stage
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: '#fff',
              width: 32,
              height: 32,
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '20px 24px 0' }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#374151',
              marginBottom: 10,
            }}
          >
            Select Stage <span style={{ color: '#dc2626' }}>*</span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
              maxHeight: 340,
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            {PIPELINE_STAGES.map(stage => (
              <button
                key={stage}
                onClick={() => setSelectedStage(stage)}
                style={{
                  padding: '9px 14px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  border:
                    selectedStage === stage
                      ? '2px solid #4f46e5'
                      : '2px solid #e5e7eb',
                  background:
                    selectedStage === stage ? '#eff6ff' : '#f9fafb',
                  color:
                    selectedStage === stage ? '#4f46e5' : '#374151',
                  transition: 'all 0.12s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background:
                      selectedStage === stage ? '#4f46e5' : '#d1d5db',
                  }}
                />
                {getStageLabel(stage)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: '16px 24px 24px' }}>
          <div
            style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: 8,
              padding: '9px 13px',
              fontSize: 12,
              color: '#1e40af',
              marginBottom: 16,
            }}
          >
            ℹ️ Updates current_stage for all {selectedCount} selected
            candidates.
          </div>

          <div
            style={{
              display: 'flex',
              gap: 10,
              justifyContent: 'flex-end',
            }}
          >
            <button
              onClick={onClose}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: '1.5px solid #e5e7eb',
                background: '#fff',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Cancel
            </button>

            <button
              onClick={() => onSubmit(selectedStage)}
              disabled={!selectedStage || submitting}
              style={{
                padding: '10px 24px',
                borderRadius: 8,
                border: 'none',
                background:
                  !selectedStage || submitting
                    ? '#a5b4fc'
                    : '#4f46e5',
                color: '#fff',
                cursor:
                  !selectedStage || submitting
                    ? 'not-allowed'
                    : 'pointer',
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              {submitting
                ? 'Updating...'
                : `Update ${selectedCount} Candidate${
                    selectedCount !== 1 ? 's' : ''
                  }`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CandidatesTable() {
  const router = useRouter()

  const [candidates, setCandidates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [totalRows, setTotalRows] = useState(0)

  // Filters
  const [stageFilter, setStageFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [recruiterFilter, setRecruiterFilter] = useState('all')
  const [teamFilter, setTeamFilter] = useState('all')
  const [daysFilter, setDaysFilter] = useState('all')

  // NEW CLIENT FILTER
  const [clientFilter, setClientFilter] = useState('all')
  const [clients, setClients] = useState<string[]>([])

  const [user, setUser] = useState<any>(null)
  const [teamMembers, setTeamMembers] = useState<any[]>([])
  const [teams, setTeams] = useState<
    { id: string; name: string }[]
  >([])

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set()
  )

  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkSubmitting, setBulkSubmitting] = useState(false)

  useEffect(() => {
    const userData = localStorage.getItem('user')

    if (!userData) {
      router.push('/')
      return
    }

    const parsedUser = JSON.parse(userData)

    setUser(parsedUser)

    loadTeamMembers()
  }, [])

  // RESET PAGE ON FILTER CHANGE
  useEffect(() => {
    setPage(0)
  }, [
    stageFilter,
    searchQuery,
    recruiterFilter,
    teamFilter,
    daysFilter,
    clientFilter,
  ])

  useEffect(() => {
    if (teamMembers.length > 0) {
      loadCandidates()
    }
  }, [
    teamMembers,
    stageFilter,
    searchQuery,
    recruiterFilter,
    teamFilter,
    daysFilter,
    clientFilter,
    page,
  ])

  const loadTeamMembers = async () => {
    try {
      const { data: allUsers } = await supabaseAdmin
        .from('users')
        .select('id, full_name, role, reports_to')
        .in('role', [
          'sr_team_leader',
          'team_leader',
          'recruiter',
        ])
        .eq('is_active', true)

      const uMap: Record<string, any> = {}

      ;(allUsers || []).forEach((u: any) => {
        uMap[u.id] = u
      })

      const resolveTeamHead = (userId: string): string => {
        const u = uMap[userId]

        if (!u) return '—'
        if (!u.reports_to) return u.full_name

        const parent = uMap[u.reports_to]

        if (!parent) return u.full_name
        if (!parent.reports_to) return parent.full_name

        const grandparent = uMap[parent.reports_to]

        return grandparent
          ? grandparent.full_name
          : parent.full_name
      }

      const members = (allUsers || []).map((u: any) => ({
        ...u,
        _teamHead: resolveTeamHead(u.id),
      }))

      setTeamMembers(members)

      const uniqueTeams = [
        ...new Map(
          members.map((m: any) => [
            m._teamHead,
            { id: m._teamHead, name: m._teamHead },
          ])
        ).values(),
      ]

      setTeams(uniqueTeams)
    } catch (err) {
      console.error(err)
    }
  }

  const buildScopedIds = useCallback(() => {
    let scopedIds = teamMembers.map((m: any) => m.id)

    if (teamFilter !== 'all') {
      scopedIds = teamMembers
        .filter((m: any) => m._teamHead === teamFilter)
        .map((m: any) => m.id)
    }

    if (recruiterFilter !== 'all') {
      scopedIds = [recruiterFilter]
    }

    return scopedIds
  }, [teamMembers, teamFilter, recruiterFilter])

  const loadCandidates = async () => {
    setLoading(true)

    try {
      const scopedIds = buildScopedIds()

      if (scopedIds.length === 0) {
        setCandidates([])
        setLoading(false)
        return
      }

      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      let query = supabaseAdmin
        .from('candidates')
        .select(
          `
          *,
          jobs (
            job_title,
            job_code,
            clients (
              company_name
            )
          ),
          users:assigned_to (
            full_name,
            role
          )
        `,
          { count: 'exact' }
        )
        .in('assigned_to', scopedIds)
        .order('created_at', { ascending: false })
        .range(from, to)

      if (stageFilter !== 'all') {
        query = query.eq('current_stage', stageFilter)
      }

      if (searchQuery) {
        query = query.or(
          `full_name.ilike.%${searchQuery}%,
          phone.ilike.%${searchQuery}%,
          email.ilike.%${searchQuery}%`
        )
      }

      if (daysFilter !== 'all') {
        const cutoff = new Date()

        cutoff.setDate(
          cutoff.getDate() - parseInt(daysFilter)
        )

        query = query.lte(
          'created_at',
          cutoff.toISOString()
        )
      }

      const { data, error, count } = await query

      if (error) throw error

      // CLIENT LIST
      const uniqueClients = [
        ...new Set(
          (data || [])
            .map((c: any) => c.jobs?.clients?.company_name)
            .filter(Boolean)
        ),
      ]

      setClients(uniqueClients)

      // SAFE FRONTEND FILTER
      let filteredData = data || []

      if (clientFilter !== 'all') {
        filteredData = filteredData.filter(
          (c: any) =>
            c.jobs?.clients?.company_name === clientFilter
        )
      }

      setCandidates(filteredData)
      setTotalRows(count || 0)
    } catch (err) {
      console.error('Error loading candidates:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!user) return null

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        {/* UPDATED GRID */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          {/* SEARCH */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Search
            </label>

            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Name, phone, email..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>

          {/* TEAM */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Team
            </label>

            <select
              value={teamFilter}
              onChange={e => setTeamFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              <option value="all">All Teams</option>

              {teams.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* STAGE */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Stage
            </label>

            <select
              value={stageFilter}
              onChange={e => setStageFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              <option value="all">All Stages</option>

              {PIPELINE_STAGES.map(s => (
                <option key={s} value={s}>
                  {getStageLabel(s)}
                </option>
              ))}
            </select>
          </div>

          {/* CLIENT FILTER */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Client
            </label>

            <select
              value={clientFilter}
              onChange={e => setClientFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              <option value="all">All Clients</option>

              {clients.map(client => (
                <option key={client} value={client}>
                  {client}
                </option>
              ))}
            </select>
          </div>

          {/* RECRUITER */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Recruiter
            </label>

            <select
              value={recruiterFilter}
              onChange={e =>
                setRecruiterFilter(e.target.value)
              }
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              <option value="all">All Recruiters</option>

              {teamMembers
                .filter((m: any) => m.role === 'recruiter')
                .map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
            </select>
          </div>

          {/* DAYS */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Days
            </label>

            <select
              value={daysFilter}
              onChange={e => setDaysFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              <option value="all">Any Duration</option>
              <option value="7">7+ Days</option>
              <option value="15">15+ Days</option>
              <option value="21">21+ Days</option>
              <option value="30">30+ Days</option>
            </select>
          </div>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left">
                Candidate
              </th>
              <th className="px-4 py-3 text-left">
                Job / Client
              </th>
              <th className="px-4 py-3 text-left">
                Stage
              </th>
            </tr>
          </thead>

          <tbody>
            {candidates.map(c => (
              <tr
                key={c.id}
                className="border-b border-gray-50 hover:bg-gray-50"
              >
                <td className="px-4 py-3">
                  <div className="font-semibold">
                    {c.full_name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {c.phone}
                  </div>
                </td>

                <td className="px-4 py-3">
                  <div>{c.jobs?.job_title}</div>

                  <div className="text-xs text-gray-500">
                    {c.jobs?.clients?.company_name}
                  </div>
                </td>

                <td className="px-4 py-3">
                  {getStageLabel(c.current_stage)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ManagementCandidatesPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={<div>Loading...</div>}>
        <CandidatesTable />
      </Suspense>
    </DashboardLayout>
  )
}