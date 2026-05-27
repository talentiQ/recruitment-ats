// app/recruiter/offers/[id]/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { sendNotification } from '@/lib/notificationHelper'

// ── Editable field helper ─────────────────────────────────────────────────────
function Field({
  label, value, editing, type = 'text', onChange, highlight,
}: {
  label: string; value: string; editing: boolean
  type?: 'text' | 'number' | 'date'
  onChange?: (v: string) => void
  highlight?: boolean
}) {
  return (
    <div className={editing && highlight ? 'ring-2 ring-indigo-300 rounded-lg p-2 bg-indigo-50' : ''}>
      <div className="text-sm text-gray-500 flex items-center gap-1">
        {label}
        {editing && <span className="text-indigo-500 text-xs font-bold">✏️</span>}
      </div>
      {editing ? (
        <input
          type={type}
          value={value}
          onChange={e => onChange?.(e.target.value)}
          className="mt-1 w-full border-2 border-indigo-300 rounded-lg px-2 py-1 text-sm font-semibold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      ) : (
        <div className="font-semibold text-gray-900 mt-0.5">{value || 'N/A'}</div>
      )}
    </div>
  )
}

export default function RecruiterOfferDetailPage() {
  const params  = useParams()
  const router  = useRouter()
  const offerId = Array.isArray(params.id) ? params.id[0] : params.id

  const [loading,  setLoading]  = useState(true)
  const [offer,    setOffer]    = useState<any>(null)
  const [user,     setUser]     = useState<any>(null)
  const [updating, setUpdating] = useState(false)

  // ── Edit state ────────────────────────────────────────────────────────────
  const [editing,          setEditing]          = useState(false)
  const [savingEdit,       setSavingEdit]        = useState(false)
  const [editOfferedCTC,   setEditOfferedCTC]    = useState('')
  const [editFixedCTC,     setEditFixedCTC]      = useState('')
  const [editVariableCTC,  setEditVariableCTC]   = useState('')
  const [editFeePercent,   setEditFeePercent]    = useState('')
  const [editOfferDate,    setEditOfferDate]     = useState('')
  const [editValidUntil,   setEditValidUntil]    = useState('')
  const [editJoiningDate,  setEditJoiningDate]   = useState('')
  const [editGuaranteeEnds,setEditGuaranteeEnds] = useState('')
  const [editDesignation,  setEditDesignation]   = useState('')
  const [editLocation,     setEditLocation]      = useState('')
  const [editDepartment,   setEditDepartment]    = useState('')
  const [editReportingTo,  setEditReportingTo]   = useState('')
  const [editNotes,        setEditNotes]         = useState('')

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) setUser(JSON.parse(userData))
    loadOffer()
  }, [offerId])

  const loadOffer = async () => {
    try {
      const { data, error } = await supabase
        .from('offers')
        .select(`
          *,
          candidates (
            id, full_name, phone, email, current_stage,
            current_ctc, expected_ctc, notice_period,
            date_joined, guarantee_period_ends,
            jobs (
              job_title, job_code,
              clients ( id, company_name, replacement_guarantee_days )
            )
          ),
          recruiter:recruiter_id ( full_name )
        `)
        .eq('id', offerId)
        .single()

      if (error) throw error
      setOffer(data)
      prefillEditStates(data)
    } catch (error) {
      console.error('Error:', error)
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

  // Live revenue in lakhs while editing
  const liveRevenueL = ((Number(editFixedCTC) || 0) * (Number(editFeePercent) || 8.33) / 100 / 100000)

  const handleSaveEdit = async () => {
    if (!offer) return
    setSavingEdit(true)
    try {
      const feePercent = Number(editFeePercent) || 8.33
      const fixedCTC   = Number(editFixedCTC) || 0

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

      const { error: offerError } = await supabase
        .from('offers').update(offerUpdates).eq('id', offerId)
      if (offerError) throw offerError

      // Update guarantee_period_ends on candidates table if changed
      const origGuarantee = offer.candidates?.guarantee_period_ends
        ? new Date(offer.candidates.guarantee_period_ends).toISOString().split('T')[0] : ''

      if (editGuaranteeEnds !== origGuarantee && offer.candidates?.id) {
        const { error: candError } = await supabase
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

  // ── Accept Offer ──────────────────────────────────────────────────────────
  const handleAcceptOffer = async () => {
    if (!confirm('Mark this offer as ACCEPTED by candidate?')) return
    setUpdating(true)
    try {
      await supabase.from('offers').update({ status: 'accepted' }).eq('id', offerId)
      await supabase.from('candidates').update({
        current_stage: 'offer_accepted', last_activity_date: new Date().toISOString(),
      }).eq('id', offer.candidates.id)

      await supabase.from('candidate_timeline').insert([{
        candidate_id: offer.candidates.id, activity_type: 'offer_accepted',
        activity_title: 'Offer Accepted ✅',
        activity_description: `Candidate accepted the offer of ₹${offer.offered_ctc}. Stage updated to OFFER ACCEPTED.`,
        performed_by: user.id,
      }])

      await sendNotification({
        event: 'offer_accepted', recruiterId: offer.recruiter_id || user.id,
        recruiterName: user.full_name, candidateId: offer.candidates.id,
        candidateName: offer.candidates.full_name,
      })

      alert('✅ Offer marked as accepted and stage updated!')
      loadOffer()
    } catch (error: any) {
      alert('Error: ' + error.message)
    } finally {
      setUpdating(false)
    }
  }

  // ── Reject Offer ──────────────────────────────────────────────────────────
  const handleRejectOffer = async () => {
    const reason = prompt('Reason for offer rejection?')
    if (!reason) return
    setUpdating(true)
    try {
      await supabase.from('offers').update({ status: 'rejected', notes: reason }).eq('id', offerId)
      await supabase.from('candidates').update({ current_stage: 'offer_rejected' }).eq('id', offer.candidates.id)

      await supabase.from('candidate_timeline').insert([{
        candidate_id: offer.candidates.id, activity_type: 'offer_rejected',
        activity_title: 'Offer Rejected ❌',
        activity_description: `Candidate rejected offer. Reason: ${reason}`,
        performed_by: user.id,
      }])

      await sendNotification({
        event: 'offer_rejected', recruiterId: offer.recruiter_id || user.id,
        recruiterName: user.full_name, candidateId: offer.candidates.id,
        candidateName: offer.candidates.full_name,
      })

      alert('Offer marked as rejected')
      loadOffer()
    } catch (error: any) {
      alert('Error: ' + error.message)
    } finally {
      setUpdating(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const badges: { [key: string]: string } = {
      extended: 'bg-blue-100 text-blue-800', accepted: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',   expired:  'bg-gray-100 text-gray-800',
      joined:   'bg-purple-100 text-purple-800', renege: 'bg-orange-100 text-orange-800',
    }
    return badges[status] || 'bg-gray-100 text-gray-800'
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
        <button onClick={() => router.back()} className="mt-4 btn-primary">Go Back</button>
      </div>
    </DashboardLayout>
  )

  const feePercentage   = offer.revenue_percentage || 8.33
  const displayRevL     = editing
    ? liveRevenueL.toFixed(2)
    : ((offer.fixed_ctc || 0) * feePercentage / 100 / 100000).toFixed(2)
  const guaranteeDays   = offer.candidates?.jobs?.clients?.replacement_guarantee_days || 90

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="text-gray-600 hover:text-gray-900">← Back</button>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{offer.candidates?.full_name}</h2>
              <p className="text-gray-600">
                {offer.candidates?.jobs?.job_title} • {offer.candidates?.jobs?.clients?.company_name}
              </p>
              <p className="text-sm text-gray-500 mt-1">Created by: {offer.recruiter?.full_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-4 py-2 rounded-full text-sm font-bold ${getStatusBadge(offer.status)}`}>
              {offer.status.toUpperCase()}
            </span>
            {!editing ? (
              <button onClick={() => setEditing(true)}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition">
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

        {/* ── Notices ── */}
        {editing && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2 text-sm text-indigo-800 flex items-center gap-2">
            <span>✏️</span>
            <span>Editing mode — All fields editable. Revenue auto-updates as you type.</span>
          </div>
        )}
        {!editing && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800 flex items-center gap-2">
            <span>👁️</span>
            <span>Click <strong>Edit Offer</strong> to update any field.</span>
          </div>
        )}

        {/* ── Action Buttons ── */}
        {offer.status === 'extended' && (
          <div className="card bg-blue-50 border-2 border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-3">📋 Update Offer Status</h3>
            <div className="flex flex-wrap gap-3">
              <button onClick={handleAcceptOffer} disabled={updating}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium disabled:opacity-50">
                ✅ Candidate Accepted
              </button>
              <button onClick={handleRejectOffer} disabled={updating}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 font-medium disabled:opacity-50">
                ❌ Candidate Rejected
              </button>
            </div>
          </div>
        )}

        {offer.status === 'accepted' && (
          <div className="card bg-green-50 border-2 border-green-200">
            <h3 className="font-semibold text-green-900 mb-3">🎉 Offer Accepted — Next Steps</h3>
            <p className="text-sm text-green-800 mb-4">Use the candidate detail page to mark as joined or renege.</p>
            <button onClick={() => router.push(`/recruiter/candidates/${offer.candidates.id}`)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium">
              Go to Candidate Details
            </button>
          </div>
        )}

        {offer.status === 'joined' && (
          <div className="card bg-purple-50 border-2 border-purple-200">
            <h3 className="font-semibold text-purple-900 mb-3">✅ Candidate Joined</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-purple-600">Joined Date:</span>
                <span className="ml-2 font-medium">
                  {offer.actual_joining_date
                    ? new Date(offer.actual_joining_date).toLocaleDateString()
                    : offer.candidates?.date_joined
                      ? new Date(offer.candidates.date_joined).toLocaleDateString()
                      : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-purple-600">Safe After:</span>
                <span className="ml-2 font-medium">
                  {offer.candidates?.guarantee_period_ends
                    ? new Date(offer.candidates.guarantee_period_ends).toLocaleDateString()
                    : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── CTC Details ── */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">💰 CTC Details</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

            {/* Total CTC */}
            <div className={`text-center p-4 rounded-lg ${editing ? 'bg-indigo-50 ring-2 ring-indigo-300' : 'bg-gray-50'}`}>
              <div className="text-sm text-gray-500 mb-1">Total CTC {editing && <span className="text-indigo-500 text-xs">✏️</span>}</div>
              {editing ? (
                <input type="number" value={editOfferedCTC} onChange={e => setEditOfferedCTC(e.target.value)}
                  className="w-full text-center text-lg font-bold text-indigo-900 bg-white border-2 border-indigo-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
              ) : (
                <div className="text-2xl font-bold text-gray-900">₹{(offer.offered_ctc || 0).toLocaleString('en-IN')}</div>
              )}
            </div>

            {/* Fixed CTC */}
            <div className={`text-center p-4 rounded-lg ${editing ? 'bg-indigo-50 ring-2 ring-indigo-300' : 'bg-blue-50'}`}>
              <div className="text-sm text-blue-600 mb-1">Fixed CTC {editing && <span className="text-indigo-500 text-xs">✏️</span>}</div>
              {editing ? (
                <input type="number" value={editFixedCTC} onChange={e => setEditFixedCTC(e.target.value)}
                  className="w-full text-center text-lg font-bold text-indigo-900 bg-white border-2 border-indigo-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
              ) : (
                <div className="text-2xl font-bold text-blue-900">₹{(offer.fixed_ctc || 0).toLocaleString('en-IN')}</div>
              )}
            </div>

            {/* Variable CTC */}
            <div className={`text-center p-4 rounded-lg ${editing ? 'bg-indigo-50 ring-2 ring-indigo-300' : 'bg-yellow-50'}`}>
              <div className="text-sm text-yellow-600 mb-1">Variable CTC {editing && <span className="text-indigo-500 text-xs">✏️</span>}</div>
              {editing ? (
                <input type="number" value={editVariableCTC} onChange={e => setEditVariableCTC(e.target.value)}
                  className="w-full text-center text-lg font-bold text-indigo-900 bg-white border-2 border-indigo-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
              ) : (
                <div className="text-2xl font-bold text-yellow-900">₹{(offer.variable_ctc || 0).toLocaleString('en-IN')}</div>
              )}
            </div>

            {/* Revenue + Fee % */}
            <div className={`text-center p-4 rounded-lg ${editing ? 'bg-indigo-50 ring-2 ring-indigo-300' : 'bg-green-50'}`}>
              <div className="text-sm text-green-600 mb-1">
                Revenue {editing && <span className="text-indigo-500 text-xs">✏️</span>}
              </div>
              {editing ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500 whitespace-nowrap">Fee %</span>
                    <input type="number" step="0.01" value={editFeePercent} onChange={e => setEditFeePercent(e.target.value)}
                      className="w-full text-center text-sm font-bold text-indigo-900 bg-white border-2 border-indigo-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                  </div>
                  <div className="text-lg font-black text-green-700">₹{liveRevenueL.toFixed(2)}L</div>
                  <div className="text-[10px] text-indigo-500">Auto-calculated ↑</div>
                </div>
              ) : (
                <>
                  <div className="text-2xl font-bold text-green-900">₹{displayRevL}L</div>
                  <div className="text-xs text-green-600 mt-1">{feePercentage}% fee</div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Important Dates ── */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">📅 Important Dates</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">

            <Field label="Offer Date"       value={editOfferDate}   editing={editing} type="date" onChange={setEditOfferDate}   highlight />
            <Field label="Valid Until"       value={editValidUntil}  editing={editing} type="date" onChange={setEditValidUntil}  highlight />
            <Field label="Expected Joining"  value={editJoiningDate} editing={editing} type="date" onChange={setEditJoiningDate} highlight />

            {offer.actual_joining_date && (
              <div>
                <div className="text-sm text-gray-500">Actual Joining</div>
                <div className="font-semibold text-green-600">
                  {new Date(offer.actual_joining_date).toLocaleDateString()}
                </div>
              </div>
            )}

            {/* Guarantee Ends */}
            <div className={editing ? 'ring-2 ring-orange-300 rounded-lg p-2 bg-orange-50' : ''}>
              <div className="text-sm text-gray-500 flex items-center gap-1">
                Guarantee Ends
                {editing && <span className="text-orange-500 text-xs font-bold">✏️</span>}
              </div>
              {editing ? (
                <>
                  <input type="date" value={editGuaranteeEnds} onChange={e => setEditGuaranteeEnds(e.target.value)}
                    className="mt-1 w-full border-2 border-orange-300 rounded-lg px-2 py-1 text-sm font-semibold text-orange-900 focus:outline-none focus:ring-2 focus:ring-orange-400"/>
                  <div className="text-[10px] text-orange-500 mt-1">Updates candidate record</div>
                </>
              ) : (
                <div className="font-semibold">
                  {offer.candidates?.guarantee_period_ends
                    ? new Date(offer.candidates.guarantee_period_ends).toLocaleDateString()
                    : 'N/A'}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* ── Job Details ── */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">💼 Job Details</h3>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Designation"  value={editDesignation} editing={editing} onChange={setEditDesignation} highlight />
            <Field label="Location"     value={editLocation}    editing={editing} onChange={setEditLocation}    highlight />
            <Field label="Department"   value={editDepartment}  editing={editing} onChange={setEditDepartment}  highlight />
            <Field label="Reporting To" value={editReportingTo} editing={editing} onChange={setEditReportingTo} highlight />
          </div>
        </div>

        {/* ── Guarantee Info ── */}
        <div className="card bg-yellow-50 border border-yellow-200">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🛡️</span>
            <div>
              <h4 className="font-semibold text-yellow-900">Replacement Guarantee</h4>
              <p className="text-sm text-yellow-800 mt-1">
                {offer.candidates?.jobs?.clients?.company_name} has a{' '}
                <strong>{guaranteeDays} days</strong> guarantee period.
                Revenue of ₹{displayRevL}L provisional until guarantee period ends.
              </p>
            </div>
          </div>
        </div>

        {/* ── Notes ── */}
        <div className="card">
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
            <p className="text-gray-700">{editNotes || <span className="text-gray-400 italic">No notes added</span>}</p>
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