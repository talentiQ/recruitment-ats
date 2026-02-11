// app/tl/candidates/[id]/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import CandidateDetail from '@/components/CandidateDetail'
import { useParams } from 'next/navigation'

export default function TLCandidateDetailPage() {
  const params = useParams()
  
  return (
    <DashboardLayout>
      <CandidateDetail 
        candidateId={params.id as string} 
        userRole="team_leader" 
      />
    </DashboardLayout>
  )
}