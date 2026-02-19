// components/MarkJoinedModal.tsx - FIXED VERSION
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

  const guaranteeDays = offer.candidates?.jobs?.clients?.replacement_guarantee_days || 90

  const calculateGuaranteeEnd = () => {
    const date = new Date(joiningDate)
    date.setDate(date.getDate() + guaranteeDays)
    return date.toISOString().split('T')[0]
  }

  const calculateRevenue = () => {
    return (offer.fixed_ctc * 0.0833).toFixed(2)
  }

  const getRevenueMonth = () => {
    return joiningDate.slice(0, 7)
  }

  const handleSubmit = async () => {
    if (!joiningDate) {
      alert('Please select joining date')
      return
    }

    if (!confirm(
      `Confirm candidate joining:\n\n` +
      `📅 Joining Date: ${new Date(joiningDate).toLocaleDateString()}\n` +
      `💰 Revenue: ₹${calculateRevenue()}L\n` +
      `📊 Revenue Month: ${getRevenueMonth()}\n` +
      `🛡️ Safe After: ${new Date(calculateGuaranteeEnd()).toLocaleDateString()}\n\n` +
      `This will:\n` +
      `- Update candidate stage to JOINED\n` +
      `- Calculate revenue\n` +
      `- Start safety monitoring\n\n` +
      `Proceed?`
    )) return

    setLoading(true)

    try {
      const userData = localStorage.getItem('user')
      const user = userData ? JSON.parse(userData) : null

      const revenue = parseFloat(calculateRevenue())
      const revenueMonth = getRevenueMonth()
      const revenueYear = parseInt(joiningDate.slice(0, 4))
      const guaranteeEnds = calculateGuaranteeEnd()

      // 1. Update candidate - CRITICAL: Set stage to 'joined'
      const { data: candidateUpdate, error: candidateError } = await supabase
        .from('candidates')
        .update({
          current_stage: 'joined',  // ← CRITICAL FIX
          date_joined: joiningDate,
          revenue_earned: revenue,
          revenue_month: revenueMonth,
          revenue_year: revenueYear,
          guarantee_period_ends: guaranteeEnds,
          is_placement_safe: false,
          placement_status: 'monitoring',
          last_activity_date: new Date().toISOString(),
        })
        .eq('id', offer.candidates.id)
        .select()

      if (candidateError) {
        throw new Error(`Failed to update candidate: ${candidateError.message}`)
      }

      // 2. Update offer status
      const { error: offerError } = await supabase
        .from('offers')
        .update({
          status: 'joined',
          actual_joining_date: joiningDate,
        })
        .eq('id', offer.id)

      if (offerError) {
        throw new Error(`Failed to update offer: ${offerError.message}`)
      }

      // 3. Create placement safety tracker
      const { error: trackerError } = await supabase
        .from('placement_safety_tracker')
        .insert([{
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
          ).toISOString().split('T')[0],
        }])

      if (trackerError) {
        // Don't fail the whole process if tracker creation fails
      }

      // 4. Add timeline entry
      const { error: timelineError } = await supabase
        .from('candidate_timeline')
        .insert([{
          candidate_id: offer.candidates.id,
          activity_type: 'candidate_joined',
          activity_title: '🎉 Candidate Joined!',
          activity_description: 
            `Joined on ${new Date(joiningDate).toLocaleDateString()}. ` +
            `Revenue: ₹${revenue}L (${revenueMonth}). ` +
            `Stage updated to JOINED. ` +
            `Placement safe after: ${new Date(guaranteeEnds).toLocaleDateString()}`,
          metadata: {
            revenue,
            revenue_month: revenueMonth,
            guarantee_ends: guaranteeEnds,
            stage_changed_to: 'joined'
          },
          performed_by: user?.id,
        }])

      alert(
        `✅ SUCCESS!\n\n` +
        `${offer.candidates?.full_name} marked as JOINED\n\n` +
        `✓ Stage updated to JOINED\n` +
        `✓ Revenue ₹${revenue}L added to ${revenueMonth}\n` +
        `✓ Safety monitoring started (${guaranteeDays} days)\n\n` +
        `The page will now refresh to show updated status.`
      )

      // Give user time to read the message before closing
      setTimeout(() => {
        onSuccess()
      }, 1000)

    } catch (error: any) {
      console.error('💥 Critical error:', error)
      alert(`❌ Error: ${error.message}\n\nPlease try again or contact support.`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
        {/* Header */}
        <div className="mb-6">
          <h3 className="text-xl font-bold text-gray-900">🏢 Mark as Joined</h3>
          <p className="text-gray-600">{offer.candidates?.full_name}</p>
        </div>

        {/* Joining Date */}
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

        {/* Revenue Preview */}
        {joiningDate && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <h4 className="font-semibold text-green-900 mb-3">💰 What will happen:</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">✓ Stage will change to:</span>
                <span className="font-bold text-green-600">JOINED</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">✓ Fixed CTC (Billable):</span>
                <span className="font-semibold">₹{offer.fixed_ctc}L</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">✓ Revenue (8.33%):</span>
                <span className="font-bold text-green-600 text-lg">₹{calculateRevenue()}L</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">✓ Revenue Month:</span>
                <span className="font-semibold text-blue-600">{getRevenueMonth()}</span>
              </div>
              <hr className="border-green-200" />
              <div className="flex justify-between">
                <span className="text-gray-600">✓ Guarantee Period:</span>
                <span className="font-semibold">{guaranteeDays} days</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">✓ Placement Safe After:</span>
                <span className="font-semibold text-orange-600">
                  {new Date(calculateGuaranteeEnd()).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Warning */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-6">
          <p className="text-sm text-yellow-800">
            ⚠️ Revenue will be <strong>provisional</strong> until the guarantee period ends.
            If candidate leaves before {new Date(calculateGuaranteeEnd()).toLocaleDateString()},
            revenue will be reversed to ₹0.
          </p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={loading || !joiningDate}
            className="flex-1 bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '⏳ Processing...' : '🎉 Confirm Joining'}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold hover:border-gray-400 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}