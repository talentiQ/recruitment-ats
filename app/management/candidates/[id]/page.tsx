// app/management/candidates/[id]/edit/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import AddCandidateForm from '@/components/AddCandidateForm'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase as supabaseAdmin } from '@/lib/supabase'

export default function ManagementEditCandidatePage() {
  const params   = useParams()
  const router   = useRouter()
  const [loading, setLoading]     = useState(true)
  const [candidate, setCandidate] = useState<any>(null)
  const [error, setError]         = useState<string>('')

  const candidateId = Array.isArray(params.id) ? params.id[0] : params.id

  useEffect(() => {
    if (candidateId) loadCandidate()
  }, [candidateId])

  const loadCandidate = async () => {
    try {
      const { data, error } = await supabaseAdmin
        .from('candidates')
        .select('*')
        .eq('id', candidateId)
        .maybeSingle()

      if (error) { setError(error.message); throw error }
      if (!data)  { setError('Candidate not found'); return }

      setCandidate(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4" />
        <p className="text-gray-600">Loading candidate data…</p>
      </div>
    </DashboardLayout>
  )

  if (error || !candidate) return (
    <DashboardLayout>
      <div className="text-center py-12">
        <p className="text-red-600 text-lg mb-2">Error loading candidate</p>
        <p className="text-gray-600 mb-4">{error || 'Candidate not found'}</p>
        <button onClick={() => router.back()} className="btn-primary">Go Back</button>
      </div>
    </DashboardLayout>
  )

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="text-gray-600 hover:text-gray-900">
            ← Back
          </button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Edit Candidate</h2>
            <p className="text-gray-600">Update {candidate.full_name}&apos;s information</p>
          </div>
        </div>

        <AddCandidateForm
          key={candidate.id}
          userRole="ceo"
          redirectPath={`/management/candidates/${candidateId}`}
          existingCandidate={candidate}
          isEditMode={true}
        />
      </div>
    </DashboardLayout>
  )
}
