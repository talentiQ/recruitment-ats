// components/RenegeModal.tsx
'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface RenegeModalProps {
  offer: any
  onSuccess: () => void
  onCancel: () => void
}

export default function RenegeModal({ offer, onSuccess, onCancel }: RenegeModalProps) {
  const [renegeDate, setRenegeDate] = useState(new Date().toISOString().split('T')[0])
  const [renegeReason, setRenegeReason] = useState('')
  const [renegeType, setRenegeType] = useState('did_not_join')
  const [loading, setLoading] = useState(false)

  const renegeTypes = [
    { value: 'did_not_join', label: '🚫 Did Not Join (No Show)' },
    { value: 'counter_offer', label: '💼 Got Counter Offer' },
    { value: 'personal_reasons', label: '👤 Personal Reasons' },
    { value: 'better_opportunity', label: '🎯 Found Better Opportunity' },
    { value: 'salary_negotiation', label: '💰 Salary Issue' },
    { value: 'left_within_probation', label: '📅 Left Within Probation' },
    { value: 'other', label: '📝 Other' },
  ]

  const handleSubmit = async () => {
    if (!renegeReason.trim()) {
      alert('Please enter a reason for renege')
      return
    }

    if (!confirm(
      `⚠️ Mark as RENEGE?\n\n` +
      `Revenue will be set to ₹0\n\n` +
      `This action cannot be undone easily. Proceed?`
    )) return

    setLoading(true)

    try {
      const userData = localStorage.getItem('user')
      const user = userData ? JSON.parse(userData) : null

      const fullReason = `${renegeType}: ${renegeReason}`

      // 1. Update candidate
      await supabase.from('candidates').update({
        current_stage: 'dropped',
        is_renege: true,
        renege_date: renegeDate,
        renege_reason: fullReason,
        revenue_earned: 0,      // Revenue = NIL
        placement_status: 'lost',
        is_placement_safe: false,
      }).eq('id', offer.candidates.id)

      // 2. Update offer
      await supabase.from('offers').update({
        status: 'renege',
        notes: `${offer.notes || ''}\nRenege: ${fullReason}`,
      }).eq('id', offer.id)

      // 3. Update placement safety tracker if exists
      await supabase.from('placement_safety_tracker').update({
        safety_status: 'lost',
        risk_notes: fullReason,
      }).eq('candidate_id', offer.candidates.id)

      // 4. Timeline
      await supabase.from('candidate_timeline').insert([{
        candidate_id: offer.candidates.id,
        activity_type: 'renege',
        activity_title: '⚠️ Placement Lost - Renege',
        activity_description: `Reason: ${fullReason}. Revenue reversed to ₹0.`,
        metadata: {
          renege_type: renegeType,
          renege_reason: renegeReason,
          revenue_reversed: true,
        },
        performed_by: user?.id,
      }])

      alert('Renege recorded. Revenue has been set to ₹0.')
      onSuccess()

    } catch (error: any) {
      console.error('Error:', error)
      alert('Error: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
        {/* Header */}
        <div className="mb-6">
          <h3 className="text-xl font-bold text-red-900">⚠️ Mark as Renege</h3>
          <p className="text-gray-600">{offer.candidates?.full_name}</p>
        </div>

        {/* Warning */}
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-red-800 font-semibold">
            ⚠️ This will:
          </p>
          <ul className="text-sm text-red-700 mt-2 space-y-1 list-disc list-inside">
            <li>Set revenue to ₹0 (was ₹{(offer.fixed_ctc * 0.0833).toFixed(2)}L)</li>
            <li>Mark candidate stage as "Dropped"</li>
            <li>Remove from placement safety tracking</li>
          </ul>
        </div>

        {/* Renege Type */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Reason Type *
          </label>
          <select
            value={renegeType}
            onChange={(e) => setRenegeType(e.target.value)}
            className="input"
          >
            {renegeTypes.map(type => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {/* Renege Date */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Renege Date *
          </label>
          <input
            type="date"
            value={renegeDate}
            onChange={(e) => setRenegeDate(e.target.value)}
            className="input"
          />
        </div>

        {/* Notes */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Details *
          </label>
          <textarea
            value={renegeReason}
            onChange={(e) => setRenegeReason(e.target.value)}
            rows={3}
            className="input"
            placeholder="What happened? What did candidate/client say?"
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={loading || !renegeReason.trim()}
            className="flex-1 bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? 'Processing...' : '⚠️ Confirm Renege'}
          </button>
          <button
            onClick={onCancel}
            className="flex-1 bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold hover:border-gray-400"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}