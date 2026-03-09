// app/management/offers/[id]/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function ManagementOfferDetailPage() {
  const params = useParams()
  const router = useRouter()
  const offerId = Array.isArray(params.id) ? params.id[0] : params.id

  const [loading, setLoading] = useState(true)
  const [offer, setOffer] = useState<any>(null)

  useEffect(() => { loadOffer() }, [offerId])

  const loadOffer = async () => {
    try {
      const { data, error } = await supabase
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
          ),
          recruiter:recruiter_id ( id, full_name, reports_to )
        `)
        .eq('id', offerId)
        .single()

      if (error) throw error

      // Resolve team name
      let teamName = '—'
      if (data.recruiter?.reports_to) {
        const { data: tlData } = await supabase
          .from('users')
          .select('full_name, role, reports_to')
          .eq('id', data.recruiter.reports_to)
          .single()

        if (tlData?.role === 'sr_team_leader') {
          teamName = tlData.full_name
        } else if (tlData?.reports_to) {
          const { data: srTLData } = await supabase
            .from('users')
            .select('full_name')
            .eq('id', tlData.reports_to)
            .single()
          teamName = srTLData?.full_name || '—'
          data._tlName = tlData.full_name
        }
      }
      data._teamName = teamName

      // Safety status
      if (data.status === 'joined' && data.candidates?.guarantee_period_ends) {
        const daysRemaining = Math.max(0, Math.floor(
          (new Date(data.candidates.guarantee_period_ends).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
        ))
        data._daysRemaining = daysRemaining
        if (data.candidates.placement_status === 'safe') data._safetyStatus = 'safe'
        else if (daysRemaining <= 7) data._safetyStatus = 'critical'
        else if (daysRemaining <= 30) data._safetyStatus = 'at_risk'
        else data._safetyStatus = 'monitoring'
      }

      setOffer(data)
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      extended:  'bg-blue-100 text-blue-800',
      accepted:  'bg-green-100 text-green-800',
      rejected:  'bg-red-100 text-red-800',
      expired:   'bg-gray-100 text-gray-800',
      joined:    'bg-purple-100 text-purple-800',
      renege:    'bg-orange-100 text-orange-800',
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
          <button onClick={() => router.back()} className="mt-4 btn-primary">Go Back</button>
        </div>
      </DashboardLayout>
    )
  }

  const feePercentage = offer.revenue_percentage || 8.33
  const expectedRevenue = (offer.fixed_ctc * feePercentage / 100).toFixed(2)
  const guaranteeDays = offer.candidates?.jobs?.clients?.replacement_guarantee_days || 90

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6 pb-8">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="text-gray-600 hover:text-gray-900">← Back</button>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{offer.candidates?.full_name}</h2>
              <p className="text-gray-600">
                {offer.candidates?.jobs?.job_title} • {offer.candidates?.jobs?.clients?.company_name}
              </p>
              <div className="flex flex-wrap gap-2 mt-1 text-sm text-gray-500">
                <span>👤 Recruiter: <strong>{offer.recruiter?.full_name}</strong></span>
                {offer._tlName && <span>· TL: <strong>{offer._tlName}</strong></span>}
                <span>· Team: <strong>{offer._teamName}</strong></span>
              </div>
            </div>
          </div>
          <span className={`px-4 py-2 rounded-full text-sm font-bold ${getStatusBadge(offer.status)}`}>
            {offer.status.toUpperCase()}
          </span>
        </div>

        {/* ── Safety Banner ── */}
        {offer._safetyStatus === 'critical' && (
          <div className="card bg-red-50 border-2 border-red-400">
            <div className="flex items-center gap-3 text-red-900">
              <span className="text-3xl animate-pulse">🚨</span>
              <div>
                <h3 className="font-bold text-lg">CRITICAL: Guarantee Period Ending!</h3>
                <p className="text-sm">Only <strong>{offer._daysRemaining} days</strong> remaining.
                  Revenue of ₹{expectedRevenue} is at risk.
                  Recruiter: <strong>{offer.recruiter?.full_name}</strong>
                </p>
              </div>
            </div>
          </div>
        )}

        {offer._safetyStatus === 'at_risk' && (
          <div className="card bg-yellow-50 border-2 border-yellow-400">
            <div className="flex items-center gap-3 text-yellow-900">
              <span className="text-2xl">⚠️</span>
              <div>
                <h3 className="font-bold">Guarantee Period At Risk</h3>
                <p className="text-sm">{offer._daysRemaining} days remaining. Revenue: ₹{expectedRevenue}</p>
              </div>
            </div>
          </div>
        )}

        {offer._safetyStatus === 'safe' && (
          <div className="card bg-green-50 border-2 border-green-300">
            <div className="flex items-center gap-3 text-green-900">
              <span className="text-2xl">✅</span>
              <div>
                <h3 className="font-bold">Placement Safe — Guarantee Period Cleared</h3>
                <p className="text-sm">Revenue of ₹{expectedRevenue} is confirmed.</p>
              </div>
            </div>
          </div>
        )}

        {offer.status === 'joined' && offer._safetyStatus === 'monitoring' && (
          <div className="card bg-blue-50 border-2 border-blue-200">
            <div className="flex items-center gap-3 text-blue-900">
              <span className="text-2xl">🟢</span>
              <div>
                <h3 className="font-bold">Monitoring — {offer._daysRemaining} Days Remaining</h3>
                <p className="text-sm">Revenue provisional until guarantee period ends.</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Read-Only Notice ── */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800 flex items-center gap-2">
          <span>👁️</span>
          <span>Management view — read only. Offer actions are managed by the recruiter or Sr. TL.</span>
        </div>

        {/* ── CTC Details ── */}
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
              <div className="text-2xl font-bold text-green-900">₹{expectedRevenue}</div>
            </div>
          </div>
        </div>

        {/* ── Dates ── */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">📅 Important Dates</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-gray-500">Offer Date</div>
              <div className="font-semibold">{offer.offer_date ? new Date(offer.offer_date).toLocaleDateString() : 'N/A'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Valid Until</div>
              <div className="font-semibold">{offer.offer_valid_until ? new Date(offer.offer_valid_until).toLocaleDateString() : 'N/A'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Expected Joining</div>
              <div className="font-semibold text-blue-600">{offer.expected_joining_date ? new Date(offer.expected_joining_date).toLocaleDateString() : 'N/A'}</div>
            </div>
            {offer.actual_joining_date && (
              <div>
                <div className="text-sm text-gray-500">Actual Joining</div>
                <div className="font-semibold text-green-600">{new Date(offer.actual_joining_date).toLocaleDateString()}</div>
              </div>
            )}
            {offer.candidates?.guarantee_period_ends && (
              <div>
                <div className="text-sm text-gray-500">Guarantee Ends</div>
                <div className={`font-semibold ${offer._safetyStatus === 'critical' ? 'text-red-600' : offer._safetyStatus === 'safe' ? 'text-green-600' : 'text-gray-900'}`}>
                  {new Date(offer.candidates.guarantee_period_ends).toLocaleDateString()}
                  {offer._daysRemaining !== undefined && (
                    <span className="ml-2 text-xs text-gray-500">({offer._daysRemaining}d left)</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Job Details ── */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">💼 Job Details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div><div className="text-sm text-gray-500">Designation</div><div className="font-semibold">{offer.designation || 'N/A'}</div></div>
            <div><div className="text-sm text-gray-500">Location</div><div className="font-semibold">{offer.work_location || 'N/A'}</div></div>
            <div><div className="text-sm text-gray-500">Department</div><div className="font-semibold">{offer.department || 'N/A'}</div></div>
            <div><div className="text-sm text-gray-500">Reporting To</div><div className="font-semibold">{offer.reporting_to || 'N/A'}</div></div>
          </div>
        </div>

        {/* ── Hierarchy ── */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">🏆 Ownership</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><div className="text-sm text-gray-500">Recruiter</div><div className="font-semibold">{offer.recruiter?.full_name || '—'}</div></div>
            {offer._tlName && <div><div className="text-sm text-gray-500">Team Leader</div><div className="font-semibold">{offer._tlName}</div></div>}
            <div><div className="text-sm text-gray-500">Team (Sr. TL)</div><div className="font-semibold">{offer._teamName}</div></div>
          </div>
        </div>

        {/* ── Guarantee Info ── */}
        <div className="card bg-yellow-50 border border-yellow-200">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🛡️</span>
            <div>
              <h4 className="font-semibold text-yellow-900">Replacement Guarantee</h4>
              <p className="text-sm text-yellow-800 mt-1">
                {offer.candidates?.jobs?.clients?.company_name} has a <strong>{guaranteeDays} days</strong> guarantee period.
                Revenue of ₹{expectedRevenue} will be provisional until guarantee period ends.
              </p>
            </div>
          </div>
        </div>

        {/* ── Notes ── */}
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
