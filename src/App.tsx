import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import { DEFAULT_SETTINGS, SAMPLE_LEADS, STAGE_CLASS, STAGES } from './data'
import {
  createLead,
  fetchLeads,
  fetchSettings,
  hasSupabaseConfig,
  removeLead,
  saveSettings,
  updateLeadStage,
} from './supabaseClient'
import type { Lead, LeadInsert, Settings, Stage } from './types'

type Page = 'dashboard' | 'funil' | 'leads' | 'relatorios' | 'config'

const pageTitles: Record<Page, string> = {
  dashboard: 'Dashboard',
  funil: 'Funil de Conversão',
  leads: 'Leads',
  relatorios: 'Indicadores OKR',
  config: 'Configurações',
}

const emptyForm: LeadInsert = {
  name: '',
  phone: '',
  email: '',
  area: 'Previdenciário',
  origin: 'Indicação',
  stage: '1º Contato',
  ticket: 0,
  owner: 'Túlio Lopes',
  days: 0,
  notes: '',
  activity: ['Lead criado — agora'],
}

const currency = (value: number) => `R$ ${Math.round(value || 0).toLocaleString('pt-BR')}`
const firstName = (name: string) => name.split(' ')[0] || name
const shortName = (name: string) => name.split(' ').slice(0, 2).join(' ')

