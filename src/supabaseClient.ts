import { createClient } from '@supabase/supabase-js'
import type { DatabaseLead, DatabaseSettings, Lead, LeadInsert, Settings } from './types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null

const mapLeadFromDatabase = (lead: DatabaseLead): Lead => ({
  id: lead.id,
  name: lead.name,
  phone: lead.phone || '—',
  email: lead.email || '',
  area: lead.legal_area,
  origin: lead.origin,
  stage: lead.stage,
  ticket: lead.estimated_ticket || 0,
  owner: lead.owner,
  days: lead.days_in_funnel || 0,
  notes: lead.notes || '',
  activity: lead.activity || [],
  createdAt: lead.created_at,
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
  activity: lead.activity,
})

const mapSettingsFromDatabase = (settings: DatabaseSettings): Settings => ({
  firmName: settings.firm_name,
  ownerName: settings.owner_name,
  monthlyProtocolGoal: settings.monthly_protocol_goal,
  minimumTicket: settings.minimum_ticket,
  conversionGoal: settings.conversion_goal,
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

export async function updateLeadStage(lead: Lead) {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('leads')
    .update({
      stage: lead.stage,
      activity: lead.activity,
    })
    .eq('id', lead.id)
    .select('*')
    .single()

  if (error) throw error
  return mapLeadFromDatabase(data as DatabaseLead)
}

export async function removeLead(id: string) {
  if (!supabase) return

  const { error } = await supabase.from('leads').delete().eq('id', id)
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
    })
    .select('*')
    .single()

  if (error) throw error
  return mapSettingsFromDatabase(data as DatabaseSettings)
}
