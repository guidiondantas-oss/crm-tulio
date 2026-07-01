import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import { DEFAULT_SETTINGS, STAGE_CLASS, STAGES } from './data'
import {
  createAppUser,
  createLead,
  fetchLeads,
  fetchSettings,
  getCurrentSession,
  getSessionUserLabel,
  getSessionUserRole,
  hasSupabaseConfig,
  onAuthStateChanged,
  saveSettings,
  signInWithEmail,
  signOutUser,
  updateLeadRecord,
} from './supabaseClient'
import type { Lead, LeadInsert, LeadStatus, Settings, Stage } from './types'

type Page = 'dashboard' | 'funil' | 'leads' | 'relatorios' | 'config'
type LeadFilter = Stage | LeadStatus | 'all'
type SettingsOptionsKey = 'originOptions' | 'legalAreaOptions' | 'ownerOptions'
type ReportStatusFilter = LeadStatus | 'all'
type UserInviteForm = { name: string, email: string, password: string }

const emptyUserInviteForm: UserInviteForm = { name: '', email: '', password: '' }
const hasCrmAccessRole = (role: string) => role === 'admin' || role === 'user'

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
  status: 'Ativo',
  activity: ['Lead criado — agora'],
}

const currency = (value: number) => `R$ ${Math.round(value || 0).toLocaleString('pt-BR')}`
const firstName = (name: string) => name.split(' ')[0] || name
const shortName = (name: string) => name.split(' ').slice(0, 2).join(' ')
const statusLabel = (status: LeadStatus) => status === 'Perdido' ? 'Arquivado' : status
const formatDate = (date?: string | null) => date ? new Intl.DateTimeFormat('pt-BR').format(new Date(date)) : '—'
const positiveNumber = (value: string) => Math.max(0, Number(value) || 0)
const positiveInteger = (value: string) => Math.round(positiveNumber(value))
const normalizeOptions = (options: string[]) => Array.from(new Set(
  options.map((option) => option.trim()).filter(Boolean),
))
const activityTime = () => new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
}).format(new Date())
const activityEntry = (action: string, userName: string) => `${action} — ${activityTime()} — ${userName || 'Sistema'}`
const dayMs = 24 * 60 * 60 * 1000
const dateInputValue = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
const todayInput = () => dateInputValue(new Date())
const monthStartInput = () => {
  const date = new Date()
  date.setDate(1)
  return dateInputValue(date)
}
const isActiveLead = (lead: Lead) => lead.status === 'Ativo'
const RETURN_TASK_STAGES: Stage[] = ['1º Contato', '2º Contato (Follow up)', '3º Contato (Follow up)']

function getReturnRuleDays(stage: Stage, settings: Settings) {
  if (stage === '1º Contato') return settings.firstContactReturnDays
  if (stage === '2º Contato (Follow up)') return settings.secondContactReturnDays
  if (stage === '3º Contato (Follow up)') return settings.thirdContactReturnDays
  return 0
}

function getReturnTask(lead: Lead, settings: Settings) {
  if (!isActiveLead(lead) || !RETURN_TASK_STAGES.includes(lead.stage)) return null

  const dueDays = getReturnRuleDays(lead.stage, settings)
  const stageDays = getStageDays(lead)
  if (dueDays <= 0 || stageDays < dueDays) return null

  return {
    dueDays,
    overdueDays: stageDays - dueDays,
    stage: lead.stage,
    stageDays,
  }
}

function getStageDays(lead: Lead) {
  if (!lead.stageChangedAt) return lead.days

  const stageChangedTime = Date.parse(lead.stageChangedAt)
  if (Number.isNaN(stageChangedTime)) return lead.days

  return Math.max(0, Math.floor((Date.now() - stageChangedTime) / dayMs))
}

function getFunnelDays(lead: Lead) {
  if (!lead.createdAt) return lead.days

  const createdTime = Date.parse(lead.createdAt)
  if (Number.isNaN(createdTime)) return lead.days

  return Math.max(lead.days, Math.floor((Date.now() - createdTime) / dayMs), 0)
}

function returnTaskText(lead: Lead, settings: Settings) {
  const task = getReturnTask(lead, settings)
  if (!task) return ''
  if (task.overdueDays === 0) return `${firstName(lead.name)} precisa de retorno hoje (${task.stage})`
  return `${firstName(lead.name)} está com retorno atrasado há ${task.overdueDays} dia${task.overdueDays > 1 ? 's' : ''} (${task.stage})`
}

function calculateStats(leads: Lead[]) {
  const total = leads.length
  const active = leads.filter(isActiveLead).length
  const signed = leads.filter((lead) => lead.status === 'Contrato Assinado').length
  const lost = leads.filter((lead) => lead.status === 'Perdido').length
  const conversion = total > 0 ? Math.round((signed / total) * 100) : 0
  const tickets = leads.filter((lead) => lead.ticket).map((lead) => lead.ticket)
  const avgTicket = tickets.length
    ? Math.round(tickets.reduce((sum, ticket) => sum + ticket, 0) / tickets.length)
    : 0
  const indication = leads.filter((lead) => lead.origin === 'Indicação').length
  const indicationPct = total > 0 ? Math.round((indication / total) * 100) : 0

  return { total, active, signed, lost, conversion, avgTicket, indicationPct }
}

function filterLeadsByDate(leads: Lead[], startDate: string, endDate: string) {
  return leads.filter((lead) => {
    if (!lead.createdAt) return true
    const parsedDate = new Date(lead.createdAt)
    if (Number.isNaN(parsedDate.getTime())) return true
    const createdDate = dateInputValue(parsedDate)
    if (startDate && createdDate < startDate) return false
    if (endDate && createdDate > endDate) return false
    return true
  })
}

function countCurrentMonthProtocols(leads: Lead[]) {
  const monthStart = monthStartInput()
  const monthEnd = todayInput()

  return leads.filter((lead) => {
    if (lead.stage !== 'Protocolo Iniciado' && lead.status !== 'Contrato Assinado') return false
    const referenceDate = lead.stageChangedAt || lead.closedAt || lead.createdAt
    if (!referenceDate) return false
    const parsedDate = new Date(referenceDate)
    if (Number.isNaN(parsedDate.getTime())) return false
    const protocolDate = dateInputValue(parsedDate)
    return protocolDate >= monthStart && protocolDate <= monthEnd
  }).length
}

