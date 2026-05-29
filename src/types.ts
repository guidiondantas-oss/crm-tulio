export type Stage =
  | '1º Contato'
  | 'Entrevista Marcada'
  | 'Entrevista Realizada'
  | 'Pasta Completa'
  | 'Revisão Advogado'
  | 'Protocolo Iniciado'
  | 'Contrato Assinado'

export type Lead = {
  id: string
  name: string
  phone: string
  email: string
  area: string
  origin: string
  stage: Stage
  ticket: number
  owner: string
  days: number
  notes: string
  activity: string[]
  createdAt?: string
}

export type LeadInsert = Omit<Lead, 'id' | 'createdAt'>

export type Settings = {
  firmName: string
  ownerName: string
  monthlyProtocolGoal: number
  minimumTicket: number
  conversionGoal: number
}

export type DatabaseLead = {
  id: string
  name: string
  phone: string | null
  email: string | null
  legal_area: string
  origin: string
  stage: Stage
  estimated_ticket: number | null
  owner: string
  days_in_funnel: number | null
  notes: string | null
  activity: string[] | null
  created_at: string
}

export type DatabaseSettings = {
  id: number
  firm_name: string
  owner_name: string
  monthly_protocol_goal: number
  minimum_ticket: number
  conversion_goal: number
}
