// components/MarkJoinedModal.tsx
'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface MarkJoinedModalProps {
  offer: any
  onSuccess: () => void
  onCancel: () => void
}

export default function MarkJoinedModal({ offer, onSuccess, onCancel }: MarkJoinedModalProps) {
  const [joiningDate, setJoiningDate] = useState('')
  const [updating, setUpdating] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!joiningDate) {
      alert('Please select joining date')
      return
    }

    setUpdating(true)
    try {
      const userData = JSON.parse(localStorage.getItem('user') || '{}')

      // Update offer
      const { error: offerError } = await supabase
        .from('offers')
        .update({
          status: 'joined',
          actual_joining_date: joiningDate
        })
        .eq('id', offer.id)

      if (offerError) throw offerError

      // Update candidate stage
      const { error: candidateError } = await supabase
        .from('candidates')
        .update({ current_stage: 'joined' })
        .eq('id', offer.candidates.id)

      if (candidateError) throw candidateError

      // Add to timeline
      const { error: timelineError } = await supabase
        .from('candidate_timeline')
        .insert([{
          candidate_id: offer.candidates.id,
          activity_type: 'joined',
          activity_title: 'Candidate Joined 🏢',
          activity_description: `Candidate joined on ${new Date(joiningDate).toLocaleDateString()} with CTC ₹${offer.offered_ctc}L`,
          performed_by: userData.id,
        }])

      if (timelineError) throw timelineError

      alert('✅ Candidate marked as joined!')
      onSuccess()
    } catch (error: any) {
      alert('Error: ' + error.message)
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">🏢 Mark Candidate as Joined</h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Actual Joining Date *
              </label>
              <input
                type="date"
                value={joiningDate}
                onChange={(e) => setJoiningDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium"
                disabled={updating}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updating}
                className="flex-1 px-4 py-2 text-white bg-purple-600 rounded-lg hover:bg-purple-700 font-medium disabled:opacity-50"
              >
                {updating ? 'Updating...' : 'Mark as Joined'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}