import { createClient } from '@supabase/supabase-js'
import { DEFAULT_SETTINGS } from './data'
import type { DatabaseLead, DatabaseSettings, Lead, LeadInsert, Settings } from './types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null

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

export async function fetchLeads() {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as DatabaseLead[]).map(mapLeadFromDatabase)
}

export async function createLead(lead: LeadInsert) {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('leads')
    .insert(mapLeadToDatabase(lead))
    .select('*')
    .single()

  if (error) throw error
  return mapLeadFromDatabase(data as DatabaseLead)
}

export async function updateLeadRecord(lead: Lead) {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('leads')
    .update(mapLeadToDatabase(lead))
    .eq('id', lead.id)
    .select('*')
    .single()

  if (error) throw error
  return mapLeadFromDatabase(data as DatabaseLead)
}

export async function getCurrentSession() {
  if (!supabase) return null

  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}

export function getSessionUserLabel(session: Awaited<ReturnType<typeof getCurrentSession>>) {
  const metadata = session?.user?.user_metadata as Record<string, unknown> | undefined
  const metadataName = metadata?.name || metadata?.full_name
  return String(metadataName || session?.user?.email || '').trim()
}

export function onAuthStateChanged(callback: (isAuthenticated: boolean, userLabel?: string) => void) {
  if (!supabase) return () => undefined

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(Boolean(session), getSessionUserLabel(session))
  })

  return () => data.subscription.unsubscribe()
}

export async function signInWithEmail(email: string, password: string) {
  if (!supabase) return null

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.session
}

export async function signOutUser() {
  if (!supabase) return

  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function fetchSettings() {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('crm_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  if (error) throw error
  return data ? mapSettingsFromDatabase(data as DatabaseSettings) : null
}

export async function saveSettings(settings: Settings) {
  if (!supabase) return null

  const { data, error } = await supabase
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