function App() {
  const [activePage, setActivePage] = useState<Page>('dashboard')
  const [leads, setLeads] = useState<Lead[]>(SAMPLE_LEADS)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [currentFilter, setCurrentFilter] = useState<Stage | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [form, setForm] = useState<LeadInsert>(emptyForm)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!hasSupabaseConfig) return

    async function loadData() {
      try {
        const [databaseLeads, databaseSettings] = await Promise.all([
          fetchLeads(),
          fetchSettings(),
        ])

        setLeads(databaseLeads.length ? databaseLeads : SAMPLE_LEADS)
        if (databaseSettings) setSettings(databaseSettings)
      } catch (error) {
        console.error('Erro ao carregar dados do Supabase:', error)
      }
    }

    void loadData()
  }, [])

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === selectedLeadId) || null,
    [leads, selectedLeadId],
  )

  const stats = useMemo(() => {
    const total = leads.length
    const active = leads.filter((lead) => lead.stage !== 'Contrato Assinado').length
    const protocols = leads.filter(
      (lead) => lead.stage === 'Protocolo Iniciado' || lead.stage === 'Contrato Assinado',
    ).length
    const conversion = total > 0 ? Math.round((protocols / total) * 100) : 0
    const tickets = leads.filter((lead) => lead.ticket).map((lead) => lead.ticket)
    const avgTicket = tickets.length
      ? Math.round(tickets.reduce((sum, ticket) => sum + ticket, 0) / tickets.length)
      : 0
    const indication = leads.filter((lead) => lead.origin === 'Indicação').length
    const indicationPct = total > 0 ? Math.round((indication / total) * 100) : 0

    return { total, active, protocols, conversion, avgTicket, indicationPct }
  }, [leads])

  const filteredLeads = useMemo(() => {
    let filtered = [...leads]
    if (currentFilter !== 'all') filtered = filtered.filter((lead) => lead.stage === currentFilter)
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (lead) =>
          lead.name.toLowerCase().includes(query) ||
          lead.area.toLowerCase().includes(query) ||
          lead.origin.toLowerCase().includes(query),
      )
    }
    return filtered
  }, [currentFilter, leads, searchQuery])

  const alerts = useMemo(() => {
    return leads.flatMap((lead) => {
      const leadAlerts = []
      if (lead.days > 20 && lead.stage !== 'Contrato Assinado') {
        leadAlerts.push({
          type: 'warn',
          msg: `${firstName(lead.name)} — ${lead.days} dias no funil (${lead.stage})`,
        })
      }
      if (lead.stage === 'Revisão Advogado') {
        leadAlerts.push({ type: 'action', msg: `${firstName(lead.name)} aguarda revisão do advogado` })
      }
      return leadAlerts
    })
  }, [leads])

  function navigate(page: Page) {
    setActivePage(page)
    setSelectedLeadId(null)
  }

  function openModal(initialStage: Stage = '1º Contato') {
    setForm({ ...emptyForm, stage: initialStage, owner: settings.ownerName })
    setIsModalOpen(true)
  }

  async function handleSaveLead(event: FormEvent) {
    event.preventDefault()
    if (!form.name.trim()) {
      window.alert('Informe o nome do cliente.')
      return
    }

    const newLead: LeadInsert = {
      ...form,
      name: form.name.trim(),
      phone: form.phone || '—',
      email: form.email || '',
      ticket: Number(form.ticket) || 0,
      activity: ['Lead criado — agora'],
    }

    setIsSaving(true)
    try {
      const databaseLead = await createLead(newLead)
      setLeads((current) => [
        databaseLead || { ...newLead, id: `local-${Date.now()}` },
        ...current,
      ])
      setIsModalOpen(false)
      setForm(emptyForm)
    } catch (error) {
      console.error('Erro ao salvar lead:', error)
      window.alert('Não foi possível salvar no Supabase. Confira as variáveis e a tabela leads.')
    } finally {
      setIsSaving(false)
    }
  }

  async function moveLead(id: string, stage: Stage) {
    const lead = leads.find((item) => item.id === id)
    if (!lead || lead.stage === stage) return

    const updatedLead = {
      ...lead,
      stage,
      activity: [`Movido de "${lead.stage}" para "${stage}" — agora`, ...lead.activity],
    }

    setLeads((current) => current.map((item) => (item.id === id ? updatedLead : item)))
    try {
      const databaseLead = await updateLeadStage(updatedLead)
      if (databaseLead) {
        setLeads((current) => current.map((item) => (item.id === id ? databaseLead : item)))
      }
    } catch (error) {
      console.error('Erro ao mover lead:', error)
    }
  }

  async function deleteLead() {
    if (!selectedLead) return
    if (!window.confirm('Remover este lead?')) return

    const id = selectedLead.id
    setLeads((current) => current.filter((lead) => lead.id !== id))
    setSelectedLeadId(null)
    try {
      await removeLead(id)
    } catch (error) {
      console.error('Erro ao remover lead:', error)
    }
  }

  async function handleSaveSettings() {
    try {
      const databaseSettings = await saveSettings(settings)
      if (databaseSettings) setSettings(databaseSettings)
      window.alert('Configurações salvas.')
    } catch (error) {
      console.error('Erro ao salvar configurações:', error)
      window.alert('Não foi possível salvar as configurações no Supabase.')
    }
  }

  const ownerInitials = settings.ownerName
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="firm-name">{settings.firmName.replace(' Advocacia', '')}<br />Advocacia</div>
          <div className="crm-label">CRM v1.0</div>
        </div>

        <div className="nav-section">
          <div className="nav-section-label">Principal</div>
          <button className={`nav-item ${activePage === 'dashboard' ? 'active' : ''}`} onClick={() => navigate('dashboard')}>
            <span className="nav-icon">⬛</span> Dashboard
          </button>
          <button className={`nav-item ${activePage === 'funil' ? 'active' : ''}`} onClick={() => navigate('funil')}>
            <span className="nav-icon">◧</span> Funil
            <span className="nav-badge">{leads.filter((lead) => lead.stage !== 'Contrato Assinado').length}</span>
          </button>
          <button className={`nav-item ${activePage === 'leads' ? 'active' : ''}`} onClick={() => navigate('leads')}>
            <span className="nav-icon">◈</span> Leads
            <span className="nav-badge">{leads.length}</span>
          </button>
        </div>

        <div className="nav-section">
          <div className="nav-section-label">Análise</div>
          <button className={`nav-item ${activePage === 'relatorios' ? 'active' : ''}`} onClick={() => navigate('relatorios')}>
            <span className="nav-icon">◫</span> Indicadores
          </button>
        </div>

        <div className="nav-section">
          <div className="nav-section-label">Config</div>
          <button className={`nav-item ${activePage === 'config' ? 'active' : ''}`} onClick={() => navigate('config')}>
            <span className="nav-icon">◎</span> Configurações
          </button>
        </div>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">{ownerInitials}</div>
            <div>
              <div className="user-name">{settings.ownerName}</div>
              <div className="user-role">Advogado / Admin</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div className="topbar-title">{pageTitles[activePage]}</div>
          <div className="topbar-actions">
            <button className="btn btn-outline" onClick={() => openModal()}>＋ Novo Lead</button>
            <button className="btn btn-gold" onClick={() => openModal('Protocolo Iniciado')}>＋ Novo Protocolo</button>
          </div>
        </div>

        <div className="content">
          {activePage === 'dashboard' && (
            <div className="page-view active">
              <div className="stats-grid">
                <StatCard label="Leads ativos" value={stats.active} sub="no funil hoje" width={65} />
                <StatCard
                  label="Conversão"
                  value={`${stats.conversion}%`}
                  sub={`meta: ≥ ${settings.conversionGoal}%`}
                  width={stats.conversion}
                  tone={stats.conversion >= settings.conversionGoal ? 'good' : 'warn'}
                />
                <StatCard
                  label="Ticket Médio"
                  value={currency(stats.avgTicket)}
                  sub={`meta: ≥ ${currency(settings.minimumTicket)}`}
                  width={85}
                  tone={stats.avgTicket >= settings.minimumTicket ? 'good' : 'warn'}
                />
                <StatCard label="Protocolos / mês" value={stats.protocols} sub="mês atual" width={58} />
                <StatCard label="Indicação" value={`${stats.indicationPct}%`} sub="meta: ≥ 30%" width={stats.indicationPct} tone={stats.indicationPct >= 30 ? 'good' : 'warn'} />
              </div>

              <div className="section-title">
                <span>Funil de conversão</span>
                <button className="btn btn-ghost" onClick={() => navigate('funil')}>Ver completo →</button>
              </div>
              <MiniKanban leads={leads} openDetail={setSelectedLeadId} />

              <div className="dashboard-grid">
                <div className="table-wrap">
                  <div className="table-toolbar compact-toolbar">
                    <div className="toolbar-title">Leads Recentes</div>
                    <button className="btn btn-ghost compact-button" onClick={() => navigate('leads')}>Ver todos</button>
                  </div>
                  <table>
                    <tbody>
                      {leads.slice(0, 6).map((lead) => (
                        <tr key={lead.id} onClick={() => setSelectedLeadId(lead.id)}>
                          <td><b className="recent-name">{shortName(lead.name)}</b></td>
                          <td><span className="tag tag-area">{lead.area}</span></td>
                          <td><span className={`status-pill ${STAGE_CLASS[lead.stage]}`}>{lead.stage}</span></td>
                          <td className="money-cell">{currency(lead.ticket)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="table-wrap">
                  <div className="table-toolbar compact-toolbar">
                    <div className="toolbar-title">Alertas</div>
                  </div>
                  <div className="alert-list">
                    {alerts.length === 0 ? (
                      <div className="empty">Nenhum alerta no momento</div>
                    ) : (
                      alerts.slice(0, 6).map((alert, index) => (
                        <div className="alert-item" key={`${alert.msg}-${index}`}>
                          <span>{alert.type === 'warn' ? '⚠️' : '📋'}</span>
                          <span>{alert.msg}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activePage === 'funil' && (
            <div className="page-view active">
              <Kanban
                leads={leads}
                draggedId={draggedId}
                setDraggedId={setDraggedId}
                moveLead={moveLead}
                openDetail={setSelectedLeadId}
              />
            </div>
          )}

          {activePage === 'leads' && (
            <div className="page-view active">
              <div className="table-wrap">
                <div className="table-toolbar">
                  <div className="toolbar-left">
                    <div className="search-box">
                      🔎
                      <input
                        type="text"
                        placeholder="Buscar lead..."
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                      />
                    </div>
                    <div className="filter-chips">
                      <button className={`chip ${currentFilter === 'all' ? 'active' : ''}`} onClick={() => setCurrentFilter('all')}>Todos</button>
                      <button className={`chip ${currentFilter === 'Protocolo Iniciado' ? 'active' : ''}`} onClick={() => setCurrentFilter('Protocolo Iniciado')}>⭐ Protocolo</button>
                      <button className={`chip ${currentFilter === 'Entrevista Marcada' ? 'active' : ''}`} onClick={() => setCurrentFilter('Entrevista Marcada')}>Entrevista</button>
                      <button className={`chip ${currentFilter === 'Pasta Completa' ? 'active' : ''}`} onClick={() => setCurrentFilter('Pasta Completa')}>Pasta Ok</button>
                    </div>
                  </div>
                  <button className="btn btn-gold" onClick={() => openModal()}>＋ Novo Lead</button>
                </div>
                <LeadsTable leads={filteredLeads} openDetail={setSelectedLeadId} />
              </div>
            </div>
          )}

          {activePage === 'relatorios' && (
            <div className="page-view active">
              <div className="stats-grid three-cols">
                <div className="stat-card">
                  <div className="stat-label">CAC estimado</div>
                  <div className="stat-value stat-good">R$ 160</div>
                  <div className="stat-sub">meta: ≤ R$ 200 ✓</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">ROAS estimado</div>
                  <div className="stat-value stat-good">28x</div>
                  <div className="stat-sub">meta: ≥ 25 ✓</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Inadimplência</div>
                  <div className="stat-value stat-good">7%</div>
                  <div className="stat-sub">meta: ≤ 10% ✓</div>
                </div>
              </div>

              <div className="table-wrap report-card">
                <div className="table-toolbar compact-toolbar">
                  <div className="toolbar-title">Conversão por Etapa</div>
                </div>
                <FunnelChart leads={leads} />
              </div>

              <div className="table-wrap report-card">
                <div className="table-toolbar">
                  <div className="toolbar-title">Origem dos Leads</div>
                </div>
                <OriginChart leads={leads} />
              </div>
            </div>
          )}

          {activePage === 'config' && (
            <div className="page-view active">
              <div className="table-wrap config-wrap">
                <div className="table-toolbar">
                  <div className="toolbar-title">Parâmetros do CRM</div>
                </div>
                <div className="config-form">
                  <label className="form-group">
                    <span className="form-label">Nome do Escritório</span>
                    <input className="form-input" value={settings.firmName} onChange={(event) => setSettings({ ...settings, firmName: event.target.value })} />
                  </label>
                  <label className="form-group">
                    <span className="form-label">Advogado Responsável</span>
                    <input className="form-input" value={settings.ownerName} onChange={(event) => setSettings({ ...settings, ownerName: event.target.value })} />
                  </label>
                  <label className="form-group">
                    <span className="form-label">Meta de Protocolos / Mês</span>
                    <input className="form-input" type="number" value={settings.monthlyProtocolGoal} onChange={(event) => setSettings({ ...settings, monthlyProtocolGoal: Number(event.target.value) })} />
                  </label>
                  <label className="form-group">
                    <span className="form-label">Ticket Médio Mínimo (R$)</span>
                    <input className="form-input" type="number" value={settings.minimumTicket} onChange={(event) => setSettings({ ...settings, minimumTicket: Number(event.target.value) })} />
                  </label>
                  <label className="form-group">
                    <span className="form-label">Meta de Conversão (%)</span>
                    <input className="form-input" type="number" value={settings.conversionGoal} onChange={(event) => setSettings({ ...settings, conversionGoal: Number(event.target.value) })} />
                  </label>
                  <button className="btn btn-gold config-save" onClick={handleSaveSettings}>Salvar Configurações</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <div className={`modal-overlay ${isModalOpen ? 'open' : ''}`} onMouseDown={(event) => {
        if (event.target === event.currentTarget) setIsModalOpen(false)
      }}>
        <form className="modal" onSubmit={handleSaveLead}>
          <div className="modal-header">
            <div className="modal-title">Novo Lead / Protocolo</div>
            <button type="button" className="modal-close" onClick={() => setIsModalOpen(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="form-row">
              <label className="form-group">
                <span className="form-label">Nome Completo *</span>
                <input className="form-input" placeholder="Nome do cliente" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </label>
              <label className="form-group">
                <span className="form-label">Telefone</span>
                <input className="form-input" placeholder="(91) 9 0000-0000" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              </label>
            </div>
            <div className="form-row">
              <label className="form-group">
                <span className="form-label">E-mail</span>
                <input className="form-input" placeholder="email@exemplo.com" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              </label>
              <label className="form-group">
                <span className="form-label">Área Jurídica</span>
                <select className="form-select" value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })}>
                  <option>Previdenciário</option>
                  <option>Trabalhista</option>
                  <option>Cível</option>
                  <option>Criminal</option>
                  <option>Administrativo</option>
                  <option>Família</option>
                </select>
              </label>
            </div>
            <div className="form-row">
              <label className="form-group">
                <span className="form-label">Origem do Lead</span>
                <select className="form-select" value={form.origin} onChange={(event) => setForm({ ...form, origin: event.target.value })}>
                  <option>Indicação</option>
                  <option>WhatsApp</option>
                  <option>Tráfego Pago (Instagram)</option>
                  <option>Tráfego Pago (Google)</option>
                  <option>Site</option>
                  <option>Ligação</option>
                </select>
              </label>
              <label className="form-group">
                <span className="form-label">Ticket Estimado (R$)</span>
                <input className="form-input" type="number" placeholder="6000" value={form.ticket || ''} onChange={(event) => setForm({ ...form, ticket: Number(event.target.value) })} />
              </label>
            </div>
            <div className="form-row">
              <label className="form-group">
                <span className="form-label">Etapa Inicial</span>
                <select className="form-select" value={form.stage} onChange={(event) => setForm({ ...form, stage: event.target.value as Stage })}>
                  {STAGES.map((stage) => <option key={stage}>{stage}</option>)}
                </select>
              </label>
              <label className="form-group">
                <span className="form-label">Responsável</span>
                <select className="form-select" value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })}>
                  <option>Túlio Lopes</option>
                  <option>Coord. Comercial</option>
                  <option>Assistente Jurídico</option>
                </select>
              </label>
            </div>
            <div className="form-row full">
              <label className="form-group">
                <span className="form-label">Observações</span>
                <textarea className="form-textarea" placeholder="Resumo do caso, documentos pendentes, observações importantes..." value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
              </label>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>Cancelar</button>
            <button type="submit" className="btn btn-gold" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar Lead'}</button>
          </div>
        </form>
      </div>

      <DetailPanel
        lead={selectedLead}
        close={() => setSelectedLeadId(null)}
        moveLead={moveLead}
        deleteLead={deleteLead}
      />
    </>
  )
}

function StatCard({ label, value, sub, width, tone }: {
  label: string
  value: string | number
  sub: string
  width: number
  tone?: 'good' | 'warn' | 'bad'
}) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone ? `stat-${tone}` : ''}`}>{value}</div>
      <div className="stat-sub">{sub}</div>
      <div className="stat-bar">
        <div className="stat-bar-fill" style={{ width: `${Math.min(width, 100)}%` }} />
      </div>
    </div>
  )
}

function MiniKanban({ leads, openDetail }: { leads: Lead[], openDetail: (id: string) => void }) {
  const headerColors = ['#e8f0fb', '#fff3e0', '#fff8e1', '#e8f5e9', '#f3e5f5', '#0c1f3a']
  const textColors = ['#1a4a8a', '#8a4a10', '#7a5800', '#1a6a30', '#6a1a7a', '#e8ad4a']

  return (
    <div className="dash-kanban">
      {STAGES.slice(0, 6).map((stage, index) => {
        const stageLeads = leads.filter((lead) => lead.stage === stage)
        return (
          <div className="mini-col" key={stage}>
            <div className="mini-header" style={{ background: headerColors[index], color: textColors[index] }}>
              <span>{stage}</span>
              <span>{stageLeads.length}</span>
            </div>
            <div className="mini-body">
              {stageLeads.slice(0, 3).map((lead) => (
                <button className="mini-card" key={lead.id} onClick={() => openDetail(lead.id)}>
                  {shortName(lead.name)}
                  <span>{lead.area}</span>
                </button>
              ))}
              {stageLeads.length > 3 && <div className="mini-more">+{stageLeads.length - 3} mais</div>}
              {stageLeads.length === 0 && <div className="mini-empty">—</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Kanban({ leads, draggedId, setDraggedId, moveLead, openDetail }: {
  leads: Lead[]
  draggedId: string | null
  setDraggedId: (id: string | null) => void
  moveLead: (id: string, stage: Stage) => void
  openDetail: (id: string) => void
}) {
  return (
    <div className="kanban-wrap">
      {STAGES.map((stage, index) => {
        const stageLeads = leads.filter((lead) => lead.stage === stage)
        return (
          <div className={`kanban-col stage-${index}`} key={stage}>
            <div className="col-header">
              <span className="col-title">{index === 5 ? `⭐ ${stage}` : stage}</span>
              <span className="col-count">{stageLeads.length}</span>
            </div>
            <div
              className="col-body"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                if (draggedId) void moveLead(draggedId, stage)
                setDraggedId(null)
              }}
            >
              {stageLeads.length === 0 && <div className="empty"><div className="empty-icon">◌</div>Sem leads</div>}
              {stageLeads.map((lead) => (
                <button
                  className={`lead-card ${lead.origin === 'Indicação' ? 'starred' : ''}`}
                  draggable
                  key={lead.id}
                  onClick={() => openDetail(lead.id)}
                  onDragStart={() => setDraggedId(lead.id)}
                >
                  <div className="card-name">{lead.name}</div>
                  <div className="card-meta">{lead.area}</div>
                  <div className="card-tags">
                    <span className="tag tag-area">{lead.area}</span>
                    <span className="tag tag-origin">{lead.origin.split(' ')[0]}</span>
                    {lead.days > 15 && <span className="tag tag-urgent">⚑ {lead.days}d</span>}
                  </div>
                  <div className="card-ticket">{currency(lead.ticket)}</div>
                  <div className="card-days">{lead.days} dias no funil · {firstName(lead.owner)}</div>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function LeadsTable({ leads, openDetail }: { leads: Lead[], openDetail: (id: string) => void }) {
  if (leads.length === 0) {
    return <div className="empty table-empty">Nenhum lead encontrado</div>
  }

  return (
    <table>
      <thead>
        <tr>
          <th></th>
          <th>Nome</th>
          <th>Telefone</th>
          <th>Área</th>
          <th>Origem</th>
          <th>Etapa</th>
          <th>Ticket</th>
          <th>Dias</th>
          <th>Resp.</th>
        </tr>
      </thead>
      <tbody>
        {leads.map((lead) => {
          const priorityClass = lead.ticket >= 8000 ? 'p-high' : lead.ticket >= 6000 ? 'p-med' : 'p-low'
          return (
            <tr key={lead.id} onClick={() => openDetail(lead.id)}>
              <td><span className={`priority-dot ${priorityClass}`} /></td>
              <td className="lead-name-cell">{lead.name}</td>
              <td className="mono-cell">{lead.phone}</td>
              <td><span className="tag tag-area">{lead.area}</span></td>
              <td><span className="tag tag-origin origin-cell">{lead.origin}</span></td>
              <td><span className={`status-pill ${STAGE_CLASS[lead.stage]}`}>{lead.stage}</span></td>
              <td className="money-cell strong">{currency(lead.ticket)}</td>
              <td className={`mono-cell ${lead.days > 20 ? 'danger-text' : lead.days > 10 ? 'warn-text' : ''}`}>{lead.days}d</td>
              <td className="muted-cell">{lead.owner}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function FunnelChart({ leads }: { leads: Lead[] }) {
  const max = Math.max(...STAGES.map((stage) => leads.filter((lead) => lead.stage === stage).length), 1)
  const total = Math.max(leads.length, 1)
  const colors = ['#e8f0fb', '#fff3e0', '#fff8e1', '#e8f5e9', '#f3e5f5', '#c8922a', '#1a7a4a']
  const textColors = ['#1a4a8a', '#8a4a10', '#7a5800', '#1a6a30', '#6a1a7a', '#fff', '#fff']

  return (
    <div className="chart-box">
      {STAGES.map((stage, index) => {
        const count = leads.filter((lead) => lead.stage === stage).length
        const pct = Math.round((count / total) * 100)
        const barWidth = Math.round((count / max) * 100)
        return (
          <div className="chart-row" key={stage}>
            <div className="chart-label">{stage}</div>
            <div className="chart-track">
              <div className="chart-fill" style={{ width: `${barWidth}%`, background: colors[index], color: textColors[index] }}>
                {count} leads ({pct}%)
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function OriginChart({ leads }: { leads: Lead[] }) {
  const total = Math.max(leads.length, 1)
  const origins = leads.reduce<Record<string, number>>((acc, lead) => {
    acc[lead.origin] = (acc[lead.origin] || 0) + 1
    return acc
  }, {})

  return (
    <div className="chart-box">
      {Object.entries(origins).sort((a, b) => b[1] - a[1]).map(([origin, count]) => {
        const pct = Math.round((count / total) * 100)
        return (
          <div className="chart-row" key={origin}>
            <div className="chart-label origin-label">{origin}</div>
            <div className="chart-track small">
              <div className="chart-fill origin-fill" style={{ width: `${pct}%` }}>
                {count} ({pct}%)
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DetailPanel({ lead, close, moveLead, deleteLead }: {
  lead: Lead | null
  close: () => void
  moveLead: (id: string, stage: Stage) => void
  deleteLead: () => void
}) {
  const currentStageIndex = lead ? STAGES.indexOf(lead.stage) : -1

  return (
    <div className={`detail-panel ${lead ? 'open' : ''}`}>
      {lead && (
        <>
          <div className="detail-header">
            <div className="detail-header-row">
              <div>
                <div className="detail-name">{lead.name}</div>
                <div className="detail-sub">{lead.area} · {lead.origin}</div>
              </div>
              <button className="detail-close" onClick={close}>✕</button>
            </div>
            <div className="detail-stage-pill">{lead.stage}</div>
            <div className="stage-steps">
              {STAGES.map((stage, index) => (
                <div
                  className={`stage-step ${index < currentStageIndex ? 'done' : index === currentStageIndex ? 'current' : ''}`}
                  key={stage}
                />
              ))}
            </div>
          </div>

          <div className="detail-body">
            <div className="detail-section">
              <div className="detail-section-title">Informações</div>
              <DetailField label="Telefone" value={lead.phone} />
              <DetailField label="E-mail" value={lead.email || '—'} />
              <DetailField label="Área Jurídica" value={lead.area} />
              <DetailField label="Origem" value={lead.origin} />
              <DetailField label="Ticket Estimado" value={currency(lead.ticket)} accent />
              <DetailField label="Responsável" value={lead.owner} />
              <DetailField label="Dias no funil" value={`${lead.days} dias no funil`} />
            </div>

            <div className="detail-section">
              <div className="detail-section-title">Observações</div>
              <div className="detail-notes">{lead.notes || '—'}</div>
            </div>

            <div className="detail-section">
              <div className="detail-section-title">Mover para Etapa</div>
              <div className="move-stage-row">
                {STAGES.map((stage, index) => (
                  <button
                    className={`stage-btn ${stage === lead.stage ? 'current-stage' : ''}`}
                    key={stage}
                    onClick={() => void moveLead(lead.id, stage)}
                  >
                    {index + 1}. {stage.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>

            <div className="detail-section">
              <div className="detail-section-title">Atividade Recente</div>
              {(lead.activity || []).map((activity) => {
                const [text, time] = activity.split(' — ')
                return (
                  <div className="activity-item" key={activity}>
                    <div className="activity-dot" />
                    <div>
                      <div className="activity-text">{text}</div>
                      <div className="activity-time">{time || ''}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="detail-footer">
            <button className="btn btn-outline" onClick={deleteLead}>🗑 Remover</button>
            <button className="btn btn-gold">📞 Registrar Contato</button>
          </div>
        </>
      )}
    </div>
  )
}

function DetailField({ label, value, accent }: { label: string, value: string, accent?: boolean }) {
  return (
    <div className="detail-field">
      <span className="detail-field-label">{label}</span>
      <span className={`detail-field-value ${accent ? 'accent-value' : ''}`}>{value}</span>
    </div>
  )
}

export default App
