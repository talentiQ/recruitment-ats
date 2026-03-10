// app/management/candidates/add/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import AddCandidateForm from '@/components/AddCandidateForm'

export default function ManagementAddCandidatePage() {
  return (
    <DashboardLayout>
      <AddCandidateForm
        userRole="ceo"
        redirectPath="/management/candidates"
      />
    </DashboardLayout>
  )
}
