// app/recruiter/offers/create/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import OfferForm from '@/components/OfferForm'
import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function CreateOfferPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const candidateId = searchParams.get('candidate')
  const [candidate, setCandidate] = useState<any>(null)

  useEffect(() => {
    if (!candidateId) {
      alert('No candidate selected')
      router.push('/recruiter/candidates')
      return
    }

    loadCandidate(candidateId)
  }, [candidateId])

  const loadCandidate = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('candidates')
        .select('id, full_name, current_stage')
        .eq('id', id)
        .single()

      if (error) throw error
      setCandidate(data)
    } catch (error) {
      console.error('Error:', error)
      alert('Error loading candidate')
      router.back()
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="text-gray-600 hover:text-gray-900">
            ← Back
          </button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Create Offer</h2>
            <p className="text-gray-600">Extend offer to {candidate?.full_name}</p>
          </div>
        </div>

        <OfferForm 
          candidateId={candidateId || undefined}
          onSuccess={() => router.push(`/recruiter/candidates/${candidateId}`)}
        />
      </div>
    </DashboardLayout>
  )
}