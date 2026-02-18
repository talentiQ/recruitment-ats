// app/recruiter/candidates/[id]/edit/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import AddCandidateForm from '@/components/AddCandidateForm'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function RecruiterEditCandidatePage() {
  const params = useParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [candidate, setCandidate] = useState<any>(null)
  const [error, setError] = useState<string>('')

  const candidateId = Array.isArray(params.id) ? params.id[0] : params.id

  console.log('🔵 Edit Page Rendered')
  console.log('🔵 Candidate ID:', candidateId)
  console.log('🔵 Current candidate state:', candidate)

  useEffect(() => {
    console.log('🟢 useEffect triggered')
    if (candidateId) {
      loadCandidate()
    }
  }, [candidateId])

  const loadCandidate = async () => {
    console.log('📥 Starting loadCandidate...')
    console.log('📥 Loading ID:', candidateId)
    
    try {
      const { data, error } = await supabase
        .from('candidates')
        .select('*')
        .eq('id', candidateId)
        .maybeSingle()

      console.log('📦 Supabase response:', { data, error })

      if (error) {
        console.error('❌ Supabase error:', error)
        setError(error.message)
        throw error
      }

      if (!data) {
        console.error('❌ No data returned')
        setError('Candidate not found')
        return
      }

      console.log('✅ Candidate data loaded successfully:')
      console.log('✅ Full Name:', data.full_name)
      console.log('✅ Phone:', data.phone)
      console.log('✅ Email:', data.email)
      console.log('✅ Job ID:', data.job_id)
      console.log('✅ All data:', data)
      
      setCandidate(data)
      console.log('✅ setCandidate called with data')
      
    } catch (error: any) {
      console.error('💥 Error in loadCandidate:', error)
      setError(error.message)
    } finally {
      setLoading(false)
      console.log('✅ Loading complete, loading state set to false')
    }
  }

  console.log('🔵 Before render check:')
  console.log('🔵 loading:', loading)
  console.log('🔵 candidate:', candidate)
  console.log('🔵 error:', error)

  if (loading) {
    console.log('⏳ Rendering loading spinner')
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading candidate data...</p>
          <p className="text-xs text-gray-400 mt-2">ID: {candidateId}</p>
        </div>
      </DashboardLayout>
    )
  }

  if (error || !candidate) {
    console.log('❌ Rendering error state')
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-red-600 text-lg mb-2">Error loading candidate</p>
          <p className="text-gray-600 mb-4">{error || 'Candidate not found'}</p>
          <p className="text-xs text-gray-400 mb-4">ID: {candidateId}</p>
          <button onClick={() => router.back()} className="btn-primary">
            Go Back
          </button>
        </div>
      </DashboardLayout>
    )
  }

  console.log('✅ Rendering form with candidate:', candidate.full_name)

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="text-gray-600 hover:text-gray-900">
            ← Back
          </button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Edit Candidate</h2>
            <p className="text-gray-600">Update {candidate.full_name}'s information</p>
          </div>
        </div>
        
        <AddCandidateForm
          key={candidate.id}
          userRole="recruiter"
          redirectPath={`/recruiter/candidates/${candidateId}`}
          existingCandidate={candidate}
          isEditMode={true}
        />
      </div>
    </DashboardLayout>
  )
}