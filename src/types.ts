export type Stage =
  | '1º Contato'
  | '2º Contato (Follow up)'
  | '3º Contato (Follow up)'
  | 'Recuperação de Contato'
  | 'Entrevista Marcada'
  | 'Nota de Análise'
  | 'Entrevista Realizada'
  | 'Documentação Concluída'
  | 'Montagem de Processo'
  | 'Protocolo Iniciado'

export type LeadStatus = 'Ativo' | 'Contrato Assinado' | 'Perdido'
export type DatabaseStage = Stage | 'Pasta Completa' | 'Revisão Advogado' | 'Contrato Assinado'

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
  status: LeadStatus
  activity: string[]
  createdAt?: string
  closedAt?: string | null
  stageChangedAt?: string | null
}

export type LeadInsert = Omit<Lead, 'id' | 'createdAt'>

export type Settings = {
  firmName: string
  ownerName: string
  monthlyProtocolGoal: number
  minimumTicket: number
  conversionGoal: number
  firstContactReturnDays: number
  secondContactReturnDays: number
  thirdContactReturnDays: number
  originOptions: string[]
  legalAreaOptions: string[]
  ownerOptions: string[]
}

export type DatabaseLead = {
  id: string
  name: string
  phone: string | null
  email: string | null
  legal_area: string
  origin: string
  stage: DatabaseStage
  estimated_ticket: number | null
  owner: string
  days_in_funnel: number | null
  notes: string | null
  status: LeadStatus | null
  activity: string[] | null
  created_at: string
  closed_at: string | null
  stage_changed_at: string | null
}

export type DatabaseSettings = {
  id: number
  firm_name: string
  owner_name: string
  monthly_protocol_goal: number
  minimum_ticket: number
  conversion_goal: number
  first_contact_return_days: number | null
  second_contact_return_days: number | null
  third_contact_return_days: number | null
  origin_options: string[] | null
  legal_area_options: string[] | null
  owner_options: string[] | null
}
