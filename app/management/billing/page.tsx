// app/management/billing/page.tsx
'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase as supabaseAdmin } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'
import * as XLSX from 'xlsx'

// ─── Types ────────────────────────────────────────────────────────────────────
type InvoiceStatus = 'issued' | 'paid' | 'overdue' | 'on_hold' | 'clawback'

interface Invoice {
  id: string
  invoice_number: string
  candidate_id: string
  offer_id: string
  client_id: string
  recruiter_id: string
  base_amount: number
  gst_percentage: number
  gst_amount: number
  total_invoice_amount: number
  tds_rate: number
  tds_amount: number
  net_receivable: number
  invoice_date: string
  due_date: string
  payment_date: string | null
  guarantee_end_date: string | null
  status: InvoiceStatus
  amount_received: number | null
  tds_credit: number | null
  clawback_date: string | null
  clawback_reason: string | null
  notes: string | null
  created_at: string
  // Joined display fields
  _candidateName: string
  _clientName: string
  _jobTitle: string
  _recruiterName: string
  _teamName: string
  _overdueDays: number
  _paymentSafetyStatus: 'safe' | 'at_risk' | 'critical' | null
  _guaranteeDaysLeft: number | null
}

interface FormData {
  invoice_number: string
  candidate_id: string
  offer_id: string
  client_id: string
  recruiter_id: string
  base_amount: string
  gst_percentage: string
  tds_rate: string
  invoice_date: string
  due_date: string
  guarantee_end_date: string
  notes: string
}

interface PaymentData {
  payment_date: string
  amount_received: string
  tds_credit: string
  notes: string
}

interface ClawbackData {
  clawback_date: string
  clawback_reason: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const today = () => new Date().toISOString().slice(0, 10)
const addDays = (date: string, days: number) => {
  const d = new Date(date); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10)
}
const daysDiff = (from: string, to: string) =>
  Math.floor((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24))

