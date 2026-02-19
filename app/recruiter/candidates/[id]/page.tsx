// app/recruiter/candidates/[id]/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import CandidateDetailView from '@/components/CandidateDetailView'
import { useParams } from 'next/navigation'

export default function RecruiterCandidateDetailPage() {
  const params = useParams()

  return (
    <DashboardLayout>
      <CandidateDetailView 
        candidateId={params.id as string}
        userRole="recruiter"
        basePath="/recruiter"
      />
    </DashboardLayout>
  )
}