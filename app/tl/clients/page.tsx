// app/tl/clients/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function ClientsPage() {
  const router = useRouter()
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [formData, setFormData] = useState({
    company_name: '',
    industry: '',
    contact_person: '',
    contact_email: '',
    contact_phone: '',
    fee_percentage: '8.33',
    notes: '',
  })

  useEffect(() => {
    loadClients()
  }, [])

  const loadClients = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('company_name')

    if (data) setClients(data)
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const userData = JSON.parse(localStorage.getItem('user') || '{}')
      const { error } = await supabase.from('clients').insert([{
        ...formData,
        fee_percentage: parseFloat(formData.fee_percentage),
        status: 'active',
        created_by: userData.id,
      }])

      if (error) throw error

      alert('✅ Client added successfully!')
      setShowAddForm(false)
      setFormData({
        company_name: '',
        industry: '',
        contact_person: '',
        contact_email: '',
        contact_phone: '',
        fee_percentage: '8.33',
        notes: '',
      })
      loadClients()
    } catch (error: any) {
      alert('Error: ' + error.message)
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Clients</h2>
            <p className="text-gray-600">Manage your client relationships</p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="btn-primary"
          >
            {showAddForm ? 'Cancel' : '+ Add Client'}
          </button>
        </div>

        {/* Add Client Form */}
        {showAddForm && (
          <form onSubmit={handleSubmit} className="card space-y-4">
            <h3 className="text-lg font-semibold">Add New Client</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Company Name *
                </label>
                <input
                  type="text"
                  value={formData.company_name}
                  onChange={e => setFormData({...formData, company_name: e.target.value})}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Industry
                </label>
                <input
                  type="text"
                  value={formData.industry}
                  onChange={e => setFormData({...formData, industry: e.target.value})}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contact Person
                </label>
                <input
                  type="text"
                  value={formData.contact_person}
                  onChange={e => setFormData({...formData, contact_person: e.target.value})}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={formData.contact_email}
                  onChange={e => setFormData({...formData, contact_email: e.target.value})}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={formData.contact_phone}
                  onChange={e => setFormData({...formData, contact_phone: e.target.value})}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fee Percentage (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.fee_percentage}
                  onChange={e => setFormData({...formData, fee_percentage: e.target.value})}
                  className="input"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={e => setFormData({...formData, notes: e.target.value})}
                rows={3}
                className="input"
              />
            </div>
            <button type="submit" className="btn-primary">
              Add Client
            </button>
          </form>
        )}

        {/* Clients Table */}
        {loading ? (
          <div className="card text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Company Name</th>
                  <th>Industry</th>
                  <th>Contact Person</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Fee %</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(client => (
                  <tr key={client.id}>
                    <td className="font-medium">{client.company_name}</td>
                    <td className="text-sm">{client.industry || 'N/A'}</td>
                    <td className="text-sm">{client.contact_person || 'N/A'}</td>
                    <td className="text-sm">{client.contact_email || 'N/A'}</td>
                    <td className="text-sm">{client.contact_phone || 'N/A'}</td>
                    <td className="text-sm font-medium">{client.fee_percentage}%</td>
                    <td>
                      <span className={client.status === 'active' ? 'badge-success' : 'badge-warning'}>
                        {client.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}