import type { LeadStatus, Settings, Stage } from './types'

export const STAGES: Stage[] = [
  '1º Contato',
  '2º Contato (Follow up)',
  '3º Contato (Follow up)',
  'Recuperação de Contato',
  'Entrevista Marcada',
  'Nota de Análise',
  'Entrevista Realizada',
  'Documentação Concluída',
  'Montagem de Processo',
  'Protocolo Iniciado',
]

export const STAGE_CLASS: Record<Stage | LeadStatus, string> = {
  '1º Contato': 's-contato',
  '2º Contato (Follow up)': 's-followup',
  '3º Contato (Follow up)': 's-followup',
  'Recuperação de Contato': 's-recuperacao',
  'Entrevista Marcada': 's-entrevista',
  'Nota de Análise': 's-analise',
  'Entrevista Realizada': 's-entrevista',
  'Documentação Concluída': 's-documentos',
  'Montagem de Processo': 's-montagem',
  'Protocolo Iniciado': 's-protocolo',
  Ativo: 's-ativo',
  'Contrato Assinado': 's-contrato',
  Perdido: 's-perdido',
}

export const DEFAULT_SETTINGS: Settings = {
  firmName: 'Túlio Lopes Advocacia',
  ownerName: 'Túlio Lopes',
  monthlyProtocolGoal: 12,
  minimumTicket: 6000,
  conversionGoal: 35,
  firstContactReturnDays: 1,
  secondContactReturnDays: 2,
  thirdContactReturnDays: 3,
  originOptions: [
    'Indicação',
    'WhatsApp',
    'Tráfego Pago (Instagram)',
    'Tráfego Pago (Google)',
    'Site',
    'Ligação',
  ],
  legalAreaOptions: [
    'Previdenciário',
    'Trabalhista',
    'Cível',
    'Criminal',
    'Administrativo',
    'Família',
    'Consumidor',
    'Bancário',
  ],
  ownerOptions: [
    'Túlio Lopes',
    'Coord. Comercial',
    'Assistente Jurídico',
  ],
}
