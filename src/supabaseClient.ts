import { createClient } from '@supabase/supabase-js'
import { DEFAULT_SETTINGS } from './data'
import type { DatabaseLead, DatabaseSettings, Lead, LeadInsert, ManagedUser, Settings } from './types'

export type AppUserInsert = {
  name: string
  email: string
  password: string
}

type ManageUsersResponse = {
  users?: ManagedUser[]
  user?: ManagedUser
  deleted?: boolean
  userId?: string
}

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
const isPlaceholderConfig =
  !supabaseUrl ||
  !supabaseAnonKey ||
  supabaseUrl.includes('seu-projeto') ||
  supabaseAnonKey.includes('sua-chave')

export const hasSupabaseConfig = !isPlaceholderConfig

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

const normalizeStage = (lead: DatabaseLead) => {
  if (lead.stage === 'Contrato Assinado') return 'Protocolo Iniciado'
  if (lead.stage === 'Pasta Completa') return 'Documentação Concluída'
  if (lead.stage === 'Revisão Advogado') return 'Montagem de Processo'
  return lead.stage
}

const normalizeStatus = (lead: DatabaseLead) => {
  if (lead.status) return lead.status
  return lead.stage === 'Contrato Assinado' ? 'Contrato Assinado' : 'Ativo'
}

const mapLeadFromDatabase = (lead: DatabaseLead): Lead => ({
  id: lead.id,
  name: lead.name,
  phone: lead.phone || '—',
  email: lead.email || '',
  area: lead.legal_area,
  origin: lead.origin,
  stage: normalizeStage(lead),
  ticket: lead.estimated_ticket || 0,
  owner: lead.owner,
  days: lead.days_in_funnel || 0,
  notes: lead.notes || '',
  status: normalizeStatus(lead),
  activity: lead.activity || [],
  createdAt: lead.created_at,
  closedAt: lead.closed_at,
  stageChangedAt: lead.stage_changed_at || lead.created_at,
})

const mapLeadToDatabase = (lead: LeadInsert) => ({
  name: lead.name,
  phone: lead.phone,
  email: lead.email,
  legal_area: lead.area,
  origin: lead.origin,
  stage: lead.stage,
  estimated_ticket: lead.ticket,
  owner: lead.owner,
  days_in_funnel: lead.days,
  notes: lead.notes,
  status: lead.status,
  activity: lead.activity,
  closed_at: lead.closedAt || null,
  stage_changed_at: lead.stageChangedAt || null,
})

const mapSettingsFromDatabase = (settings: DatabaseSettings): Settings => ({
  firmName: settings.firm_name,
  ownerName: settings.owner_name,
  monthlyProtocolGoal: settings.monthly_protocol_goal,
  minimumTicket: settings.minimum_ticket,
  conversionGoal: settings.conversion_goal,
  firstContactReturnDays: settings.first_contact_return_days ?? 1,
  secondContactReturnDays: settings.second_contact_return_days ?? 2,
  thirdContactReturnDays: settings.third_contact_return_days ?? 3,
  originOptions: settings.origin_options?.length ? settings.origin_options : DEFAULT_SETTINGS.originOptions,
  legalAreaOptions: settings.legal_area_options?.length ? settings.legal_area_options : DEFAULT_SETTINGS.legalAreaOptions,
  ownerOptions: settings.owner_options?.length ? settings.owner_options : DEFAULT_SETTINGS.ownerOptions,
})

export async function fetchLeads(owner?: string) {
  const client = requireSupabase()
  let query = client
    .from('leads')
    .select('*')

  if (owner?.trim()) {
    query = query.eq('owner', owner.trim())
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) throw error
  return (data as DatabaseLead[]).map(mapLeadFromDatabase)
}

export async function createLead(lead: LeadInsert) {
  const client = requireSupabase()

  const { data, error } = await client
    .from('leads')
    .insert(mapLeadToDatabase(lead))
    .select('*')
    .single()

  if (error) throw error
  return mapLeadFromDatabase(data as DatabaseLead)
}

export async function updateLeadRecord(lead: Lead, returnUpdatedRecord = true) {
  const client = requireSupabase()

  if (!returnUpdatedRecord) {
    const { error } = await client
      .from('leads')
      .update(mapLeadToDatabase(lead))
      .eq('id', lead.id)

    if (error) throw error
    return lead
  }

  const { data, error } = await client
    .from('leads')
    .update(mapLeadToDatabase(lead))
    .eq('id', lead.id)
    .select('*')
    .single()

  if (error) throw error
  return mapLeadFromDatabase(data as DatabaseLead)
}

