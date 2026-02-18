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
  const [reason, setReason] = useState('')
  const [updating, setUpdating] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reason.trim()) {
      alert('Please provide a reason for renege')
      return
    }

    setUpdating(true)
    try {
      const userData = JSON.parse(localStorage.getItem('user') || '{}')

      // Update offer
      const { error: offerError } = await supabase
        .from('offers')
        .update({
          status: 'renege',
          notes: (offer.notes ? offer.notes + '\n\n' : '') + `Renege Reason: ${reason}`
        })
        .eq('id', offer.id)

      if (offerError) throw offerError

      // Update candidate stage back to offer_accepted or something appropriate
      // Maybe keep as offer_accepted but with a note, or set to a new stage
      const { error: candidateError } = await supabase
        .from('candidates')
        .update({
          current_stage: 'offer_accepted', // Keep as accepted but with renege note
          notes: (offer.candidates.notes ? offer.candidates.notes + '\n\n' : '') + `Renege: ${reason}`
        })
        .eq('id', offer.candidates.id)

      if (candidateError) throw candidateError

      // Add to timeline
      const { error: timelineError } = await supabase
        .from('candidate_timeline')
        .insert([{
          candidate_id: offer.candidates.id,
          activity_type: 'renege',
          activity_title: 'Offer Renege ⚠️',
          activity_description: `Candidate reneged on accepted offer. Reason: ${reason}`,
          performed_by: userData.id,
        }])

      if (timelineError) throw timelineError

      alert('⚠️ Candidate marked as reneged!')
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
          <h3 className="text-lg font-semibold text-gray-900 mb-4">⚠️ Mark as Renege</h3>
          <p className="text-sm text-gray-600 mb-4">
            This will mark the candidate as having reneged on their accepted offer.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for Renege *
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Please provide details about why the candidate reneged..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 h-24 resize-none"
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
                className="flex-1 px-4 py-2 text-white bg-orange-600 rounded-lg hover:bg-orange-700 font-medium disabled:opacity-50"
              >
                {updating ? 'Updating...' : 'Mark as Renege'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}