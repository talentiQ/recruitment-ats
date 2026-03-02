// components/MarkJoinedModal.tsx - FIXED DYNAMIC REVENUE VERSION
'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface MarkJoinedModalProps {
  offer: any
  onSuccess: () => void
  onCancel: () => void
}

export default function MarkJoinedModal({ offer, onSuccess, onCancel }: MarkJoinedModalProps) {
  const [joiningDate, setJoiningDate] = useState(
    offer.expected_joining_date || new Date().toISOString().split('T')[0]
  )
  const [loading, setLoading] = useState(false)

  const guaranteeDays =
    offer.candidates?.jobs?.clients?.replacement_guarantee_days || 90

  const calculateGuaranteeEnd = () => {
    const date = new Date(joiningDate)
    date.setDate(date.getDate() + guaranteeDays)
    return date.toISOString().split('T')[0]
  }

  // ✅ FIXED: Dynamic revenue calculation
  const calculateRevenue = () => {
    const feePercent = offer.revenue_percentage || 8.33
    return (offer.fixed_ctc * feePercent) / 100
  }

  const getRevenueMonth = () => {
    return joiningDate.slice(0, 7)
  }

  const handleSubmit = async () => {
    if (!joiningDate) {
      alert('Please select joining date')
      return
    }

    const revenue = calculateRevenue()
    const revenueMonth = getRevenueMonth()
    const revenueYear = parseInt(joiningDate.slice(0, 4))
    const guaranteeEnds = calculateGuaranteeEnd()

    if (
      !confirm(
        `Confirm candidate joining:\n\n` +
          `📅 Joining Date: ${new Date(joiningDate).toLocaleDateString()}\n` +
          `💰 Revenue: ₹${revenue.toFixed(2)}\n` +
          `📊 Revenue Month: ${revenueMonth}\n` +
          `🛡️ Safe After: ${new Date(guaranteeEnds).toLocaleDateString()}\n\n` +
          `This will:\n` +
          `- Update candidate stage to JOINED\n` +
          `- Calculate revenue\n` +
          `- Start safety monitoring\n\n` +
          `Proceed?`
      )
    )
      return

    setLoading(true)

    try {
      const userData = localStorage.getItem('user')
      const user = userData ? JSON.parse(userData) : null

      // 1️⃣ Update candidate
      const { error: candidateError } = await supabase
        .from('candidates')
        .update({
          current_stage: 'joined',
          date_joined: joiningDate,
          revenue_earned: revenue, // ✅ stored in ₹
          revenue_month: revenueMonth,
          revenue_year: revenueYear,
          guarantee_period_ends: guaranteeEnds,
          is_placement_safe: false,
          placement_status: 'monitoring',
          last_activity_date: new Date().toISOString(),
        })
        .eq('id', offer.candidates.id)

      if (candidateError) {
        throw new Error(candidateError.message)
      }

      // 2️⃣ Update offer
      const { error: offerError } = await supabase
        .from('offers')
        .update({
          status: 'joined',
          actual_joining_date: joiningDate,
        })
        .eq('id', offer.id)

      if (offerError) {
        throw new Error(offerError.message)
      }

      // 3️⃣ Create safety tracker
      await supabase.from('placement_safety_tracker').insert([
        {
          candidate_id: offer.candidates.id,
          recruiter_id: offer.recruiter_id,
          client_id: offer.client_id,
          joining_date: joiningDate,
          guarantee_period_days: guaranteeDays,
          guarantee_period_ends: guaranteeEnds,
          days_remaining: guaranteeDays,
          safety_status: 'monitoring',
          next_followup_date: new Date(
            new Date(joiningDate).getTime() + 7 * 24 * 60 * 60 * 1000
          )
            .toISOString()
            .split('T')[0],
        },
      ])

      // 4️⃣ Timeline entry
      await supabase.from('candidate_timeline').insert([
        {
          candidate_id: offer.candidates.id,
          activity_type: 'candidate_joined',
          activity_title: '🎉 Candidate Joined!',
          activity_description:
            `Joined on ${new Date(joiningDate).toLocaleDateString()}. ` +
            `Revenue: ₹${revenue.toFixed(2)} (${revenueMonth}). ` +
            `Stage updated to JOINED. ` +
            `Placement safe after: ${new Date(guaranteeEnds).toLocaleDateString()}`,
          metadata: {
            revenue,
            revenue_month: revenueMonth,
            guarantee_ends: guaranteeEnds,
            stage_changed_to: 'joined',
            revenue_percentage: offer.revenue_percentage,
          },
          performed_by: user?.id,
        },
      ])

      alert(
        `✅ SUCCESS!\n\n` +
          `${offer.candidates?.full_name} marked as JOINED\n\n` +
          `✓ Revenue ₹${revenue.toFixed(2)} added to ${revenueMonth}\n` +
          `✓ Safety monitoring started (${guaranteeDays} days)`
      )

      setTimeout(() => {
        onSuccess()
      }, 1000)
    } catch (error: any) {
      console.error('Error:', error)
      alert(`❌ Error: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">

        <div className="mb-6">
          <h3 className="text-xl font-bold text-gray-900">🏢 Mark as Joined</h3>
          <p className="text-gray-600">{offer.candidates?.full_name}</p>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Actual Joining Date *
          </label>
          <input
            type="date"
            value={joiningDate}
            onChange={(e) => setJoiningDate(e.target.value)}
            className="input"
            max={new Date().toISOString().split('T')[0]}
          />
        </div>

        {joiningDate && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <div className="flex justify-between">
              <span>✓ Revenue ({offer.revenue_percentage || 8.33}%):</span>
              <span className="font-bold text-green-600">
                ₹{calculateRevenue().toFixed(2)}
              </span>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700"
          >
            {loading ? 'Processing...' : 'Confirm Joining'}
          </button>

          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}