const overdueColor = (days: number) => {
  if (days <= 0)   return ''
  if (days <= 30)  return 'bg-yellow-50 border-yellow-300'
  if (days <= 60)  return 'bg-orange-50 border-orange-300'
  if (days <= 90)  return 'bg-red-50 border-red-300'
  return 'bg-red-100 border-red-500'
}
const overdueBadge = (days: number) => {
  if (days <= 0)   return null
  if (days <= 30)  return { label: `${days}d overdue`, cls: 'bg-yellow-100 text-yellow-800' }
  if (days <= 60)  return { label: `${days}d overdue`, cls: 'bg-orange-100 text-orange-800' }
  if (days <= 90)  return { label: `${days}d overdue`, cls: 'bg-red-100 text-red-700' }
  return { label: `${days}d overdue`, cls: 'bg-red-200 text-red-900 font-bold' }
}

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; cls: string; icon: string }> = {
  issued:   { label: 'Invoice Issued', cls: 'bg-blue-100 text-blue-800',   icon: '📄' },
  paid:     { label: 'Paid',           cls: 'bg-green-100 text-green-800', icon: '✅' },
  overdue:  { label: 'Overdue',        cls: 'bg-red-100 text-red-800',     icon: '🔴' },
  on_hold:  { label: 'On Hold',        cls: 'bg-gray-100 text-gray-700',   icon: '⏸️' },
  clawback: { label: 'Clawback',       cls: 'bg-purple-100 text-purple-800', icon: '↩️' },
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ManagementBillingPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const [invoices, setInvoices]       = useState<Invoice[]>([])
  const [pendingInvoicing, setPendingInvoicing] = useState<any[]>([])
  const [filtered, setFiltered]       = useState<Invoice[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [clientFilter, setClientFilter] = useState<string>('all')
  const [search, setSearch]           = useState('')

  // Modal states
  const [showCreate, setShowCreate]   = useState(false)
  const [showPay, setShowPay]         = useState<Invoice | null>(null)
  const [showClawback, setShowClawback] = useState<Invoice | null>(null)
  const [showEdit, setShowEdit]       = useState<Invoice | null>(null)
  const [saving, setSaving]           = useState(false)

  // Dropdown data
  const [candidates, setCandidates]   = useState<any[]>([])
  const [clients, setClients]         = useState<any[]>([])
  const [userMap, setUserMap]         = useState<Record<string, any>>({})

  // Form states
  const emptyForm: FormData = {
    invoice_number: '', candidate_id: '', offer_id: '', client_id: '',
    recruiter_id: '', base_amount: '', gst_percentage: '18', tds_rate: '10',
    invoice_date: today(), due_date: addDays(today(), 30),
    guarantee_end_date: '', notes: '',
  }
  const [form, setForm]               = useState<FormData>(emptyForm)
  const [payForm, setPayForm]         = useState<PaymentData>({ payment_date: today(), amount_received: '', tds_credit: '', notes: '' })
  const [clawbackForm, setClawbackForm] = useState<ClawbackData>({ clawback_date: today(), clawback_reason: '' })

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) { router.push('/'); return }
    const parsedUser = JSON.parse(userData)
    if (!['ceo', 'ops_head', 'finance_head', 'system_admin'].includes(parsedUser.role)) {
      alert('Access denied. Management only.'); router.push('/'); return
    }
    setUser(parsedUser)
    loadAll()
  }, [])

  // ── Filters ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let r = [...invoices]
    if (statusFilter !== 'all') r = r.filter(i => i.status === statusFilter)
    if (clientFilter !== 'all') r = r.filter(i => i.client_id === clientFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      r = r.filter(i =>
        i.invoice_number.toLowerCase().includes(q) ||
        i._candidateName.toLowerCase().includes(q) ||
        i._clientName.toLowerCase().includes(q) ||
        i._recruiterName.toLowerCase().includes(q)
      )
    }
    setFiltered(r)
  }, [invoices, statusFilter, clientFilter, search])

  // ── Load all data ─────────────────────────────────────────────────────────
  const loadAll = async () => {
    setLoading(true)
    try {
      // Users map (same pattern as teams page)
      const { data: allUsers } = await supabaseAdmin
        .from('users').select('id, full_name, role, reports_to').eq('is_active', true)
      const uMap: Record<string, any> = {}
      ;(allUsers || []).forEach((u: any) => { uMap[u.id] = u })
      setUserMap(uMap)

      const allRecruiterIds = Object.keys(uMap)

      // Clients
      const { data: allClients } = await supabaseAdmin
        .from('clients').select('id, company_name, payment_terms_days, replacement_guarantee_days')
      setClients(allClients || [])
      const clientMap: Record<string, any> = {}
      ;(allClients || []).forEach((c: any) => { clientMap[c.id] = c })

      // Candidates who have joined (for create form dropdown)
      const { data: joinedCandidates } = await supabaseAdmin
        .from('candidates')
        .select(`id, full_name, assigned_to, job_id, jobs(job_title, client_id, clients(company_name))`)
        .eq('current_stage', 'joined')
        .in('assigned_to', allRecruiterIds)
      setCandidates(joinedCandidates || [])

      // Invoices scoped by recruiter_id (same pattern as offers page)
      const { data: rawInvoices } = await supabaseAdmin
        .from('invoices')
        .select(`
          *,
          candidates ( id, full_name, jobs ( job_title, clients ( company_name ) ) ),
          clients ( company_name ),
          users!invoices_recruiter_id_fkey ( full_name )
        `)
        .in('recruiter_id', allRecruiterIds)
        .order('invoice_date', { ascending: false })

      const todayStr = today()
      const mapped: Invoice[] = (rawInvoices || []).map((inv: any) => {
        const overdueDays = inv.status !== 'paid' && inv.status !== 'clawback'
          ? Math.max(0, daysDiff(inv.due_date, todayStr))
          : 0

        // Payment safety vs guarantee
        let paymentSafetyStatus: Invoice['_paymentSafetyStatus'] = null
        let guaranteeDaysLeft: number | null = null
        if (inv.guarantee_end_date) {
          guaranteeDaysLeft = daysDiff(todayStr, inv.guarantee_end_date)
          if (guaranteeDaysLeft > 30)     paymentSafetyStatus = 'safe'
          else if (guaranteeDaysLeft > 0) paymentSafetyStatus = 'at_risk'
          else                             paymentSafetyStatus = 'critical'
        }

        // Team resolution
        const recruiter = uMap[inv.recruiter_id]
        let teamName = '—'
        if (recruiter) {
          if (!recruiter.reports_to) teamName = recruiter.full_name
          else {
            const parent = uMap[recruiter.reports_to]
            teamName = parent ? (!parent.reports_to ? parent.full_name : (uMap[parent.reports_to]?.full_name || parent.full_name)) : recruiter.full_name
          }
        }

        return {
          ...inv,
          _candidateName: inv.candidates?.full_name || '—',
          _clientName:    inv.clients?.company_name || '—',
          _jobTitle:      inv.candidates?.jobs?.job_title || '—',
          _recruiterName: inv.users?.full_name || uMap[inv.recruiter_id]?.full_name || '—',
          _teamName:      teamName,
          _overdueDays:   overdueDays,
          _paymentSafetyStatus: paymentSafetyStatus,
          _guaranteeDaysLeft: guaranteeDaysLeft,
        }
      })

      setInvoices(mapped)

      // Candidates with no invoice yet — cross-check joined candidates vs invoices
      const invoicedCandidateIds = new Set((rawInvoices || []).map((inv: any) => inv.candidate_id).filter(Boolean))
      const pending = (joinedCandidates || []).filter((c: any) => !invoicedCandidateIds.has(c.id)).map((c: any) => ({
        id: c.id,
        full_name: c.full_name,
        assigned_to: c.assigned_to,
        job_title: c.jobs?.job_title || '—',
        client_name: c.jobs?.clients?.company_name || '—',
        client_id: c.jobs?.client_id || null,
        recruiter_name: uMap[c.assigned_to]?.full_name || '—',
      }))
      setPendingInvoicing(pending)
    } catch (err) {
      console.error('Error loading billing data:', err)
    } finally {
      setLoading(false)
    }
  }

  // ── Computed KPIs ─────────────────────────────────────────────────────────
  const kpis = {
    totalInvoiced:   invoices.reduce((s, i) => s + i.total_invoice_amount, 0),
    totalCollected:  invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amount_received || 0), 0),
    totalOutstanding: invoices.filter(i => ['issued', 'overdue', 'on_hold'].includes(i.status)).reduce((s, i) => s + i.net_receivable, 0),
    totalOverdue:    invoices.filter(i => i.status === 'overdue' || (i._overdueDays > 0 && i.status === 'issued')).reduce((s, i) => s + i.net_receivable, 0),
    totalTdsCredit:  invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.tds_credit || 0), 0),
    totalClawback:   invoices.filter(i => i.status === 'clawback').reduce((s, i) => s + i.base_amount, 0),
    countIssued:     invoices.filter(i => i.status === 'issued').length,
    countPaid:       invoices.filter(i => i.status === 'paid').length,
    countOverdue:    invoices.filter(i => i.status === 'overdue' || (i._overdueDays > 0 && i.status === 'issued')).length,
    countOnHold:     invoices.filter(i => i.status === 'on_hold').length,
    countClawback:   invoices.filter(i => i.status === 'clawback').length,
    countPending:    pendingInvoicing.length,
  }

  // ── Form helpers ──────────────────────────────────────────────────────────
  const calcAmounts = (base: number, gstPct: number, tdsPct: number) => {
    const gst = +(base * gstPct / 100).toFixed(2)
    const total = +(base + gst).toFixed(2)
    const tds = +(base * tdsPct / 100).toFixed(2)
    const net = +(total - tds).toFixed(2)
    return { gst, total, tds, net }
  }

  const onCandidateSelect = (candidateId: string) => {
    const cand = candidates.find((c: any) => c.id === candidateId)
    if (!cand) return
    const client = clients.find((cl: any) => cl.id === cand.jobs?.client_id)
    const payTerms = client?.payment_terms_days || 30
    const guaranteeDays = client?.replacement_guarantee_days || 90
    const invDate = form.invoice_date || today()
    setForm(f => ({
      ...f,
      candidate_id: candidateId,
      client_id: cand.jobs?.client_id || '',
      recruiter_id: cand.assigned_to || '',
      due_date: addDays(invDate, payTerms),
      guarantee_end_date: addDays(invDate, guaranteeDays),
    }))
  }

  const onInvoiceDateChange = (date: string) => {
    const client = clients.find(c => c.id === form.client_id)
    const payTerms = client?.payment_terms_days || 30
    setForm(f => ({ ...f, invoice_date: date, due_date: addDays(date, payTerms) }))
  }

  // ── Create invoice ────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.invoice_number || !form.candidate_id || !form.base_amount) {
      alert('Invoice number, candidate, and base amount are required.'); return
    }
    setSaving(true)
    const base = parseFloat(form.base_amount)
    const gstPct = parseFloat(form.gst_percentage) || 18
    const tdsPct = parseFloat(form.tds_rate) || 10
    const { gst, total, tds, net } = calcAmounts(base, gstPct, tdsPct)

    const payload = {
      invoice_number: form.invoice_number,
      candidate_id: form.candidate_id || null,
      offer_id: form.offer_id || null,
      client_id: form.client_id || null,
      recruiter_id: form.recruiter_id || null,
      base_amount: base,
      gst_percentage: gstPct,
      gst_amount: gst,
      total_invoice_amount: total,
      tds_rate: tdsPct,
      tds_amount: tds,
      net_receivable: net,
      invoice_date: form.invoice_date,
      due_date: form.due_date,
      guarantee_end_date: form.guarantee_end_date || null,
      status: 'issued' as InvoiceStatus,
      notes: form.notes || null,
      created_by: user?.id || null,
    }

    const { error } = await supabaseAdmin.from('invoices').insert(payload)
    if (error) { alert('Error creating invoice: ' + error.message); setSaving(false); return }
    setShowCreate(false); setForm(emptyForm); await loadAll()
    setSaving(false)
  }

  // ── Edit invoice ──────────────────────────────────────────────────────────
  const handleEdit = async () => {
    if (!showEdit) return
    setSaving(true)
    const base = parseFloat(form.base_amount)
    const gstPct = parseFloat(form.gst_percentage) || 18
    const tdsPct = parseFloat(form.tds_rate) || 10
    const { gst, total, tds, net } = calcAmounts(base, gstPct, tdsPct)

    const { error } = await supabaseAdmin.from('invoices').update({
      invoice_number: form.invoice_number,
      base_amount: base,
      gst_percentage: gstPct,
      gst_amount: gst,
      total_invoice_amount: total,
      tds_rate: tdsPct,
      tds_amount: tds,
      net_receivable: net,
      invoice_date: form.invoice_date,
      due_date: form.due_date,
      guarantee_end_date: form.guarantee_end_date || null,
      notes: form.notes || null,
    }).eq('id', showEdit.id)

    if (error) { alert('Error updating invoice: ' + error.message); setSaving(false); return }
    setShowEdit(null); setForm(emptyForm); await loadAll()
    setSaving(false)
  }

  // ── Record payment ────────────────────────────────────────────────────────
  const handlePayment = async () => {
    if (!showPay || !payForm.payment_date || !payForm.amount_received) {
      alert('Payment date and amount received are required.'); return
    }
    setSaving(true)
    const { error } = await supabaseAdmin.from('invoices').update({
      status: 'paid',
      payment_date: payForm.payment_date,
      amount_received: parseFloat(payForm.amount_received),
      tds_credit: payForm.tds_credit ? parseFloat(payForm.tds_credit) : showPay.tds_amount,
      notes: payForm.notes || showPay.notes,
    }).eq('id', showPay.id)

    if (error) { alert('Error recording payment: ' + error.message); setSaving(false); return }
    setShowPay(null); await loadAll()
    setSaving(false)
  }

  // ── Clawback ──────────────────────────────────────────────────────────────
  const handleClawback = async () => {
    if (!showClawback || !clawbackForm.clawback_date || !clawbackForm.clawback_reason) {
      alert('Clawback date and reason are required.'); return
    }
    setSaving(true)
    const { error } = await supabaseAdmin.from('invoices').update({
      status: 'clawback',
      clawback_date: clawbackForm.clawback_date,
      clawback_reason: clawbackForm.clawback_reason,
    }).eq('id', showClawback.id)

    if (error) { alert('Error recording clawback: ' + error.message); setSaving(false); return }
    setShowClawback(null); await loadAll()
    setSaving(false)
  }

  // ── Status change (on hold / reissue) ─────────────────────────────────────
  const updateStatus = async (id: string, status: InvoiceStatus) => {
    await supabaseAdmin.from('invoices').update({ status }).eq('id', id)
    await loadAll()
  }

  // ── Open edit modal ───────────────────────────────────────────────────────
  const openEdit = (inv: Invoice) => {
    setForm({
      invoice_number: inv.invoice_number,
      candidate_id: inv.candidate_id,
      offer_id: inv.offer_id || '',
      client_id: inv.client_id || '',
      recruiter_id: inv.recruiter_id || '',
      base_amount: String(inv.base_amount),
      gst_percentage: String(inv.gst_percentage),
      tds_rate: String(inv.tds_rate),
      invoice_date: inv.invoice_date,
      due_date: inv.due_date,
      guarantee_end_date: inv.guarantee_end_date || '',
      notes: inv.notes || '',
    })
    setShowEdit(inv)
  }

  // ── Open pay modal ────────────────────────────────────────────────────────
  const openPay = (inv: Invoice) => {
    setPayForm({
      payment_date: today(),
      amount_received: String(inv.net_receivable),
      tds_credit: String(inv.tds_amount),
      notes: '',
    })
    setShowPay(inv)
  }

  // ── Excel export ──────────────────────────────────────────────────────────
  const exportExcel = () => {
    setExporting(true)
    const wb = XLSX.utils.book_new()
    const headers = [
      'Invoice #', 'Candidate', 'Client', 'Job', 'Recruiter', 'Team',
      'Invoice Date', 'Due Date', 'Payment Date', 'Guarantee End',
      'Base Amount', 'GST (18%)', 'Total Invoice', 'TDS Rate', 'TDS Amount', 'Net Receivable',
      'Amount Received', 'TDS Credit', 'Status', 'Overdue Days', 'Notes'
    ]
    const rows = filtered.map(i => [
      i.invoice_number, i._candidateName, i._clientName, i._jobTitle, i._recruiterName, i._teamName,
      i.invoice_date, i.due_date, i.payment_date || '', i.guarantee_end_date || '',
      i.base_amount, i.gst_amount, i.total_invoice_amount, `${i.tds_rate}%`, i.tds_amount, i.net_receivable,
      i.amount_received || '', i.tds_credit || '', i.status, i._overdueDays > 0 ? i._overdueDays : '',
      i.notes || ''
    ])
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    ws['!cols'] = [{ wch: 14 }, { wch: 20 }, { wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 18 },
      ...Array(4).fill({ wch: 14 }), ...Array(10).fill({ wch: 16 }), { wch: 10 }, { wch: 30 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices')
    XLSX.writeFile(wb, `Billing_${today()}.xlsx`)
    setExporting(false)
  }

  if (loading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    </DashboardLayout>
  )

  const uniqueClients = [...new Map(invoices.map(i => [i.client_id, { id: i.client_id, name: i._clientName }])).values()]

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6 pb-8">

        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-emerald-400 to-blue-700 rounded-lg p-6 text-white flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-1">💰 Billing & Revenue Management</h1>
            <p className="text-emerald-200">Invoice tracking · Payment collection · Clawback management</p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportExcel} disabled={exporting}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-semibold flex items-center gap-2 transition">
              📥 Export Excel
            </button>
            <button onClick={() => { setForm(emptyForm); setShowCreate(true) }}
              className="px-4 py-2 bg-white text-emerald-700 hover:bg-emerald-50 rounded-lg text-sm font-bold flex items-center gap-2 transition">
              ➕ New Invoice
            </button>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Pending Invoice', value: String(kpis.countPending),  color: 'text-amber-600',   sub: 'not yet issued' },
            { label: 'Total Invoiced',   value: fmt(kpis.totalInvoiced),   color: 'text-gray-900',    sub: `${invoices.length} invoices` },
            { label: 'Collected',        value: fmt(kpis.totalCollected),  color: 'text-green-700',   sub: `${kpis.countPaid} paid` },
            { label: 'Outstanding',      value: fmt(kpis.totalOutstanding),color: 'text-blue-700',    sub: `${kpis.countIssued} issued` },
            { label: 'Overdue',          value: fmt(kpis.totalOverdue),    color: 'text-red-700',     sub: `${kpis.countOverdue} invoices` },
            { label: 'TDS Credit',       value: fmt(kpis.totalTdsCredit),  color: 'text-purple-700',  sub: 'claimable' },
            { label: 'Clawback',         value: fmt(kpis.totalClawback),   color: 'text-orange-700',  sub: `${kpis.countClawback} invoices` },
          ].map(({ label, value, color, sub }) => (
            <div key={label} className="bg-white rounded-lg p-4 shadow text-center">
              <div className="text-xs text-gray-500 mb-1">{label}</div>
              <div className={`text-lg font-bold ${color} leading-tight`}>{value}</div>
              <div className="text-xs text-gray-400 mt-1">{sub}</div>
            </div>
          ))}
        </div>

        {/* ── Status Filter + Search ── */}
        <div className="bg-white rounded-lg shadow p-4 flex flex-wrap gap-3 items-center">
          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'all',      label: `All (${invoices.length})` },
              { key: 'pending',  label: `⏳ Not Invoiced (${kpis.countPending})` },
              { key: 'issued',   label: `📄 Issued (${kpis.countIssued})` },
              { key: 'paid',     label: `✅ Paid (${kpis.countPaid})` },
              { key: 'overdue',  label: `🔴 Overdue (${kpis.countOverdue})` },
              { key: 'on_hold',  label: `⏸️ On Hold (${kpis.countOnHold})` },
              { key: 'clawback', label: `↩️ Clawback (${kpis.countClawback})` },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setStatusFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${statusFilter === key ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-300 hover:border-emerald-400'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 ml-auto items-center">
            <select value={clientFilter} onChange={e => setClientFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="all">All Clients</option>
              {uniqueClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="text" placeholder="Search invoice #, candidate, client..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
        </div>

        {/* ── Pending Invoicing Section ── */}
        {statusFilter === 'pending' && (
          <div className="space-y-3">
            {pendingInvoicing.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <div className="text-4xl mb-3">🎉</div>
                <p className="text-gray-500 font-medium">All joined candidates have been invoiced!</p>
              </div>
            ) : (
              <>
                <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 flex items-center gap-3">
                  <span className="text-2xl">⏳</span>
                  <div>
                    <p className="font-bold text-amber-800">{pendingInvoicing.length} candidate{pendingInvoicing.length !== 1 ? 's' : ''} joined but invoice not yet raised</p>
                    <p className="text-amber-600 text-sm">Click "Create Invoice" on any row to raise the invoice now.</p>
                  </div>
                </div>
                {pendingInvoicing.map((c: any) => (
                  <div key={c.id} className="bg-white rounded-lg shadow border border-amber-200 p-5 flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-gray-900">{c.full_name}</span>
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-xs font-bold">⏳ Invoice Pending</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        💼 {c.job_title} · 🏢 {c.client_name} · 👤 {c.recruiter_name}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setForm({ ...emptyForm, candidate_id: c.id, client_id: c.client_id || '' })
                        // auto-select candidate to trigger onCandidateSelect
                        onCandidateSelect(c.id)
                        setShowCreate(true)
                      }}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition flex-shrink-0">
                      ➕ Create Invoice
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* ── Invoice List ── */}
        {statusFilter !== 'pending' && (filtered.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-gray-500">No invoices found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(inv => {
              const badge = overdueBadge(inv._overdueDays)
              const sc = STATUS_CONFIG[inv.status]
              const isOverdueRow = inv._overdueDays > 0 && inv.status !== 'paid' && inv.status !== 'clawback'
              return (
                <div key={inv.id}
                  className={`bg-white rounded-lg shadow border transition ${isOverdueRow ? overdueColor(inv._overdueDays) : 'border-gray-100'}`}>
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap">

                      {/* Left block */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-bold text-gray-900 text-base">{inv.invoice_number}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${sc.cls}`}>{sc.icon} {sc.label}</span>
                          {badge && <span className={`px-2 py-0.5 rounded text-xs font-bold ${badge.cls}`}>{badge.label}</span>}
                          {inv._paymentSafetyStatus === 'at_risk' && <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded text-xs">⚠️ Guarantee at risk</span>}
                          {inv._paymentSafetyStatus === 'critical' && <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs">🚨 Guarantee expired</span>}
                          {inv._paymentSafetyStatus === 'safe' && inv.status !== 'paid' && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">🛡️ In guarantee</span>}
                        </div>
                        <div className="text-sm text-gray-700 font-medium">{inv._candidateName} · <span className="text-gray-500">{inv._clientName}</span></div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {inv._jobTitle} · Recruiter: {inv._recruiterName} · Team: {inv._teamName}
                        </div>
                      </div>

                      {/* Right block — financials */}
                      <div className="text-right flex-shrink-0 min-w-48">
                        <div className="text-xs text-gray-400 grid grid-cols-2 gap-x-4 gap-y-0.5 text-right">
                          <span className="text-left text-gray-500">Base:</span>       <span className="font-semibold text-gray-800">{fmt(inv.base_amount)}</span>
                          <span className="text-left text-gray-500">GST (18%):</span>  <span className="text-gray-600">{fmt(inv.gst_amount)}</span>
                          <span className="text-left text-gray-500">Total:</span>      <span className="font-bold text-gray-900">{fmt(inv.total_invoice_amount)}</span>
                          <span className="text-left text-gray-500">TDS ({inv.tds_rate}%):</span> <span className="text-orange-600">-{fmt(inv.tds_amount)}</span>
                          <span className="text-left font-semibold text-emerald-700">Net Receivable:</span> <span className="font-bold text-emerald-700">{fmt(inv.net_receivable)}</span>
                          {inv.status === 'paid' && inv.amount_received && <>
                            <span className="text-left text-green-600">Received:</span><span className="font-bold text-green-600">{fmt(inv.amount_received)}</span>
                            <span className="text-left text-purple-600">TDS Credit:</span><span className="text-purple-600">{fmt(inv.tds_credit || 0)}</span>
                          </>}
                          {inv.status === 'clawback' && <><span className="text-left text-purple-700 col-span-2 font-semibold">↩️ Clawback: {inv.clawback_date}</span></>}
                        </div>
                      </div>
                    </div>

                    {/* Dates row */}
                    <div className="flex items-center gap-5 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500 flex-wrap">
                      <span>📅 Invoice: <strong>{inv.invoice_date}</strong></span>
                      <span className={inv._overdueDays > 0 && inv.status !== 'paid' ? 'text-red-600 font-semibold' : ''}>
                        ⏰ Due: <strong>{inv.due_date}</strong>
                      </span>
                      {inv.payment_date && <span className="text-green-600">✅ Paid: <strong>{inv.payment_date}</strong></span>}
                      {inv.guarantee_end_date && (
                        <span>
                          🛡️ Guarantee until: <strong>{inv.guarantee_end_date}</strong>
                          {inv._guaranteeDaysLeft !== null && inv._guaranteeDaysLeft > 0 && ` (${inv._guaranteeDaysLeft}d left)`}
                          {inv._guaranteeDaysLeft !== null && inv._guaranteeDaysLeft <= 0 && ' (expired)'}
                        </span>
                      )}
                      {inv.notes && <span className="text-gray-400 italic truncate max-w-xs">📝 {inv.notes}</span>}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {['issued', 'overdue'].includes(inv.status) && (
                        <button onClick={() => openPay(inv)}
                          className="px-3 py-1.5 bg-green-600 text-white rounded text-xs font-semibold hover:bg-green-700 transition">
                          ✅ Record Payment
                        </button>
                      )}
                      {['issued', 'overdue', 'on_hold'].includes(inv.status) && (
                        <button onClick={() => { setClawbackForm({ clawback_date: today(), clawback_reason: '' }); setShowClawback(inv) }}
                          className="px-3 py-1.5 bg-purple-600 text-white rounded text-xs font-semibold hover:bg-purple-700 transition">
                          ↩️ Clawback
                        </button>
                      )}
                      {inv.status === 'paid' && (
                        <button onClick={() => { setClawbackForm({ clawback_date: today(), clawback_reason: '' }); setShowClawback(inv) }}
                          className="px-3 py-1.5 bg-purple-600 text-white rounded text-xs font-semibold hover:bg-purple-700 transition">
                          ↩️ Clawback (post-payment)
                        </button>
                      )}
                      {inv.status === 'issued' && (
                        <button onClick={() => updateStatus(inv.id, 'on_hold')}
                          className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-xs font-semibold hover:bg-gray-300 transition">
                          ⏸️ On Hold
                        </button>
                      )}
                      {inv.status === 'on_hold' && (
                        <button onClick={() => updateStatus(inv.id, 'issued')}
                          className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded text-xs font-semibold hover:bg-blue-200 transition">
                          ▶️ Re-issue
                        </button>
                      )}
                      <button onClick={() => openEdit(inv)}
                        className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded text-xs font-semibold hover:bg-gray-200 transition">
                        ✏️ Edit
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          CREATE / EDIT INVOICE MODAL
      ════════════════════════════════════════════════════════════════════ */}
      {(showCreate || showEdit) && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">
                  {showCreate ? '➕ New Invoice' : '✏️ Edit Invoice'}
                </h2>
                <button onClick={() => { setShowCreate(false); setShowEdit(null); setForm(emptyForm) }}
                  className="text-gray-400 hover:text-gray-600 text-2xl">✕</button>
              </div>

              <div className="space-y-4">
                {/* Invoice number */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Invoice Number (from Zoho) *</label>
                  <input type="text" placeholder="e.g. INV-2025-001"
                    value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>

                {/* Candidate */}
                {showCreate && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Candidate (Joined) *</label>
                    <select value={form.candidate_id} onChange={e => onCandidateSelect(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      <option value="">Select candidate...</option>
                      {candidates.map((c: any) => (
                        <option key={c.id} value={c.id}>{c.full_name} — {c.jobs?.clients?.company_name || 'Unknown Client'}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Dates row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Invoice Date *</label>
                    <input type="date" value={form.invoice_date}
                      onChange={e => onInvoiceDateChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Due Date *</label>
                    <input type="date" value={form.due_date}
                      onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                </div>

                {/* Base amount + GST */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Base Amount (₹) *</label>
                    <input type="number" placeholder="e.g. 100000"
                      value={form.base_amount} onChange={e => setForm(f => ({ ...f, base_amount: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">GST %</label>
                    <input type="number" value={form.gst_percentage}
                      onChange={e => setForm(f => ({ ...f, gst_percentage: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                </div>

                {/* TDS */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">TDS Rate</label>
                  <div className="flex gap-3">
                    {[2, 10].map(rate => (
                      <button key={rate} onClick={() => setForm(f => ({ ...f, tds_rate: String(rate) }))}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition ${form.tds_rate === String(rate) ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-600'}`}>
                        TDS {rate}%
                      </button>
                    ))}
                    <button onClick={() => setForm(f => ({ ...f, tds_rate: '0' }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition ${form.tds_rate === '0' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-600'}`}>
                      No TDS
                    </button>
                  </div>
                </div>

                {/* Live preview */}
                {form.base_amount && (
                  <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
                    <p className="text-xs font-bold text-emerald-800 mb-2 uppercase">Invoice Preview</p>
                    {(() => {
                      const base = parseFloat(form.base_amount) || 0
                      const gstPct = parseFloat(form.gst_percentage) || 18
                      const tdsPct = parseFloat(form.tds_rate) || 0
                      const { gst, total, tds, net } = calcAmounts(base, gstPct, tdsPct)
                      return (
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                          <span className="text-gray-600">Base Amount:</span>      <span className="font-semibold">{fmt(base)}</span>
                          <span className="text-gray-600">+ GST ({gstPct}%):</span> <span>{fmt(gst)}</span>
                          <span className="text-gray-600 font-semibold">Total Invoice:</span> <span className="font-bold text-gray-900">{fmt(total)}</span>
                          <span className="text-gray-600">- TDS ({tdsPct}%):</span> <span className="text-orange-600">-{fmt(tds)}</span>
                          <span className="text-emerald-700 font-bold">Net Receivable:</span> <span className="font-bold text-emerald-700">{fmt(net)}</span>
                          <span className="text-purple-600">TDS Credit:</span> <span className="text-purple-600">{fmt(tds)}</span>
                        </div>
                      )
                    })()}
                  </div>
                )}

                {/* Guarantee end */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Guarantee End Date</label>
                  <input type="date" value={form.guarantee_end_date}
                    onChange={e => setForm(f => ({ ...f, guarantee_end_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  <p className="text-xs text-gray-400 mt-1">Auto-filled from client guarantee period when candidate is selected</p>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Notes</label>
                  <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Any remarks..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => { setShowCreate(false); setShowEdit(null); setForm(emptyForm) }}
                  className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition">
                  Cancel
                </button>
                <button onClick={showCreate ? handleCreate : handleEdit} disabled={saving}
                  className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-60">
                  {saving ? 'Saving...' : showCreate ? 'Create Invoice' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          RECORD PAYMENT MODAL
      ════════════════════════════════════════════════════════════════════ */}
      {showPay && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">✅ Record Payment</h2>
                <button onClick={() => setShowPay(null)} className="text-gray-400 hover:text-gray-600 text-2xl">✕</button>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
                <p className="font-semibold">{showPay.invoice_number} · {showPay._candidateName}</p>
                <p className="text-gray-500">{showPay._clientName}</p>
                <p className="text-emerald-700 font-bold mt-1">Net Receivable: {fmt(showPay.net_receivable)}</p>
                <p className="text-purple-600 text-xs">TDS Credit expected: {fmt(showPay.tds_amount)}</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Payment Date *</label>
                  <input type="date" value={payForm.payment_date}
                    onChange={e => setPayForm(f => ({ ...f, payment_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Amount Received (₹) *</label>
                  <input type="number" value={payForm.amount_received}
                    onChange={e => setPayForm(f => ({ ...f, amount_received: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">TDS Credit (₹)</label>
                  <input type="number" value={payForm.tds_credit}
                    onChange={e => setPayForm(f => ({ ...f, tds_credit: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  <p className="text-xs text-gray-400 mt-1">Pre-filled with expected TDS. Adjust if needed.</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Notes</label>
                  <input type="text" value={payForm.notes} placeholder="UTR / cheque number etc."
                    onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowPay(null)}
                  className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
                <button onClick={handlePayment} disabled={saving}
                  className="flex-1 py-2.5 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 disabled:opacity-60">
                  {saving ? 'Saving...' : 'Confirm Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          CLAWBACK MODAL
      ════════════════════════════════════════════════════════════════════ */}
      {showClawback && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">↩️ Mark as Clawback</h2>
                <button onClick={() => setShowClawback(null)} className="text-gray-400 hover:text-gray-600 text-2xl">✕</button>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 mb-4 text-sm border border-purple-200">
                <p className="font-semibold">{showClawback.invoice_number} · {showClawback._candidateName}</p>
                <p className="text-gray-500">{showClawback._clientName}</p>
                <p className="text-purple-700 font-bold mt-1">Base Amount: {fmt(showClawback.base_amount)}</p>
                <p className="text-xs text-purple-500 mt-1">This will deduct from total revenue and mark the invoice as clawback.</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Clawback Date *</label>
                  <input type="date" value={clawbackForm.clawback_date}
                    onChange={e => setClawbackForm(f => ({ ...f, clawback_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Reason *</label>
                  <textarea rows={3} value={clawbackForm.clawback_reason}
                    onChange={e => setClawbackForm(f => ({ ...f, clawback_reason: e.target.value }))}
                    placeholder="Candidate left within guarantee period. Client requesting refund / credit note..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowClawback(null)}
                  className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
                <button onClick={handleClawback} disabled={saving}
                  className="flex-1 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-bold hover:bg-purple-700 disabled:opacity-60">
                  {saving ? 'Saving...' : 'Confirm Clawback'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </DashboardLayout>
  )
}
