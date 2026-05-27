// app/management/offers/[id]/page.tsx
'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase as supabaseAdmin } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

// ── Editable field helper ─────────────────────────────────────────────────────
function Field({
  label, value, editing, type = 'text', onChange, prefix, suffix, highlight,
}: {
  label: string; value: string; editing: boolean
  type?: 'text' | 'number' | 'date'
  onChange?: (v: string) => void
  prefix?: string; suffix?: string; highlight?: boolean
}) {
  return (
    <div className={editing && highlight ? 'ring-2 ring-indigo-300 rounded-lg p-2 bg-indigo-50' : ''}>
      <div className="text-gray-500 text-sm flex items-center gap-1">
        {label}
        {editing && <span className="text-indigo-500 text-xs font-bold">✏️</span>}
      </div>
      {editing ? (
        <div className="flex items-center gap-1 mt-1">
          {prefix && <span className="text-sm font-semibold text-gray-500">{prefix}</span>}
          <input
            type={type}
            value={value}
            onChange={e => onChange?.(e.target.value)}
            className="w-full border-2 border-indigo-300 rounded-lg px-2 py-1 text-sm font-semibold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {suffix && <span className="text-sm font-semibold text-gray-500">{suffix}</span>}
        </div>
      ) : (
        <div className="font-semibold text-gray-900 text-sm mt-0.5">
          {prefix}{value || 'N/A'}{suffix}
        </div>
      )}
    </div>
  )
}

