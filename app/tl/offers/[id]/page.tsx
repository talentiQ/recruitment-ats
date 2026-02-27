// app/tl/offers/[id]/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function TLOfferDetailPage() {
  const params = useParams()
  const router = useRouter()
  const offerId = Array.isArray(params.id) ? params.id[0] : params.id

  const [loading, setLoading] = useState(true)
  const [offer, setOffer] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [updating, setUpdating] = useState(false)

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
            id,
            full_name,
            phone,
            email,
            current_stage,
            current_ctc,
            expected_ctc,
            notice_period,
            date_joined,
            guarantee_period_ends,
            jobs (
              job_title,
              job_code,
              clients (
                id,
                company_name,
                replacement_guarantee_days
              )
            )
          ),
          recruiter:recruiter_id (
            full_name
          )
        `)
        .eq('id', offerId)
        .single()

      if (error) throw error
      setOffer(data)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAcceptOffer = async () => {
    if (!confirm('Mark this offer as ACCEPTED by candidate?')) return
    setUpdating(true)
    try {
      const { error: offerError } = await supabase
        .from('offers')
        .update({ status: 'accepted' })
        .eq('id', offerId)

      if (offerError) throw offerError

      const { error: candidateError } = await supabase
        .from('candidates')
        .update({ 
          current_stage: 'offer_accepted',
          last_activity_date: new Date().toISOString()
        })
        .eq('id', offer.candidates.id)

      if (candidateError) throw candidateError

      await supabase.from('candidate_timeline').insert([{
        candidate_id: offer.candidates.id,
        activity_type: 'offer_accepted',
        activity_title: 'Offer Accepted ✅',
        activity_description: `Candidate accepted the offer of ₹${offer.offered_ctc}. Stage updated to OFFER ACCEPTED.`,
        performed_by: user.id,
      }])

      alert('✅ Offer marked as accepted and stage updated!')
      window.location.href = window.location.href
      
    } catch (error: any) {
      alert('Error: ' + error.message)
    } finally {
      setUpdating(false)
    }
  }

  const handleRejectOffer = async () => {
    const reason = prompt('Reason for offer rejection?')
    if (!reason) return
    setUpdating(true)
    try {
      const { error } = await supabase
        .from('offers')
        .update({ status: 'rejected', notes: reason })
        .eq('id', offerId)

      if (error) throw error

      await supabase.from('candidates').update({
        current_stage: 'rejected'
      }).eq('id', offer.candidates.id)

      await supabase.from('candidate_timeline').insert([{
        candidate_id: offer.candidates.id,
        activity_type: 'offer_rejected',
        activity_title: 'Offer Rejected ❌',
        activity_description: `Candidate rejected offer. Reason: ${reason}`,
        performed_by: user.id,
      }])

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
      extended: 'bg-blue-100 text-blue-800',
      accepted: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      expired: 'bg-gray-100 text-gray-800',
      joined: 'bg-purple-100 text-purple-800',
      renege: 'bg-orange-100 text-orange-800',
    }
    return badges[status] || 'bg-gray-100 text-gray-800'
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

  if (!offer) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-gray-600">Offer not found</p>
          <button onClick={() => router.back()} className="mt-4 btn-primary">
            Go Back
          </button>
        </div>
      </DashboardLayout>
    )
  }

  const feePercentage = offer.revenue_percentage || 8.33
  const expectedRevenue = ((offer.fixed_ctc * feePercentage / 100) / 100000).toFixed(2)
  const guaranteeDays = offer.candidates?.jobs?.clients?.replacement_guarantee_days || 90

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="text-gray-600 hover:text-gray-900">
              ← Back
            </button>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {offer.candidates?.full_name}
              </h2>
              <p className="text-gray-600">
                {offer.candidates?.jobs?.job_title} • {offer.candidates?.jobs?.clients?.company_name}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Created by: {offer.recruiter?.full_name}
              </p>
            </div>
          </div>
          <span className={`px-4 py-2 rounded-full text-sm font-bold ${getStatusBadge(offer.status)}`}>
            {offer.status.toUpperCase()}
          </span>
        </div>

        {/* Action Buttons */}
        {offer.status === 'extended' && (
          <div className="card bg-blue-50 border-2 border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-3">📋 Update Offer Status</h3>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleAcceptOffer}
                disabled={updating}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium disabled:opacity-50"
              >
                ✅ Candidate Accepted
              </button>
              <button
                onClick={handleRejectOffer}
                disabled={updating}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 font-medium disabled:opacity-50"
              >
                ❌ Candidate Rejected
              </button>
            </div>
          </div>
        )}

        {offer.status === 'accepted' && (
          <div className="card bg-green-50 border-2 border-green-200">
            <h3 className="font-semibold text-green-900 mb-3">🎉 Offer Accepted - Next Steps</h3>
            <p className="text-sm text-green-800 mb-4">
              Use the candidate detail page to mark as joined or renege.
            </p>
            <button
              onClick={() => router.push(`/tl/candidates/${offer.candidates.id}`)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium"
            >
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
                  {offer.actual_joining_date ? new Date(offer.actual_joining_date).toLocaleDateString() : 
                   offer.candidates?.date_joined ? new Date(offer.candidates.date_joined).toLocaleDateString() : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-purple-600">Safe After:</span>
                <span className="ml-2 font-medium">
                  {offer.candidates?.guarantee_period_ends ? new Date(offer.candidates.guarantee_period_ends).toLocaleDateString() : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* CTC Summary */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">💰 CTC Details</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-500 mb-1">Total CTC</div>
              <div className="text-2xl font-bold text-gray-900">₹{offer.offered_ctc}</div>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-sm text-blue-600 mb-1">Fixed CTC</div>
              <div className="text-2xl font-bold text-blue-900">₹{offer.fixed_ctc}</div>
            </div>
            <div className="text-center p-4 bg-yellow-50 rounded-lg">
              <div className="text-sm text-yellow-600 mb-1">Variable CTC</div>
              <div className="text-2xl font-bold text-yellow-900">₹{offer.variable_ctc || 0}</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-sm text-green-600 mb-1">Revenue ({feePercentage}%)</div>
              <div className="text-2xl font-bold text-green-900">₹{expectedRevenue}L</div>
            </div>
          </div>
        </div>

        {/* Dates */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">📅 Important Dates</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-gray-500">Offer Date</div>
              <div className="font-semibold">
                {offer.offer_date ? new Date(offer.offer_date).toLocaleDateString() : 'N/A'}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Valid Until</div>
              <div className="font-semibold">
                {offer.offer_valid_until ? new Date(offer.offer_valid_until).toLocaleDateString() : 'N/A'}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Expected Joining</div>
              <div className="font-semibold text-blue-600">
                {offer.expected_joining_date ? new Date(offer.expected_joining_date).toLocaleDateString() : 'N/A'}
              </div>
            </div>
            {offer.actual_joining_date && (
              <div>
                <div className="text-sm text-gray-500">Actual Joining</div>
                <div className="font-semibold text-green-600">
                  {new Date(offer.actual_joining_date).toLocaleDateString()}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Job Details */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">💼 Job Details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-500">Designation</div>
              <div className="font-semibold">{offer.designation || 'N/A'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Location</div>
              <div className="font-semibold">{offer.work_location || 'N/A'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Department</div>
              <div className="font-semibold">{offer.department || 'N/A'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Reporting To</div>
              <div className="font-semibold">{offer.reporting_to || 'N/A'}</div>
            </div>
          </div>
        </div>

        {/* Guarantee Info */}
        <div className="card bg-yellow-50 border border-yellow-200">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🛡️</span>
            <div>
              <h4 className="font-semibold text-yellow-900">Replacement Guarantee</h4>
              <p className="text-sm text-yellow-800 mt-1">
                {offer.candidates?.jobs?.clients?.company_name} has a{' '}
                <strong>{guaranteeDays} days</strong> guarantee period.
                Revenue of ₹{expectedRevenue}L will be provisional until guarantee period ends.
              </p>
            </div>
          </div>
        </div>

        {/* Notes */}
        {offer.notes && (
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">📝 Notes</h3>
            <p className="text-gray-700">{offer.notes}</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
