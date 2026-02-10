// app/tl/candidates/add/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import AddCandidateForm from '@/components/AddCandidateForm'

export default function TLAddCandidatePage() {
  return (
    <DashboardLayout>
      <AddCandidateForm userRole="team_leader" redirectPath="/tl/candidates" />
    </DashboardLayout>
  )
}