export default function ManagementOfferDetailPage() {
  const params   = useParams()
  const router   = useRouter()
  const offerId  = Array.isArray(params.id) ? params.id[0] : params.id

  const [loading,    setLoading]    = useState(true)
  const [offer,      setOffer]      = useState<any>(null)
  const [editing,    setEditing]    = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)

  // ── Edit states for every editable field ──────────────────────────────────
  const [editOfferedCTC,    setEditOfferedCTC]    = useState('')
  const [editFixedCTC,      setEditFixedCTC]      = useState('')
  const [editVariableCTC,   setEditVariableCTC]   = useState('')
  const [editFeePercent,    setEditFeePercent]    = useState('')
  const [editOfferDate,     setEditOfferDate]     = useState('')
  const [editValidUntil,    setEditValidUntil]    = useState('')
  const [editJoiningDate,   setEditJoiningDate]   = useState('')
  const [editGuaranteeEnds, setEditGuaranteeEnds] = useState('')
  const [editDesignation,   setEditDesignation]   = useState('')
  const [editLocation,      setEditLocation]      = useState('')
  const [editDepartment,    setEditDepartment]    = useState('')
  const [editReportingTo,   setEditReportingTo]   = useState('')
  const [editNotes,         setEditNotes]         = useState('')

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) { router.push('/'); return }
    const parsedUser = JSON.parse(userData)
    if (!['ceo', 'ops_head', 'finance_head', 'system_admin'].includes(parsedUser.role)) {
      alert('Access denied.'); router.push('/'); return
    }
    loadOffer()
  }, [offerId])

  const resolveTeamHead = (
    userId: string, userMap: Record<string, any>
  ): { teamName: string; tlName: string | null } => {
    const visited = new Set<string>()
    const walk = (uid: string): { teamName: string; tlName: string | null } => {
      if (visited.has(uid)) return { teamName: '—', tlName: null }
      visited.add(uid)
      const u = userMap[uid]
      if (!u) return { teamName: '—', tlName: null }
      if (u.role === 'sr_team_leader' || !u.reports_to)
        return { teamName: u.full_name, tlName: null }
      const parent = userMap[u.reports_to]
      if (!parent) return { teamName: u.full_name, tlName: null }
      if (parent.role === 'sr_team_leader' || !parent.reports_to)
        return { teamName: parent.full_name, tlName: u.full_name }
      const higher = walk(u.reports_to)
      return { teamName: higher.teamName, tlName: u.full_name }
    }
    return walk(userId)
  }

  const loadOffer = async () => {
    try {
      const { data: allUsers } = await supabaseAdmin
        .from('users')
        .select('id, full_name, role, reports_to')
        .in('role', ['sr_team_leader', 'team_leader', 'recruiter'])
        .eq('is_active', true)

      const userMap: Record<string, any> = {}
      ;(allUsers || []).forEach((u: any) => { userMap[u.id] = u })

      const { data, error } = await supabaseAdmin
        .from('offers')
        .select(`
          *,
          candidates (
            id, full_name, phone, email, current_stage,
            current_ctc, expected_ctc, notice_period,
            date_joined, guarantee_period_ends, revenue_earned,
            placement_status,
            jobs (
              id, job_title, job_code, client_id,
              clients ( id, company_name, replacement_guarantee_days )
            )
          )
        `)
        .eq('id', offerId)
        .single()

      if (error) throw error

      const recruiterName = userMap[data.recruiter_id]?.full_name || '—'
      const { teamName, tlName } = data.recruiter_id
        ? resolveTeamHead(data.recruiter_id, userMap)
        : { teamName: '—', tlName: null }

      data._recruiterName = recruiterName
      data._teamName      = teamName
      data._tlName        = tlName

      if (data.status === 'joined' && data.candidates?.guarantee_period_ends) {
        const daysRemaining = Math.max(0, Math.floor(
          (new Date(data.candidates.guarantee_period_ends).getTime() - Date.now()) / 86400000
        ))
        data._daysRemaining = daysRemaining
        if (data.candidates.placement_status === 'safe')   data._safetyStatus = 'safe'
        else if (daysRemaining <= 7)                        data._safetyStatus = 'critical'
        else if (daysRemaining <= 30)                       data._safetyStatus = 'at_risk'
        else                                                data._safetyStatus = 'monitoring'
      }

      setOffer(data)
      prefillEditStates(data)
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const prefillEditStates = (data: any) => {
    setEditOfferedCTC(String(data.offered_ctc || ''))
    setEditFixedCTC(String(data.fixed_ctc || ''))
    setEditVariableCTC(String(data.variable_ctc || ''))
    setEditFeePercent(String(data.revenue_percentage || '8.33'))
    setEditOfferDate(data.offer_date
      ? new Date(data.offer_date).toISOString().split('T')[0] : '')
    setEditValidUntil(data.offer_valid_until
      ? new Date(data.offer_valid_until).toISOString().split('T')[0] : '')
    setEditJoiningDate(data.expected_joining_date
      ? new Date(data.expected_joining_date).toISOString().split('T')[0] : '')
    setEditGuaranteeEnds(data.candidates?.guarantee_period_ends
      ? new Date(data.candidates.guarantee_period_ends).toISOString().split('T')[0] : '')
    setEditDesignation(data.designation || '')
    setEditLocation(data.work_location || '')
    setEditDepartment(data.department || '')
    setEditReportingTo(data.reporting_to || '')
    setEditNotes(data.notes || '')
  }

  const handleCancelEdit = () => {
    setEditing(false)
    prefillEditStates(offer)
  }

  // Live revenue preview while editing
  const liveRevenue = ((Number(editFixedCTC) || 0) * (Number(editFeePercent) || 8.33) / 100)

  const handleSaveEdit = async () => {
    if (!offer) return
    setSavingEdit(true)
    try {
      const feePercent = Number(editFeePercent) || 8.33
      const fixedCTC   = Number(editFixedCTC) || 0

      // Update offers table
      const offerUpdates: Record<string, any> = {
        offered_ctc:           Number(editOfferedCTC) || 0,
        fixed_ctc:             fixedCTC,
        variable_ctc:          Number(editVariableCTC) || 0,
        revenue_percentage:    feePercent,
        billable_ctc:          fixedCTC,
        expected_revenue:      fixedCTC * feePercent / 100,
        offer_date:            editOfferDate || null,
        offer_valid_until:     editValidUntil || null,
        expected_joining_date: editJoiningDate || null,
        designation:           editDesignation || null,
        work_location:         editLocation || null,
        department:            editDepartment || null,
        reporting_to:          editReportingTo || null,
        notes:                 editNotes || null,
        updated_at:            new Date().toISOString(),
      }

      const { error: offerError } = await supabaseAdmin
        .from('offers')
        .update(offerUpdates)
        .eq('id', offerId)

      if (offerError) throw offerError

      // Update guarantee_period_ends on candidates table if changed
      const origGuarantee = offer.candidates?.guarantee_period_ends
        ? new Date(offer.candidates.guarantee_period_ends).toISOString().split('T')[0]
        : ''

      if (editGuaranteeEnds !== origGuarantee && offer.candidates?.id) {
        const { error: candError } = await supabaseAdmin
          .from('candidates')
          .update({ guarantee_period_ends: editGuaranteeEnds || null })
          .eq('id', offer.candidates.id)

        if (candError) throw candError
      }

      setEditing(false)
      await loadOffer()
    } catch (err: any) {
      console.error('Save error:', err)
      alert('Failed to save: ' + (err.message || 'Unknown error'))
    } finally {
      setSavingEdit(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      extended: 'bg-blue-100 text-blue-800',
      accepted: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      expired:  'bg-gray-100 text-gray-800',
      joined:   'bg-purple-100 text-purple-800',
      renege:   'bg-orange-100 text-orange-800',
    }
    return map[status] || 'bg-gray-100 text-gray-800'
  }

  if (loading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    </DashboardLayout>
  )

  if (!offer) return (
    <DashboardLayout>
      <div className="text-center py-12">
        <p className="text-gray-600">Offer not found</p>
        <button onClick={() => router.back()} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg">Go Back</button>
      </div>
    </DashboardLayout>
  )

  const feePercentage   = offer.revenue_percentage || 8.33
  const displayRevenue  = editing ? liveRevenue.toFixed(2) : ((offer.fixed_ctc || 0) * feePercentage / 100).toFixed(2)
  const guaranteeDays   = offer.candidates?.jobs?.clients?.replacement_guarantee_days || 90

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6 pb-8">

        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="text-gray-600 hover:text-gray-900 text-sm">← Back</button>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{offer.candidates?.full_name}</h2>
              <p className="text-gray-600 text-sm">
                {offer.candidates?.jobs?.job_title} · {offer.candidates?.jobs?.clients?.company_name}
              </p>
              <div className="flex flex-wrap gap-3 mt-1 text-sm text-gray-500">
                <span>👤 <strong>{offer._recruiterName}</strong></span>
                {offer._tlName && <span>· TL: <strong>{offer._tlName}</strong></span>}
                <span>· Team: <strong>{offer._teamName}</strong></span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-4 py-2 rounded-full text-sm font-bold ${getStatusBadge(offer.status)}`}>
              {offer.status.toUpperCase()}
            </span>
            {!editing ? (
              <button
                onClick={() => setEditing(true)}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition"
              >
                ✏️ Edit Offer
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={handleSaveEdit} disabled={savingEdit}
                  className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition disabled:opacity-50">
                  {savingEdit ? 'Saving…' : '✓ Save'}
                </button>
                <button onClick={handleCancelEdit}
                  className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-300 transition">
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Edit notice ── */}
        {editing && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2 text-sm text-indigo-800 flex items-center gap-2">
            <span>✏️</span>
            <span>Editing mode — All fields are editable. Revenue auto-updates based on Fixed CTC × Fee%.</span>
          </div>
        )}
        {!editing && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800 flex items-center gap-2">
            <span>👁️</span>
            <span>Management view — click <strong>Edit Offer</strong> to update any field.</span>
          </div>
        )}

        {/* ── Safety Banners ── */}
        {offer._safetyStatus === 'critical' && (
          <div className="bg-red-50 border-2 border-red-400 rounded-lg p-4 flex items-center gap-3 text-red-900">
            <span className="text-3xl animate-pulse">🚨</span>
            <div>
              <h3 className="font-bold text-lg">CRITICAL: Guarantee Period Ending!</h3>
              <p className="text-sm">Only <strong>{offer._daysRemaining} days</strong> remaining. Revenue of ₹{displayRevenue} is at risk.</p>
            </div>
          </div>
        )}
        {offer._safetyStatus === 'at_risk' && (
          <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-4 flex items-center gap-3 text-yellow-900">
            <span className="text-2xl">⚠️</span>
            <div>
              <h3 className="font-bold">Guarantee Period At Risk</h3>
              <p className="text-sm">{offer._daysRemaining} days remaining · Revenue: ₹{displayRevenue}</p>
            </div>
          </div>
        )}
        {offer._safetyStatus === 'safe' && (
          <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4 flex items-center gap-3 text-green-900">
            <span className="text-2xl">✅</span>
            <div>
              <h3 className="font-bold">Placement Safe — Guarantee Period Cleared</h3>
              <p className="text-sm">Revenue of ₹{displayRevenue} is confirmed.</p>
            </div>
          </div>
        )}
        {offer.status === 'joined' && offer._safetyStatus === 'monitoring' && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 flex items-center gap-3 text-blue-900">
            <span className="text-2xl">🟢</span>
            <div>
              <h3 className="font-bold">Monitoring — {offer._daysRemaining} Days Remaining</h3>
              <p className="text-sm">Revenue provisional until guarantee period ends.</p>
            </div>
          </div>
        )}

        {/* ── CTC Details ── */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">💰 CTC Details</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

            {/* Total CTC */}
            <div className={`text-center p-4 rounded-lg ${editing ? 'bg-indigo-50 ring-2 ring-indigo-300' : 'bg-gray-50'}`}>
              <div className="text-xs text-gray-500 mb-1">Total CTC {editing && <span className="text-indigo-500">✏️</span>}</div>
              {editing ? (
                <input type="number" value={editOfferedCTC} onChange={e => setEditOfferedCTC(e.target.value)}
                  className="w-full text-center text-lg font-bold text-indigo-900 bg-white border-2 border-indigo-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
              ) : (
                <div className="text-2xl font-bold text-gray-900">₹{(offer.offered_ctc || 0).toLocaleString('en-IN')}</div>
              )}
            </div>

            {/* Fixed CTC */}
            <div className={`text-center p-4 rounded-lg ${editing ? 'bg-indigo-50 ring-2 ring-indigo-300' : 'bg-blue-50'}`}>
              <div className="text-xs text-blue-600 mb-1">Fixed CTC {editing && <span className="text-indigo-500">✏️</span>}</div>
              {editing ? (
                <input type="number" value={editFixedCTC} onChange={e => setEditFixedCTC(e.target.value)}
                  className="w-full text-center text-lg font-bold text-indigo-900 bg-white border-2 border-indigo-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
              ) : (
                <div className="text-2xl font-bold text-blue-900">₹{(offer.fixed_ctc || 0).toLocaleString('en-IN')}</div>
              )}
            </div>

            {/* Variable CTC */}
            <div className={`text-center p-4 rounded-lg ${editing ? 'bg-indigo-50 ring-2 ring-indigo-300' : 'bg-yellow-50'}`}>
              <div className="text-xs text-yellow-600 mb-1">Variable CTC {editing && <span className="text-indigo-500">✏️</span>}</div>
              {editing ? (
                <input type="number" value={editVariableCTC} onChange={e => setEditVariableCTC(e.target.value)}
                  className="w-full text-center text-lg font-bold text-indigo-900 bg-white border-2 border-indigo-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
              ) : (
                <div className="text-2xl font-bold text-yellow-900">₹{(offer.variable_ctc || 0).toLocaleString('en-IN')}</div>
              )}
            </div>

            {/* Revenue + Fee % */}
            <div className={`text-center p-4 rounded-lg ${editing ? 'bg-indigo-50 ring-2 ring-indigo-300' : 'bg-green-50'}`}>
              <div className="text-xs text-green-600 mb-1 flex items-center justify-center gap-1">
                Revenue {editing && <span className="text-indigo-500">✏️</span>}
              </div>
              {editing ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500 whitespace-nowrap">Fee %</span>
                    <input type="number" step="0.01" value={editFeePercent} onChange={e => setEditFeePercent(e.target.value)}
                      className="w-full text-center text-sm font-bold text-indigo-900 bg-white border-2 border-indigo-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                  </div>
                  <div className="text-lg font-black text-green-700">
                    ₹{liveRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-[10px] text-indigo-500">Auto-calculated ↑</div>
                </div>
              ) : (
                <>
                  <div className="text-2xl font-bold text-green-900">₹{displayRevenue}</div>
                  <div className="text-xs text-green-600 mt-1">{feePercentage}% fee</div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Important Dates ── */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">📅 Important Dates</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">

            <Field label="Offer Date" value={editOfferDate} editing={editing} type="date"
              onChange={setEditOfferDate} highlight />

            <Field label="Valid Until" value={editValidUntil} editing={editing} type="date"
              onChange={setEditValidUntil} highlight />

            <Field label="Expected Joining" value={editJoiningDate} editing={editing} type="date"
              onChange={setEditJoiningDate} highlight />

            {offer.actual_joining_date && (
              <div>
                <div className="text-gray-500">Actual Joining</div>
                <div className="font-semibold text-green-600">
                  {new Date(offer.actual_joining_date).toLocaleDateString()}
                </div>
              </div>
            )}

            {/* Guarantee Ends — edits candidates table */}
            <div className={editing ? 'ring-2 ring-orange-300 rounded-lg p-2 bg-orange-50' : ''}>
              <div className="text-gray-500 flex items-center gap-1">
                Guarantee Ends
                {editing && <span className="text-orange-500 text-xs font-bold">✏️</span>}
              </div>
              {editing ? (
                <input type="date" value={editGuaranteeEnds} onChange={e => setEditGuaranteeEnds(e.target.value)}
                  className="mt-1 w-full border-2 border-orange-300 rounded-lg px-2 py-1 text-sm font-semibold text-orange-900 focus:outline-none focus:ring-2 focus:ring-orange-400"/>
              ) : (
                <div className={`font-semibold ${
                  offer._safetyStatus === 'critical' ? 'text-red-600' :
                  offer._safetyStatus === 'safe'     ? 'text-green-600' : 'text-gray-900'
                }`}>
                  {offer.candidates?.guarantee_period_ends
                    ? new Date(offer.candidates.guarantee_period_ends).toLocaleDateString()
                    : 'N/A'}
                  {offer._daysRemaining !== undefined && (
                    <span className="ml-2 text-xs text-gray-400">({offer._daysRemaining}d left)</span>
                  )}
                </div>
              )}
              {editing && (
                <div className="text-[10px] text-orange-500 mt-1">Updates candidate record</div>
              )}
            </div>

          </div>
        </div>

        {/* ── Job Details ── */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">💼 Job Details</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Field label="Designation"  value={editDesignation}  editing={editing} onChange={setEditDesignation}  highlight />
            <Field label="Location"     value={editLocation}     editing={editing} onChange={setEditLocation}     highlight />
            <Field label="Department"   value={editDepartment}   editing={editing} onChange={setEditDepartment}   highlight />
            <Field label="Reporting To" value={editReportingTo}  editing={editing} onChange={setEditReportingTo}  highlight />
          </div>
        </div>

        {/* ── Ownership ── */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">🏆 Ownership</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div><div className="text-gray-500">Recruiter</div><div className="font-semibold">{offer._recruiterName}</div></div>
            {offer._tlName && <div><div className="text-gray-500">Team Leader</div><div className="font-semibold">{offer._tlName}</div></div>}
            <div><div className="text-gray-500">Team Head</div><div className="font-semibold">{offer._teamName}</div></div>
          </div>
        </div>

        {/* ── Guarantee Info ── */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🛡️</span>
            <div>
              <h4 className="font-semibold text-yellow-900">Replacement Guarantee</h4>
              <p className="text-sm text-yellow-800 mt-1">
                {offer.candidates?.jobs?.clients?.company_name} has a <strong>{guaranteeDays} days</strong> guarantee period.
                Revenue of ₹{displayRevenue} will be provisional until guarantee period ends.
              </p>
            </div>
          </div>
        </div>

        {/* ── Notes ── */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
            📝 Notes
            {editing && <span className="text-indigo-500 text-sm font-normal">✏️ Editable</span>}
          </h3>
          {editing ? (
            <textarea
              value={editNotes}
              onChange={e => setEditNotes(e.target.value)}
              rows={4}
              placeholder="Add notes about this offer…"
              className="w-full border-2 border-indigo-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          ) : (
            <p className="text-gray-700 text-sm">{offer.notes || <span className="text-gray-400 italic">No notes added</span>}</p>
          )}
        </div>

        {/* ── Floating save bar ── */}
        {editing && (
          <div className="sticky bottom-4 bg-white border-2 border-indigo-300 rounded-xl shadow-lg px-6 py-4 flex items-center justify-between gap-4">
            <p className="text-sm text-indigo-700 font-medium">📝 Editing offer — changes not yet saved</p>
            <div className="flex gap-3">
              <button onClick={handleCancelEdit}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200">
                Cancel
              </button>
              <button onClick={handleSaveEdit} disabled={savingEdit}
                className="px-6 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {savingEdit ? 'Saving…' : '✓ Save Changes'}
              </button>
            </div>
          </div>
        )}

      </div>
    </DashboardLayout>
  )
}