function App() {
  const [activePage, setActivePage] = useState<Page>('dashboard')
  const [leads, setLeads] = useState<Lead[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [currentFilter, setCurrentFilter] = useState<LeadFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [form, setForm] = useState<LeadInsert>(emptyForm)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [reportStartDate, setReportStartDate] = useState(monthStartInput)
  const [reportEndDate, setReportEndDate] = useState(todayInput)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authChecked, setAuthChecked] = useState(!hasSupabaseConfig)
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [loginError, setLoginError] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [originDraft, setOriginDraft] = useState('')
  const [areaDraft, setAreaDraft] = useState('')
  const [ownerDraft, setOwnerDraft] = useState('')
  const [currentUserName, setCurrentUserName] = useState(DEFAULT_SETTINGS.ownerName)
  const [currentUserRole, setCurrentUserRole] = useState('')
  const [userInviteForm, setUserInviteForm] = useState<UserInviteForm>(emptyUserInviteForm)
  const [isCreatingUser, setIsCreatingUser] = useState(false)
  const [userInviteFeedback, setUserInviteFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  const [reportOwner, setReportOwner] = useState('all')
  const [reportArea, setReportArea] = useState('all')
  const [reportOrigin, setReportOrigin] = useState('all')
  const [reportStatus, setReportStatus] = useState<ReportStatusFilter>('all')
  const [isLoadingData, setIsLoadingData] = useState(false)
  const [dataError, setDataError] = useState('')
  const [dataReloadKey, setDataReloadKey] = useState(0)
  const isAdmin = currentUserRole === 'admin'

  useEffect(() => {
    if (!hasSupabaseConfig) return

    let mounted = true

    async function checkSession() {
      try {
        const session = await getCurrentSession()
        if (mounted) {
          const userRole = getSessionUserRole(session)
          if (session && !hasCrmAccessRole(userRole)) {
            await signOutUser()
            setIsAuthenticated(false)
            setLoginError('Este usuário não tem acesso ao sistema.')
            return
          }

          setIsAuthenticated(Boolean(session))
          const userLabel = getSessionUserLabel(session)
          if (userLabel) setCurrentUserName(userLabel)
          setCurrentUserRole(userRole)
        }
      } catch (error) {
        console.error('Erro ao verificar sessão:', error)
      } finally {
        if (mounted) setAuthChecked(true)
      }
    }

    void checkSession()

    const unsubscribe = onAuthStateChanged((authenticated, userLabel, userRole) => {
      if (authenticated && !hasCrmAccessRole(userRole || '')) {
        setIsAuthenticated(false)
        setLoginError('Este usuário não tem acesso ao sistema.')
        void signOutUser()
        return
      }

      setIsAuthenticated(authenticated)
      if (userLabel) setCurrentUserName(userLabel)
      setCurrentUserRole(userRole || '')
      if (!authenticated) {
        setLeads([])
        setSelectedLeadId(null)
        setCurrentUserName(DEFAULT_SETTINGS.ownerName)
        setCurrentUserRole('')
        setDataError('')
        setIsLoadingData(false)
      }
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return
    if (!hasSupabaseConfig) return

    let cancelled = false

    async function loadData() {
      setIsLoadingData(true)
      setDataError('')
      try {
        const [databaseLeads, databaseSettings] = await Promise.all([
          fetchLeads(),
          fetchSettings(),
        ])

        if (!cancelled) {
          setLeads(databaseLeads)
          if (databaseSettings) setSettings(databaseSettings)
        }
      } catch (error) {
        console.error('Erro ao carregar dados do Supabase:', error)
        if (!cancelled) {
          setLeads([])
          setDataError('Não foi possível carregar os dados do Supabase.')
        }
      } finally {
        if (!cancelled) setIsLoadingData(false)
      }
    }

    void loadData()

    return () => {
      cancelled = true
    }
  }, [dataReloadKey, isAuthenticated])

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === selectedLeadId) || null,
    [leads, selectedLeadId],
  )

  const activeLeads = useMemo(() => leads.filter(isActiveLead), [leads])
  const stats = useMemo(() => calculateStats(leads), [leads])
  const currentMonthProtocols = useMemo(() => countCurrentMonthProtocols(leads), [leads])
  const recentLeads = useMemo(() => [...leads].sort((a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) : 0
    const bTime = b.createdAt ? Date.parse(b.createdAt) : 0
    return bTime - aTime
  }).slice(0, 6), [leads])
  const reportLeads = useMemo(() => {
    return filterLeadsByDate(leads, reportStartDate, reportEndDate).filter((lead) => {
      if (reportOwner !== 'all' && lead.owner !== reportOwner) return false
      if (reportArea !== 'all' && lead.area !== reportArea) return false
      if (reportOrigin !== 'all' && lead.origin !== reportOrigin) return false
      if (reportStatus !== 'all' && lead.status !== reportStatus) return false
      return true
    })
  }, [leads, reportArea, reportEndDate, reportOrigin, reportOwner, reportStartDate, reportStatus])
  const reportStats = useMemo(() => calculateStats(reportLeads), [reportLeads])
  const returnTasks = useMemo(
    () => activeLeads.filter((lead) => getReturnTask(lead, settings)),
    [activeLeads, settings],
  )
  const originOptions = useMemo(() => {
    const options = normalizeOptions(settings.originOptions)
    if (form.origin && !options.includes(form.origin)) options.unshift(form.origin)
    return options.length ? options : DEFAULT_SETTINGS.originOptions
  }, [form.origin, settings.originOptions])
  const areaOptions = useMemo(() => {
    const options = normalizeOptions(settings.legalAreaOptions)
    if (form.area && !options.includes(form.area)) options.unshift(form.area)
    return options.length ? options : DEFAULT_SETTINGS.legalAreaOptions
  }, [form.area, settings.legalAreaOptions])
  const ownerOptions = useMemo(() => {
    const options = normalizeOptions(settings.ownerOptions)
    if (form.owner && !options.includes(form.owner)) options.unshift(form.owner)
    return options.length ? options : DEFAULT_SETTINGS.ownerOptions
  }, [form.owner, settings.ownerOptions])
  const reportOwnerOptions = useMemo(
    () => normalizeOptions([...settings.ownerOptions, ...leads.map((lead) => lead.owner)]),
    [leads, settings.ownerOptions],
  )
  const reportAreaOptions = useMemo(
    () => normalizeOptions([...settings.legalAreaOptions, ...leads.map((lead) => lead.area)]),
    [leads, settings.legalAreaOptions],
  )
  const reportOriginOptions = useMemo(
    () => normalizeOptions([...settings.originOptions, ...leads.map((lead) => lead.origin)]),
    [leads, settings.originOptions],
  )

  const filteredLeads = useMemo(() => {
    let filtered = [...leads]
    if (currentFilter !== 'all') {
      filtered = STAGES.includes(currentFilter as Stage)
        ? filtered.filter((lead) => lead.stage === currentFilter)
        : filtered.filter((lead) => lead.status === currentFilter)
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (lead) =>
          lead.name.toLowerCase().includes(query) ||
          lead.phone.toLowerCase().includes(query) ||
          lead.email.toLowerCase().includes(query) ||
          lead.area.toLowerCase().includes(query) ||
          lead.origin.toLowerCase().includes(query) ||
          lead.status.toLowerCase().includes(query) ||
          statusLabel(lead.status).toLowerCase().includes(query) ||
          returnTaskText(lead, settings).toLowerCase().includes(query),
      )
    }
    return filtered
  }, [currentFilter, leads, searchQuery, settings])

  const alerts = useMemo(() => {
    return activeLeads.flatMap((lead) => {
      const leadAlerts = []
      const returnText = returnTaskText(lead, settings)
      if (returnText) {
        leadAlerts.push({ type: 'task', msg: returnText })
      }
      const funnelDays = getFunnelDays(lead)
      if (funnelDays > 20) {
        leadAlerts.push({
          type: 'warn',
          msg: `${firstName(lead.name)} — ${funnelDays} dias no funil (${lead.stage})`,
        })
      }
      if (lead.stage === 'Montagem de Processo') {
        leadAlerts.push({ type: 'action', msg: `${firstName(lead.name)} aguarda montagem do processo` })
      }
      return leadAlerts
    })
  }, [activeLeads, settings])

  function navigate(page: Page) {
    if (page === 'config' && !isAdmin) {
      setActivePage('dashboard')
      setSelectedLeadId(null)
      return
    }

    setActivePage(page)
    setSelectedLeadId(null)
  }

  function openLeads(filter: LeadFilter = 'all') {
    setCurrentFilter(filter)
    navigate('leads')
  }

  function addSettingsOption(key: SettingsOptionsKey, draft: string, clearDraft: (value: string) => void) {
    const option = draft.trim()
    if (!option) return

    const nextOptions = normalizeOptions([...settings[key], option])
    setSettings({ ...settings, [key]: nextOptions })
    clearDraft('')
  }

  function updateSettingsOption(key: SettingsOptionsKey, index: number, value: string) {
    const nextOptions = [...settings[key]]
    nextOptions[index] = value
    setSettings({ ...settings, [key]: nextOptions })
  }

  function removeSettingsOption(key: SettingsOptionsKey, index: number) {
    const nextOptions = settings[key].filter((_option, optionIndex) => optionIndex !== index)
    setSettings({ ...settings, [key]: nextOptions })
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault()
    setLoginError('')

    if (!loginForm.email.trim() || !loginForm.password.trim()) {
      setLoginError('Informe login e senha para entrar.')
      return
    }

    if (!hasSupabaseConfig) {
      setLoginError('Supabase não configurado. Adicione as variáveis de ambiente para entrar.')
      return
    }

    setIsLoggingIn(true)
    try {
      const session = await signInWithEmail(loginForm.email.trim(), loginForm.password)
      const userRole = getSessionUserRole(session)
      if (!hasCrmAccessRole(userRole)) {
        await signOutUser()
        setLoginError('Este usuário não tem acesso ao sistema.')
        return
      }

      const userLabel = getSessionUserLabel(session)
      setCurrentUserName(userLabel || loginForm.email.trim())
      setCurrentUserRole(userRole)
      setIsAuthenticated(true)
      setLoginForm({ email: '', password: '' })
    } catch (error) {
      console.error('Erro ao fazer login:', error)
      setLoginError('Login ou senha inválidos.')
    } finally {
      setIsLoggingIn(false)
    }
  }

  async function handleLogout() {
    try {
      await signOutUser()
    } catch (error) {
      console.error('Erro ao sair:', error)
      window.alert('Não foi possível encerrar a sessão. Tente novamente.')
      return
    }

    setIsAuthenticated(false)
    setSelectedLeadId(null)
    setActivePage('dashboard')
    setCurrentUserRole('')
  }

  function openModal(initialStage: Stage = '1º Contato') {
    const configuredOrigins = normalizeOptions(settings.originOptions)
    const configuredAreas = normalizeOptions(settings.legalAreaOptions)
    const configuredOwners = normalizeOptions(settings.ownerOptions)
    setForm({
      ...emptyForm,
      origin: configuredOrigins[0] || emptyForm.origin,
      area: configuredAreas[0] || emptyForm.area,
      stage: initialStage,
      owner: configuredOwners[0] || settings.ownerName,
      status: 'Ativo',
    })
    setIsModalOpen(true)
  }

  async function persistLeadUpdate(updatedLead: Lead, errorLabel: string) {
    const previousLead = leads.find((item) => item.id === updatedLead.id)
    setLeads((current) => current.map((item) => (item.id === updatedLead.id ? updatedLead : item)))
    try {
      const databaseLead = await updateLeadRecord(updatedLead)
      if (databaseLead) {
        setLeads((current) => current.map((item) => (item.id === updatedLead.id ? databaseLead : item)))
      }
      return true
    } catch (error) {
      console.error(errorLabel, error)
      if (previousLead) {
        setLeads((current) => current.map((item) => (item.id === previousLead.id ? previousLead : item)))
      }
      window.alert('Não foi possível salvar a alteração no Supabase.')
      return false
    }
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
      phone: form.phone.trim() || '—',
      email: form.email.trim(),
      ticket: positiveInteger(String(form.ticket)),
      status: 'Ativo',
      activity: [activityEntry('Lead criado', currentUserName)],
      closedAt: null,
      stageChangedAt: new Date().toISOString(),
    }

    setIsSaving(true)
    try {
      const databaseLead = await createLead(newLead)
      setLeads((current) => [databaseLead, ...current])
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
    if (!lead || lead.stage === stage || !isActiveLead(lead)) return

    const updatedLead = {
      ...lead,
      stage,
      stageChangedAt: new Date().toISOString(),
      activity: [activityEntry(`Movido de "${lead.stage}" para "${stage}"`, currentUserName), ...lead.activity],
    }

    await persistLeadUpdate(updatedLead, 'Erro ao mover lead:')
  }

  async function registerReturn(id: string) {
    const lead = leads.find((item) => item.id === id)
    if (!lead || !isActiveLead(lead)) return

    const nextStageByReturn: Partial<Record<Stage, Stage>> = {
      '1º Contato': '2º Contato (Follow up)',
      '2º Contato (Follow up)': '3º Contato (Follow up)',
      '3º Contato (Follow up)': 'Recuperação de Contato',
    }
    const nextStage = nextStageByReturn[lead.stage]
    if (!nextStage) return

    const updatedLead = {
      ...lead,
      stage: nextStage,
      stageChangedAt: new Date().toISOString(),
      activity: [activityEntry(`Retorno registrado e movido para "${nextStage}"`, currentUserName), ...lead.activity],
    }

    await persistLeadUpdate(updatedLead, 'Erro ao registrar retorno:')
  }

  async function saveLeadNotes(id: string, notes: string) {
    const lead = leads.find((item) => item.id === id)
    if (!lead) return false

    const updatedLead = {
      ...lead,
      notes,
      activity: [activityEntry('Observações atualizadas', currentUserName), ...lead.activity],
    }

    return persistLeadUpdate(updatedLead, 'Erro ao salvar observações:')
  }

  async function changeLeadStatus(id: string, status: LeadStatus) {
    const lead = leads.find((item) => item.id === id)
    if (!lead || lead.status === status) return
    if (status === 'Perdido' && !window.confirm('Arquivar este card como perdido?')) return

    const closedAt = status === 'Ativo' ? null : new Date().toISOString()
    const activityText =
      status === 'Contrato Assinado'
        ? 'Contrato assinado'
        : status === 'Perdido'
          ? 'Arquivado como perdido'
          : 'Card reativado'

    const updatedLead = {
      ...lead,
      status,
      closedAt,
      activity: [activityEntry(activityText, currentUserName), ...lead.activity],
    }

    await persistLeadUpdate(updatedLead, 'Erro ao alterar status:')
  }

  async function handleSaveSettings() {
    try {
      const firmName = settings.firmName.trim()
      const ownerName = settings.ownerName.trim()
      const originOptions = normalizeOptions(settings.originOptions)
      const legalAreaOptions = normalizeOptions(settings.legalAreaOptions)
      const ownerOptions = normalizeOptions([...settings.ownerOptions, ownerName])

      if (!firmName || !ownerName || !originOptions.length || !legalAreaOptions.length || !ownerOptions.length) {
        window.alert('Preencha o escritório, o responsável e mantenha ao menos uma opção em cada lista.')
        return
      }

      const normalizedSettings = {
        ...settings,
        firmName,
        ownerName,
        monthlyProtocolGoal: positiveInteger(String(settings.monthlyProtocolGoal)),
        minimumTicket: positiveInteger(String(settings.minimumTicket)),
        conversionGoal: Math.min(100, positiveInteger(String(settings.conversionGoal))),
        firstContactReturnDays: positiveInteger(String(settings.firstContactReturnDays)),
        secondContactReturnDays: positiveInteger(String(settings.secondContactReturnDays)),
        thirdContactReturnDays: positiveInteger(String(settings.thirdContactReturnDays)),
        originOptions,
        legalAreaOptions,
        ownerOptions,
      }
      const databaseSettings = await saveSettings(normalizedSettings)
      setSettings(databaseSettings)
      window.alert('Configurações salvas.')
    } catch (error) {
      console.error('Erro ao salvar configurações:', error)
      window.alert('Não foi possível salvar as configurações no Supabase.')
    }
  }

  async function handleCreateUser(event: FormEvent) {
    event.preventDefault()
    setUserInviteFeedback(null)

    if (!isAdmin) {
      setUserInviteFeedback({ type: 'error', message: 'Apenas o administrador pode criar usuários.' })
      return
    }

    const name = userInviteForm.name.trim()
    const email = userInviteForm.email.trim().toLowerCase()
    const password = userInviteForm.password

    if (!name || !email || !password) {
      setUserInviteFeedback({ type: 'error', message: 'Preencha nome, e-mail e senha.' })
      return
    }

    if (password.length < 8) {
      setUserInviteFeedback({ type: 'error', message: 'A senha precisa ter pelo menos 8 caracteres.' })
      return
    }

    setIsCreatingUser(true)
    try {
      const user = await createAppUser({ name, email, password })
      setUserInviteForm(emptyUserInviteForm)
      setUserInviteFeedback({ type: 'success', message: `Usuário criado: ${user.email}` })
    } catch (error) {
      console.error('Erro ao criar usuário:', error)
      setUserInviteFeedback({ type: 'error', message: 'Não foi possível criar o usuário.' })
    } finally {
      setIsCreatingUser(false)
    }
  }

  const userInitials = currentUserName
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  if (!authChecked) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="login-brand">{settings.firmName}</div>
          <div className="login-status">Carregando acesso...</div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <LoginScreen
        firmName={settings.firmName}
        loginForm={loginForm}
        loginError={loginError}
        isLoggingIn={isLoggingIn}
        setLoginForm={setLoginForm}
        handleLogin={handleLogin}
      />
    )
  }

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
            <span className="nav-badge">{activeLeads.length}</span>
          </button>
          <button className={`nav-item ${activePage === 'leads' && currentFilter !== 'Perdido' ? 'active' : ''}`} onClick={() => openLeads()}>
            <span className="nav-icon">◈</span> Leads
            <span className="nav-badge">{leads.length}</span>
          </button>
          <button className={`nav-item ${activePage === 'leads' && currentFilter === 'Perdido' ? 'active' : ''}`} onClick={() => openLeads('Perdido')}>
            <span className="nav-icon">□</span> Arquivados
            <span className="nav-badge">{stats.lost}</span>
          </button>
        </div>

        <div className="nav-section">
          <div className="nav-section-label">Análise</div>
          <button className={`nav-item ${activePage === 'relatorios' ? 'active' : ''}`} onClick={() => navigate('relatorios')}>
            <span className="nav-icon">◫</span> Indicadores
          </button>
        </div>

        {isAdmin && (
          <div className="nav-section">
            <div className="nav-section-label">Config</div>
            <button className={`nav-item ${activePage === 'config' ? 'active' : ''}`} onClick={() => navigate('config')}>
              <span className="nav-icon">◎</span> Configurações
            </button>
          </div>
        )}

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">{userInitials}</div>
            <div>
              <div className="user-name">{currentUserName}</div>
              <div className="user-role">{isAdmin ? 'Administrador' : 'Usuário'}</div>
            </div>
          </div>
          <button className="logout-button" onClick={() => void handleLogout()}>Sair</button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div className="topbar-title">{pageTitles[activePage]}</div>
          <div className="topbar-actions">
            <button className="btn btn-gold" disabled={isLoadingData || Boolean(dataError)} onClick={() => openModal()}>＋ Novo Lead</button>
          </div>
        </div>

        <div className="content">
          {isLoadingData && <div className="data-state">Carregando dados do CRM...</div>}
          {dataError && (
            <div className="data-state data-error">
              <span>{dataError}</span>
              <button className="btn btn-outline" onClick={() => setDataReloadKey((current) => current + 1)}>Tentar novamente</button>
            </div>
          )}

          {!isLoadingData && !dataError && activePage === 'dashboard' && (
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
                <StatCard
                  label="Protocolos / mês"
                  value={currentMonthProtocols}
                  sub={`meta: ${settings.monthlyProtocolGoal}`}
                  width={settings.monthlyProtocolGoal ? (currentMonthProtocols / settings.monthlyProtocolGoal) * 100 : 0}
                  tone={currentMonthProtocols >= settings.monthlyProtocolGoal ? 'good' : 'warn'}
                />
                <StatCard label="Indicação" value={`${stats.indicationPct}%`} sub="meta: ≥ 30%" width={stats.indicationPct} tone={stats.indicationPct >= 30 ? 'good' : 'warn'} />
                <StatCard
                  label="Retornos"
                  value={returnTasks.length}
                  sub="tarefas vencidas"
                  width={returnTasks.length ? 100 : 0}
                  tone={returnTasks.length ? 'bad' : 'good'}
                />
              </div>

              <div className="section-title">
                <span>Funil de conversão</span>
                <button className="btn btn-ghost" onClick={() => navigate('funil')}>Ver completo →</button>
              </div>
              <MiniKanban leads={activeLeads} openDetail={setSelectedLeadId} />

              <div className="dashboard-grid">
                <div className="table-wrap">
                  <div className="table-toolbar compact-toolbar">
                    <div className="toolbar-title">Leads Recentes</div>
                    <button className="btn btn-ghost compact-button" onClick={() => openLeads()}>Ver todos</button>
                  </div>
                  <table>
                    <tbody>
                      {recentLeads.map((lead) => (
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
                      alerts.slice(0, 8).map((alert, index) => (
                        <div className="alert-item" key={`${alert.msg}-${index}`}>
                          <span>{alert.type === 'warn' ? '⚠️' : alert.type === 'task' ? '📞' : '📋'}</span>
                          <span>{alert.msg}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!isLoadingData && !dataError && activePage === 'funil' && (
            <div className="page-view active">
              <Kanban
                leads={activeLeads}
                settings={settings}
                draggedId={draggedId}
                setDraggedId={setDraggedId}
                moveLead={moveLead}
                openDetail={setSelectedLeadId}
              />
            </div>
          )}

          {!isLoadingData && !dataError && activePage === 'leads' && (
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
                      <button className={`chip ${currentFilter === 'Ativo' ? 'active' : ''}`} onClick={() => setCurrentFilter('Ativo')}>Ativos</button>
                      <button className={`chip ${currentFilter === 'Contrato Assinado' ? 'active' : ''}`} onClick={() => setCurrentFilter('Contrato Assinado')}>Contratos</button>
                      <button className={`chip ${currentFilter === 'Perdido' ? 'active' : ''}`} onClick={() => setCurrentFilter('Perdido')}>Arquivados</button>
                      <button className={`chip ${currentFilter === 'Protocolo Iniciado' ? 'active' : ''}`} onClick={() => setCurrentFilter('Protocolo Iniciado')}>⭐ Protocolo</button>
                      <button className={`chip ${currentFilter === '2º Contato (Follow up)' ? 'active' : ''}`} onClick={() => setCurrentFilter('2º Contato (Follow up)')}>2º follow-up</button>
                      <button className={`chip ${currentFilter === '3º Contato (Follow up)' ? 'active' : ''}`} onClick={() => setCurrentFilter('3º Contato (Follow up)')}>3º follow-up</button>
                      <button className={`chip ${currentFilter === 'Recuperação de Contato' ? 'active' : ''}`} onClick={() => setCurrentFilter('Recuperação de Contato')}>Recuperação</button>
                      <button className={`chip ${currentFilter === 'Entrevista Marcada' ? 'active' : ''}`} onClick={() => setCurrentFilter('Entrevista Marcada')}>Entrevista</button>
                      <button className={`chip ${currentFilter === 'Nota de Análise' ? 'active' : ''}`} onClick={() => setCurrentFilter('Nota de Análise')}>Nota de Análise</button>
                      <button className={`chip ${currentFilter === 'Documentação Concluída' ? 'active' : ''}`} onClick={() => setCurrentFilter('Documentação Concluída')}>Documentação</button>
                    </div>
                  </div>
                </div>
                <LeadsTable leads={filteredLeads} settings={settings} openDetail={setSelectedLeadId} />
              </div>
            </div>
          )}

          {!isLoadingData && !dataError && activePage === 'relatorios' && (
            <div className="page-view active">
              <div className="table-wrap report-filter">
                <div className="table-toolbar report-toolbar">
                  <div className="toolbar-title">Período do relatório</div>
                  <div className="date-filter-row">
                    <label className="date-filter">
                      <span>Início</span>
                      <input type="date" value={reportStartDate} onChange={(event) => setReportStartDate(event.target.value)} />
                    </label>
                    <label className="date-filter">
                      <span>Fim</span>
                      <input type="date" value={reportEndDate} onChange={(event) => setReportEndDate(event.target.value)} />
                    </label>
                    <label className="date-filter">
                      <span>Responsável</span>
                      <select value={reportOwner} onChange={(event) => setReportOwner(event.target.value)}>
                        <option value="all">Todos</option>
                        {reportOwnerOptions.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
                      </select>
                    </label>
                    <label className="date-filter">
                      <span>Área</span>
                      <select value={reportArea} onChange={(event) => setReportArea(event.target.value)}>
                        <option value="all">Todas</option>
                        {reportAreaOptions.map((area) => <option key={area} value={area}>{area}</option>)}
                      </select>
                    </label>
                    <label className="date-filter">
                      <span>Origem</span>
                      <select value={reportOrigin} onChange={(event) => setReportOrigin(event.target.value)}>
                        <option value="all">Todas</option>
                        {reportOriginOptions.map((origin) => <option key={origin} value={origin}>{origin}</option>)}
                      </select>
                    </label>
                    <label className="date-filter">
                      <span>Status</span>
                      <select value={reportStatus} onChange={(event) => setReportStatus(event.target.value as ReportStatusFilter)}>
                        <option value="all">Todos</option>
                        <option value="Ativo">Ativo</option>
                        <option value="Contrato Assinado">Contrato Assinado</option>
                        <option value="Perdido">Arquivado</option>
                      </select>
                    </label>
                    <button className="btn btn-outline" onClick={() => {
                      setReportStartDate('')
                      setReportEndDate('')
                      setReportOwner('all')
                      setReportArea('all')
                      setReportOrigin('all')
                      setReportStatus('all')
                    }}>
                      Limpar
                    </button>
                  </div>
                </div>
              </div>

              <div className="stats-grid report-stats">
                <StatCard label="Leads no período" value={reportStats.total} sub={`${reportStats.active} ativos`} width={100} />
                <StatCard
                  label="Contratos assinados"
                  value={reportStats.signed}
                  sub={`${reportStats.conversion}% de conversão`}
                  width={reportStats.conversion}
                  tone={reportStats.conversion >= settings.conversionGoal ? 'good' : 'warn'}
                />
                <StatCard
                  label="Arquivados"
                  value={reportStats.lost}
                  sub="cards arquivados"
                  width={reportStats.total ? Math.round((reportStats.lost / reportStats.total) * 100) : 0}
                  tone={reportStats.lost ? 'bad' : 'good'}
                />
                <StatCard
                  label="Ticket médio"
                  value={currency(reportStats.avgTicket)}
                  sub={`meta: ≥ ${currency(settings.minimumTicket)}`}
                  width={reportStats.avgTicket >= settings.minimumTicket ? 100 : 55}
                  tone={reportStats.avgTicket >= settings.minimumTicket ? 'good' : 'warn'}
                />
              </div>

              <div className="table-wrap report-card">
                <div className="table-toolbar compact-toolbar">
                  <div className="toolbar-title">Conversão por Etapa</div>
                </div>
                <FunnelChart leads={reportLeads} />
              </div>

              <div className="table-wrap report-card">
                <div className="table-toolbar">
                  <div className="toolbar-title">Status dos Cards</div>
                </div>
                <StatusChart leads={reportLeads} />
              </div>

              <div className="table-wrap report-card">
                <div className="table-toolbar">
                  <div className="toolbar-title">Origem dos Leads</div>
                </div>
                <OriginChart leads={reportLeads} />
              </div>

              <div className="table-wrap report-card">
                <div className="table-toolbar">
                  <div className="toolbar-title">Leads por Responsável</div>
                </div>
                <OwnerChart leads={reportLeads} />
              </div>
            </div>
          )}

          {!isLoadingData && !dataError && activePage === 'config' && isAdmin && (
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
                    <input className="form-input" type="number" min="0" step="1" value={settings.monthlyProtocolGoal} onChange={(event) => setSettings({ ...settings, monthlyProtocolGoal: positiveInteger(event.target.value) })} />
                  </label>
                  <label className="form-group">
                    <span className="form-label">Ticket Médio Mínimo (R$)</span>
                    <input className="form-input" type="number" min="0" step="1" value={settings.minimumTicket} onChange={(event) => setSettings({ ...settings, minimumTicket: positiveInteger(event.target.value) })} />
                  </label>
                  <label className="form-group">
                    <span className="form-label">Meta de Conversão (%)</span>
                    <input className="form-input" type="number" min="0" max="100" step="1" value={settings.conversionGoal} onChange={(event) => setSettings({ ...settings, conversionGoal: Math.min(100, positiveInteger(event.target.value)) })} />
                  </label>
                  <ConfigOptionsSection
                    title="Origens do Lead"
                    options={settings.originOptions}
                    draft={originDraft}
                    placeholder="Nova origem"
                    onDraftChange={setOriginDraft}
                    onAdd={() => addSettingsOption('originOptions', originDraft, setOriginDraft)}
                    onUpdate={(index, value) => updateSettingsOption('originOptions', index, value)}
                    onRemove={(index) => removeSettingsOption('originOptions', index)}
                  />
                  <ConfigOptionsSection
                    title="Áreas Jurídicas"
                    options={settings.legalAreaOptions}
                    draft={areaDraft}
                    placeholder="Nova área jurídica"
                    onDraftChange={setAreaDraft}
                    onAdd={() => addSettingsOption('legalAreaOptions', areaDraft, setAreaDraft)}
                    onUpdate={(index, value) => updateSettingsOption('legalAreaOptions', index, value)}
                    onRemove={(index) => removeSettingsOption('legalAreaOptions', index)}
                  />
                  <ConfigOptionsSection
                    title="Responsáveis do Formulário"
                    options={settings.ownerOptions}
                    draft={ownerDraft}
                    placeholder="Novo responsável"
                    onDraftChange={setOwnerDraft}
                    onAdd={() => addSettingsOption('ownerOptions', ownerDraft, setOwnerDraft)}
                    onUpdate={(index, value) => updateSettingsOption('ownerOptions', index, value)}
                    onRemove={(index) => removeSettingsOption('ownerOptions', index)}
                  />
                  <div className="config-section">
                    <div className="config-section-title">Automação de Retorno</div>
                    <div className="form-row">
                      <label className="form-group">
                        <span className="form-label">1º Contato (dias)</span>
                        <input
                          className="form-input"
                          type="number"
                          min="0"
                          step="1"
                          value={settings.firstContactReturnDays}
                          onChange={(event) => setSettings({ ...settings, firstContactReturnDays: positiveInteger(event.target.value) })}
                        />
                      </label>
                      <label className="form-group">
                        <span className="form-label">2º Contato (dias)</span>
                        <input
                          className="form-input"
                          type="number"
                          min="0"
                          step="1"
                          value={settings.secondContactReturnDays}
                          onChange={(event) => setSettings({ ...settings, secondContactReturnDays: positiveInteger(event.target.value) })}
                        />
                      </label>
                    </div>
                    <label className="form-group">
                      <span className="form-label">3º Contato (dias)</span>
                      <input
                        className="form-input"
                        type="number"
                        min="0"
                        step="1"
                        value={settings.thirdContactReturnDays}
                        onChange={(event) => setSettings({ ...settings, thirdContactReturnDays: positiveInteger(event.target.value) })}
                      />
                    </label>
                    <div className="config-hint">Use 0 para desativar a tarefa automática de uma etapa.</div>
                  </div>
                  <button className="btn btn-gold config-save" onClick={handleSaveSettings}>Salvar Configurações</button>
                  <form className="config-section user-create-form" onSubmit={(event) => void handleCreateUser(event)}>
                    <div className="config-section-title">Usuários do Sistema</div>
                    <div className="form-row">
                      <label className="form-group">
                        <span className="form-label">Nome</span>
                        <input
                          className="form-input"
                          value={userInviteForm.name}
                          onChange={(event) => setUserInviteForm({ ...userInviteForm, name: event.target.value })}
                          disabled={isCreatingUser}
                        />
                      </label>
                      <label className="form-group">
                        <span className="form-label">E-mail</span>
                        <input
                          className="form-input"
                          type="email"
                          value={userInviteForm.email}
                          onChange={(event) => setUserInviteForm({ ...userInviteForm, email: event.target.value })}
                          disabled={isCreatingUser}
                        />
                      </label>
                    </div>
                    <label className="form-group">
                      <span className="form-label">Senha Provisória</span>
                      <input
                        className="form-input"
                        type="password"
                        autoComplete="new-password"
                        value={userInviteForm.password}
                        onChange={(event) => setUserInviteForm({ ...userInviteForm, password: event.target.value })}
                        disabled={isCreatingUser}
                      />
                    </label>
                    <button className="btn btn-outline config-save" disabled={isCreatingUser}>
                      {isCreatingUser ? 'Criando...' : 'Criar Usuário'}
                    </button>
                    {userInviteFeedback && (
                      <div className={`config-status ${userInviteFeedback.type === 'error' ? 'error' : ''}`}>
                        {userInviteFeedback.message}
                      </div>
                    )}
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <nav className={`mobile-nav ${isAdmin ? 'with-config' : ''}`} aria-label="Navegação principal">
        <button className={activePage === 'dashboard' ? 'active' : ''} onClick={() => navigate('dashboard')}>Início</button>
        <button className={activePage === 'funil' ? 'active' : ''} onClick={() => navigate('funil')}>Funil</button>
        <button className={activePage === 'leads' ? 'active' : ''} onClick={() => openLeads()}>Leads</button>
        <button className={activePage === 'relatorios' ? 'active' : ''} onClick={() => navigate('relatorios')}>Indicadores</button>
        {isAdmin && <button className={activePage === 'config' ? 'active' : ''} onClick={() => navigate('config')}>Config</button>}
      </nav>

      <div className={`modal-overlay ${isModalOpen ? 'open' : ''}`} onMouseDown={(event) => {
        if (event.target === event.currentTarget) setIsModalOpen(false)
      }}>
        <form className="modal" onSubmit={handleSaveLead}>
          <div className="modal-header">
            <div className="modal-title">Novo Lead</div>
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
                  {areaOptions.map((area) => <option key={area}>{area}</option>)}
                </select>
              </label>
            </div>
            <div className="form-row">
              <label className="form-group">
                <span className="form-label">Origem do Lead</span>
                <select className="form-select" value={form.origin} onChange={(event) => setForm({ ...form, origin: event.target.value })}>
                  {originOptions.map((origin) => <option key={origin}>{origin}</option>)}
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
                  {ownerOptions.map((owner) => <option key={owner}>{owner}</option>)}
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
        settings={settings}
        close={() => setSelectedLeadId(null)}
        moveLead={moveLead}
        registerReturn={registerReturn}
        saveLeadNotes={saveLeadNotes}
        changeLeadStatus={changeLeadStatus}
      />
    </>
  )
}

function LoginScreen({ firmName, loginForm, loginError, isLoggingIn, setLoginForm, handleLogin }: {
  firmName: string
  loginForm: { email: string, password: string }
  loginError: string
  isLoggingIn: boolean
  setLoginForm: (form: { email: string, password: string }) => void
  handleLogin: (event: FormEvent) => Promise<void>
}) {
  const accessError = loginError

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={(event) => void handleLogin(event)}>
        <div className="login-brand">{firmName}</div>
        <div className="login-title">Acesso ao sistema</div>
        <label className="form-group">
          <span className="form-label">Login</span>
          <input
            className="form-input"
            type="email"
            autoComplete="username"
            value={loginForm.email}
            onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })}
            placeholder="email@escritorio.com"
            disabled={isLoggingIn}
          />
        </label>
        <label className="form-group">
          <span className="form-label">Senha</span>
          <input
            className="form-input"
            type="password"
            autoComplete="current-password"
            value={loginForm.password}
            onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
            placeholder="Sua senha"
            disabled={isLoggingIn}
          />
        </label>
        {accessError && <div className="login-error">{accessError}</div>}
        <button className="btn btn-gold login-button" disabled={isLoggingIn}>
          {isLoggingIn ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

function ConfigOptionsSection({ title, options, draft, placeholder, onDraftChange, onAdd, onUpdate, onRemove }: {
  title: string
  options: string[]
  draft: string
  placeholder: string
  onDraftChange: (value: string) => void
  onAdd: () => void
  onUpdate: (index: number, value: string) => void
  onRemove: (index: number) => void
}) {
  return (
    <div className="config-section">
      <div className="config-section-title">{title}</div>
      <div className="config-options-list">
        {options.map((option, index) => (
          <div className="config-option-row" key={`${option}-${index}`}>
            <input
              className="form-input"
              value={option}
              onChange={(event) => onUpdate(index, event.target.value)}
            />
            <button className="btn btn-outline" onClick={() => onRemove(index)}>Remover</button>
          </div>
        ))}
      </div>
      <div className="config-add-row">
        <input
          className="form-input"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              onAdd()
            }
          }}
          placeholder={placeholder}
        />
        <button className="btn btn-outline" onClick={onAdd}>Adicionar</button>
      </div>
    </div>
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
  const headerColors = ['#e8f0fb', '#f7edf8', '#f3e5f5', '#fdecea', '#fff3e0', '#e6f4f1', '#fff8e1', '#e8f5e9', '#dfeee5', '#0c1f3a']
  const textColors = ['#1a4a8a', '#6a1a7a', '#6a1a7a', '#8a2b24', '#8a4a10', '#17615a', '#7a5800', '#1a6a30', '#1a6a30', '#e8ad4a']

  return (
    <div className="dash-kanban">
      {STAGES.map((stage, index) => {
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

function Kanban({ leads, settings, draggedId, setDraggedId, moveLead, openDetail }: {
  leads: Lead[]
  settings: Settings
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
              <span className="col-title">{stage === 'Protocolo Iniciado' ? `⭐ ${stage}` : stage}</span>
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
              {stageLeads.map((lead) => {
                const returnTask = getReturnTask(lead, settings)
                const funnelDays = getFunnelDays(lead)
                return (
                  <button
                    className={`lead-card ${lead.origin === 'Indicação' ? 'starred' : ''} ${returnTask ? 'needs-return' : ''}`}
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
                      {funnelDays > 15 && <span className="tag tag-urgent">⚑ {funnelDays}d</span>}
                      {returnTask && <span className="tag tag-return">Retorno</span>}
                    </div>
                    <div className="card-ticket">{currency(lead.ticket)}</div>
                    <div className="card-days">
                      {funnelDays} dias no funil · {firstName(lead.owner)}
                      {returnTask && <span className="return-task-note">Retorno pendente</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function LeadsTable({ leads, settings, openDetail }: { leads: Lead[], settings: Settings, openDetail: (id: string) => void }) {
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
          <th>Status</th>
          <th>Retorno</th>
          <th>Ticket</th>
          <th>Dias</th>
          <th>Resp.</th>
        </tr>
      </thead>
      <tbody>
        {leads.map((lead) => {
          const priorityClass = lead.ticket >= 8000 ? 'p-high' : lead.ticket >= 6000 ? 'p-med' : 'p-low'
          const returnTask = getReturnTask(lead, settings)
          const funnelDays = getFunnelDays(lead)
          return (
            <tr key={lead.id} onClick={() => openDetail(lead.id)}>
              <td><span className={`priority-dot ${priorityClass}`} /></td>
              <td className="lead-name-cell">{lead.name}</td>
              <td className="mono-cell">{lead.phone}</td>
              <td><span className="tag tag-area">{lead.area}</span></td>
              <td><span className="tag tag-origin origin-cell">{lead.origin}</span></td>
              <td><span className={`status-pill ${STAGE_CLASS[lead.stage]}`}>{lead.stage}</span></td>
              <td><span className={`status-pill ${STAGE_CLASS[lead.status]}`}>{statusLabel(lead.status)}</span></td>
              <td>{returnTask ? <span className="tag tag-return">Pendente</span> : <span className="muted-cell">—</span>}</td>
              <td className="money-cell strong">{currency(lead.ticket)}</td>
              <td className={`mono-cell ${funnelDays > 20 ? 'danger-text' : funnelDays > 10 ? 'warn-text' : ''}`}>{funnelDays}d</td>
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
  const colors = ['#e8f0fb', '#f7edf8', '#f3e5f5', '#fdecea', '#fff3e0', '#e6f4f1', '#fff8e1', '#e8f5e9', '#dfeee5', '#0c1f3a']
  const textColors = ['#1a4a8a', '#6a1a7a', '#6a1a7a', '#8a2b24', '#8a4a10', '#17615a', '#7a5800', '#1a6a30', '#1a6a30', '#e8ad4a']

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

function OwnerChart({ leads }: { leads: Lead[] }) {
  const total = Math.max(leads.length, 1)
  const owners = leads.reduce<Record<string, { count: number, ticket: number }>>((acc, lead) => {
    const current = acc[lead.owner] || { count: 0, ticket: 0 }
    acc[lead.owner] = { count: current.count + 1, ticket: current.ticket + lead.ticket }
    return acc
  }, {})

  return (
    <div className="chart-box">
      {Object.entries(owners).sort((a, b) => b[1].count - a[1].count).map(([owner, data]) => {
        const pct = Math.round((data.count / total) * 100)
        const avgTicket = data.count ? Math.round(data.ticket / data.count) : 0
        return (
          <div className="chart-row" key={owner}>
            <div className="chart-label origin-label">{owner}</div>
            <div className="chart-track small">
              <div className="chart-fill origin-fill" style={{ width: `${pct}%` }}>
                {data.count} ({pct}%) · {currency(avgTicket)}
              </div>
            </div>
          </div>
        )
      })}
      {leads.length === 0 && <div className="empty table-empty">Nenhum dado no período filtrado</div>}
    </div>
  )
}

function StatusChart({ leads }: { leads: Lead[] }) {
  const total = Math.max(leads.length, 1)
  const statuses: LeadStatus[] = ['Ativo', 'Contrato Assinado', 'Perdido']

  return (
    <div className="chart-box">
      {statuses.map((status) => {
        const count = leads.filter((lead) => lead.status === status).length
        const pct = Math.round((count / total) * 100)
        return (
          <div className="chart-row" key={status}>
            <div className="chart-label origin-label">{statusLabel(status)}</div>
            <div className="chart-track small">
              <div className={`chart-fill status-fill ${STAGE_CLASS[status]}`} style={{ width: `${pct}%` }}>
                {count} ({pct}%)
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DetailPanel({ lead, settings, close, moveLead, registerReturn, saveLeadNotes, changeLeadStatus }: {
  lead: Lead | null
  settings: Settings
  close: () => void
  moveLead: (id: string, stage: Stage) => void
  registerReturn: (id: string) => Promise<void>
  saveLeadNotes: (id: string, notes: string) => Promise<boolean>
  changeLeadStatus: (id: string, status: LeadStatus) => Promise<void>
}) {
  const currentStageIndex = lead ? STAGES.indexOf(lead.stage) : -1
  const returnTask = lead ? getReturnTask(lead, settings) : null
  const [notesEditor, setNotesEditor] = useState({
    leadId: '',
    draft: '',
    isEditing: false,
    isSaving: false,
  })
  const notesDraft = lead && notesEditor.leadId === lead.id ? notesEditor.draft : lead?.notes || ''
  const isEditingNotes = Boolean(lead && notesEditor.leadId === lead.id && notesEditor.isEditing)
  const isSavingNotes = Boolean(lead && notesEditor.leadId === lead.id && notesEditor.isSaving)

  async function handleSaveNotes() {
    if (!lead) return
    setNotesEditor((current) => ({ ...current, isSaving: true }))
    const saved = await saveLeadNotes(lead.id, notesDraft)
    setNotesEditor({ leadId: lead.id, draft: notesDraft, isEditing: !saved, isSaving: false })
  }

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
            <div className="detail-pill-row">
              <div className="detail-stage-pill">{lead.stage}</div>
              <div className={`detail-stage-pill ${STAGE_CLASS[lead.status]}`}>{statusLabel(lead.status)}</div>
            </div>
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
              <DetailField label="Dias no funil" value={`${getFunnelDays(lead)} dias no funil`} />
              <DetailField label="Dias na etapa" value={`${getStageDays(lead)} dias na etapa`} />
              {returnTask && <DetailField label="Tarefa" value="Retorno pendente" accent />}
              <DetailField label="Criado em" value={formatDate(lead.createdAt)} />
              {lead.closedAt && <DetailField label="Encerrado em" value={formatDate(lead.closedAt)} />}
            </div>

            <div className="detail-section">
              <div className="detail-section-heading">
                <div className="detail-section-title">Observações</div>
                {!isEditingNotes && (
                  <button
                    className="inline-action"
                    onClick={() => setNotesEditor({
                      leadId: lead.id,
                      draft: lead.notes || '',
                      isEditing: true,
                      isSaving: false,
                    })}
                  >
                    Editar
                  </button>
                )}
              </div>
              {isEditingNotes ? (
                <div className="notes-editor">
                  <textarea
                    className="form-textarea"
                    value={notesDraft}
                    onChange={(event) => setNotesEditor((current) => ({ ...current, draft: event.target.value }))}
                    placeholder="Resumo do caso, documentos pendentes, observações importantes..."
                  />
                  <div className="notes-actions">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setNotesEditor({
                        leadId: lead.id,
                        draft: lead.notes || '',
                        isEditing: false,
                        isSaving: false,
                      })}
                    >
                      Cancelar
                    </button>
                    <button type="button" className="btn btn-gold" disabled={isSavingNotes} onClick={() => void handleSaveNotes()}>
                      {isSavingNotes ? 'Salvando...' : 'Salvar observação'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="detail-notes">{lead.notes || '—'}</div>
              )}
            </div>

            {isActiveLead(lead) && (
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
            )}

            <div className="detail-section">
              <div className="detail-section-title">Atividade Recente</div>
              {(lead.activity || []).map((activity) => {
                const [text, time, user] = activity.split(' — ')
                return (
                  <div className="activity-item" key={activity}>
                    <div className="activity-dot" />
                    <div>
                      <div className="activity-text">{text}</div>
                      <div className="activity-time">{time || ''}</div>
                      {user && <div className="activity-user">{user}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="detail-footer">
            {isActiveLead(lead) ? (
              <>
                {returnTask && <button className="btn btn-primary" onClick={() => void registerReturn(lead.id)}>Registrar retorno</button>}
                <button className="btn btn-outline" onClick={() => void changeLeadStatus(lead.id, 'Perdido')}>Arquivar perdido</button>
                <button className="btn btn-gold" onClick={() => void changeLeadStatus(lead.id, 'Contrato Assinado')}>Contrato assinado</button>
              </>
            ) : (
              <button className="btn btn-outline" onClick={() => void changeLeadStatus(lead.id, 'Ativo')}>Reativar card</button>
            )}
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