export async function deleteLeadRecord(id: string) {
  const client = requireSupabase()

  const { error, count } = await client
    .from('leads')
    .delete({ count: 'exact' })
    .eq('id', id)

  if (error) throw error
  if (count !== 1) throw new Error('O lead não foi excluído ou sua sessão não possui permissão.')
}

export async function getCurrentSession() {
  const client = requireSupabase()

  const { data, error } = await client.auth.getSession()
  if (error) throw error
  return data.session
}

export function getSessionUserLabel(session: Awaited<ReturnType<typeof getCurrentSession>>) {
  const metadata = session?.user?.user_metadata as Record<string, unknown> | undefined
  const metadataName = metadata?.name || metadata?.full_name
  return String(metadataName || session?.user?.email || '').trim()
}

export function getSessionUserRole(session: Awaited<ReturnType<typeof getCurrentSession>>) {
  const appMetadata = session?.user?.app_metadata as Record<string, unknown> | undefined
  return String(appMetadata?.role || '').trim()
}

export function onAuthStateChanged(callback: (isAuthenticated: boolean, userLabel?: string, userRole?: string) => void) {
  if (!supabase) return () => undefined

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(Boolean(session), getSessionUserLabel(session), getSessionUserRole(session))
  })

  return () => data.subscription.unsubscribe()
}

export async function signInWithEmail(email: string, password: string) {
  const client = requireSupabase()

  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.session
}

export async function signOutUser() {
  const client = requireSupabase()

  const { error } = await client.auth.signOut()
  if (error) throw error
}

export async function createAppUser(user: AppUserInsert) {
  const client = requireSupabase()

  const { data, error } = await client.functions.invoke<{ user: { id: string, email: string } }>('create-user', {
    body: user,
  })

  if (error) throw error
  if (!data?.user) throw new Error('Resposta vazia ao criar usuario.')
  return data.user
}

async function invokeManageUsers(body: Record<string, unknown>) {
  const client = requireSupabase()

  const { data, error } = await client.functions.invoke<ManageUsersResponse>('manage-users', {
    body,
  })

  if (error) throw error
  return data || {}
}

export async function fetchAppUsers() {
  const data = await invokeManageUsers({ action: 'list' })
  return data.users || []
}

export async function suspendAppUser(userId: string) {
  const data = await invokeManageUsers({ action: 'suspend', userId })
  if (!data.user) throw new Error('Resposta vazia ao suspender usuário.')
  return data.user
}

export async function activateAppUser(userId: string) {
  const data = await invokeManageUsers({ action: 'activate', userId })
  if (!data.user) throw new Error('Resposta vazia ao reativar usuário.')
  return data.user
}

export async function updateAppUserPassword(userId: string, password: string) {
  const data = await invokeManageUsers({ action: 'set-password', userId, password })
  if (!data.user) throw new Error('Resposta vazia ao trocar senha.')
  return data.user
}

export async function deleteAppUser(userId: string) {
  const data = await invokeManageUsers({ action: 'delete', userId })
  if (!data.deleted) throw new Error('Resposta vazia ao excluir usuário.')
  return data.userId || userId
}

export async function fetchSettings() {
  const client = requireSupabase()

  const { data, error } = await client
    .from('crm_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  if (error) throw error
  return data ? mapSettingsFromDatabase(data as DatabaseSettings) : null
}

export async function saveSettings(settings: Settings) {
  const client = requireSupabase()

  const { data, error } = await client
    .from('crm_settings')
    .upsert({
      id: 1,
      firm_name: settings.firmName,
      owner_name: settings.ownerName,
      monthly_protocol_goal: settings.monthlyProtocolGoal,
      minimum_ticket: settings.minimumTicket,
      conversion_goal: settings.conversionGoal,
      first_contact_return_days: settings.firstContactReturnDays,
      second_contact_return_days: settings.secondContactReturnDays,
      third_contact_return_days: settings.thirdContactReturnDays,
      origin_options: settings.originOptions.map((option) => option.trim()).filter(Boolean),
      legal_area_options: settings.legalAreaOptions.map((option) => option.trim()).filter(Boolean),
      owner_options: settings.ownerOptions.map((option) => option.trim()).filter(Boolean),
    })
    .select('*')
    .single()

  if (error) throw error
  return mapSettingsFromDatabase(data as DatabaseSettings)
}
