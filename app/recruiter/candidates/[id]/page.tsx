// app/recruiter/candidates/[id]/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import CandidateDetail from '@/components/CandidateDetail'
import { useParams } from 'next/navigation'

export default function RecruiterCandidateDetailPage() {
  const params = useParams()
  
  return (
    <DashboardLayout>
      <CandidateDetail 
        candidateId={params.id as string} 
        userRole="recruiter" 
      />
    </DashboardLayout>
  )
}