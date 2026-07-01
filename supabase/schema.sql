create extension if not exists pgcrypto;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  legal_area text not null default 'Previdenciário',
  origin text not null default 'Indicação',
  stage text not null default '1º Contato' check (
    stage in (
      '1º Contato',
      '2º Contato (Follow up)',
      '3º Contato (Follow up)',
      'Recuperação de Contato',
      'Entrevista Marcada',
      'Nota de Análise',
      'Entrevista Realizada',
      'Documentação Concluída',
      'Montagem de Processo',
      'Protocolo Iniciado'
    )
  ),
  estimated_ticket integer not null default 0,
  owner text not null default 'Túlio Lopes',
  days_in_funnel integer not null default 0,
  notes text,
  status text not null default 'Ativo' check (
    status in ('Ativo', 'Contrato Assinado', 'Perdido')
  ),
  activity text[] not null default array['Lead criado — agora'],
  closed_at timestamptz,
  stage_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.leads add column if not exists status text not null default 'Ativo';
alter table public.leads add column if not exists closed_at timestamptz;
alter table public.leads add column if not exists stage_changed_at timestamptz not null default now();

alter table public.leads drop constraint if exists leads_stage_check;

update public.leads
set
  status = 'Contrato Assinado',
  stage = 'Protocolo Iniciado',
  closed_at = coalesce(closed_at, created_at)
where stage = 'Contrato Assinado';

update public.leads
set stage = 'Documentação Concluída'
where stage = 'Pasta Completa';

update public.leads
set stage = 'Montagem de Processo'
where stage = 'Revisão Advogado';

alter table public.leads drop constraint if exists leads_status_check;

alter table public.leads add constraint leads_stage_check check (
  stage in (
    '1º Contato',
    '2º Contato (Follow up)',
    '3º Contato (Follow up)',
    'Recuperação de Contato',
    'Entrevista Marcada',
    'Nota de Análise',
    'Entrevista Realizada',
    'Documentação Concluída',
    'Montagem de Processo',
    'Protocolo Iniciado'
  )
);

alter table public.leads add constraint leads_status_check check (
  status in ('Ativo', 'Contrato Assinado', 'Perdido')
);

create table if not exists public.crm_settings (
  id integer primary key default 1 check (id = 1),
  firm_name text not null default 'Túlio Lopes Advocacia',
  owner_name text not null default 'Túlio Lopes',
  monthly_protocol_goal integer not null default 12,
  minimum_ticket integer not null default 6000,
  conversion_goal integer not null default 35,
  first_contact_return_days integer not null default 1,
  second_contact_return_days integer not null default 2,
  third_contact_return_days integer not null default 3,
  origin_options text[] not null default array[
    'Indicação',
    'WhatsApp',
    'Tráfego Pago (Instagram)',
    'Tráfego Pago (Google)',
    'Site',
    'Ligação'
  ],
  legal_area_options text[] not null default array[
    'Previdenciário',
    'Trabalhista',
    'Cível',
    'Criminal',
    'Administrativo',
    'Família',
    'Consumidor',
    'Bancário'
  ],
  owner_options text[] not null default array[
    'Túlio Lopes',
    'Coord. Comercial',
    'Assistente Jurídico'
  ],
  updated_at timestamptz not null default now()
);

alter table public.crm_settings drop column if exists marketing_investment;
alter table public.crm_settings add column if not exists first_contact_return_days integer not null default 1;
alter table public.crm_settings add column if not exists second_contact_return_days integer not null default 2;
alter table public.crm_settings add column if not exists third_contact_return_days integer not null default 3;
alter table public.crm_settings add column if not exists origin_options text[] not null default array[
  'Indicação',
  'WhatsApp',
  'Tráfego Pago (Instagram)',
  'Tráfego Pago (Google)',
  'Site',
  'Ligação'
];
alter table public.crm_settings add column if not exists legal_area_options text[] not null default array[
  'Previdenciário',
  'Trabalhista',
  'Cível',
  'Criminal',
  'Administrativo',
  'Família',
  'Consumidor',
  'Bancário'
];
alter table public.crm_settings add column if not exists owner_options text[] not null default array[
  'Túlio Lopes',
  'Coord. Comercial',
  'Assistente Jurídico'
];

create or replace function public.touch_crm_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists crm_settings_updated_at on public.crm_settings;
create trigger crm_settings_updated_at
before update on public.crm_settings
for each row execute function public.touch_crm_settings_updated_at();

alter table public.leads enable row level security;
alter table public.crm_settings enable row level security;

create or replace function public.is_crm_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

drop policy if exists "Public CRM lead read" on public.leads;
drop policy if exists "Public CRM lead insert" on public.leads;
drop policy if exists "Public CRM lead update" on public.leads;
drop policy if exists "Public CRM lead delete" on public.leads;
drop policy if exists "Public CRM settings read" on public.crm_settings;
drop policy if exists "Public CRM settings write" on public.crm_settings;

create policy "Public CRM lead read"
on public.leads for select
to authenticated
using (public.is_crm_admin());

create policy "Public CRM lead insert"
on public.leads for insert
to authenticated
with check (public.is_crm_admin());

create policy "Public CRM lead update"
on public.leads for update
to authenticated
using (public.is_crm_admin())
with check (public.is_crm_admin());

create policy "Public CRM lead delete"
on public.leads for delete
to authenticated
using (public.is_crm_admin());

create policy "Public CRM settings read"
on public.crm_settings for select
to authenticated
using (id = 1 and public.is_crm_admin());

create policy "Public CRM settings write"
on public.crm_settings for all
to authenticated
using (id = 1 and public.is_crm_admin())
with check (id = 1 and public.is_crm_admin());

insert into public.crm_settings (
  id,
  firm_name,
  owner_name,
  monthly_protocol_goal,
  minimum_ticket,
  conversion_goal,
  first_contact_return_days,
  second_contact_return_days,
  third_contact_return_days,
  origin_options,
  legal_area_options,
  owner_options
)
values (
  1,
  'Túlio Lopes Advocacia',
  'Túlio Lopes',
  12,
  6000,
  35,
  1,
  2,
  3,
  array[
    'Indicação',
    'WhatsApp',
    'Tráfego Pago (Instagram)',
    'Tráfego Pago (Google)',
    'Site',
    'Ligação'
  ],
  array[
    'Previdenciário',
    'Trabalhista',
    'Cível',
    'Criminal',
    'Administrativo',
    'Família',
    'Consumidor',
    'Bancário'
  ],
  array[
    'Túlio Lopes',
    'Coord. Comercial',
    'Assistente Jurídico'
  ]
)
on conflict (id) do nothing;

insert into public.leads (
  name,
  phone,
  email,
  legal_area,
  origin,
  stage,
  estimated_ticket,
  owner,
  days_in_funnel,
  notes,
  status,
  activity
)
select *
from (
  values
    ('Maria das Graças Silva', '(91) 98765-4321', 'mgraças@email.com', 'Previdenciário', 'Indicação', 'Protocolo Iniciado', 7500, 'Túlio Lopes', 12, 'Caso de aposentadoria por invalidez. Documentação médica completa. Urgente.', 'Ativo', array['Protocolo iniciado — 3 dias atrás','Montagem de processo aprovada — 5 dias atrás','Documentação concluída — 8 dias atrás']),
    ('João Batista Ferreira', '(91) 99123-4567', 'jbatista@gmail.com', 'Trabalhista', 'Tráfego Pago (Instagram)', 'Entrevista Marcada', 5500, 'Coord. Comercial', 3, 'Demissão sem justa causa. Entrevista agendada para quinta-feira.', 'Ativo', array['Entrevista agendada para 18/04 — 1 dia atrás','Lead qualificado via Instagram — 3 dias atrás']),
    ('Ana Cristina Pinheiro', '(91) 98877-6655', 'anapinheiro@outlook.com', 'Previdenciário', 'WhatsApp', 'Documentação Concluída', 8200, 'Assistente Jurídico', 18, 'Pensão por morte do cônjuge. Todos os documentos recebidos e organizados.', 'Ativo', array['Documentação concluída — 2 dias atrás','Entrevista realizada — 6 dias atrás','Lead recebido via WhatsApp — 18 dias atrás']),
    ('Carlos Eduardo Mendes', '(91) 97654-3210', 'cemendes@empresa.com', 'Cível', 'Indicação', '1º Contato', 6000, 'Túlio Lopes', 1, 'Indicação do cliente João B. Contato inicial realizado hoje.', 'Ativo', array['Primeiro contato realizado — hoje']),
    ('Rosângela Torres', '(91) 99988-7766', 'rtorres@email.com', 'Previdenciário', 'Tráfego Pago (Google)', 'Montagem de Processo', 7000, 'Túlio Lopes', 22, 'Auxílio-doença. Documentação médica em montagem de processo.', 'Ativo', array['Montagem de processo em andamento — 1 dia atrás','Documentação entregue — 4 dias atrás']),
    ('Francisca Lima', '(91) 98811-2233', 'frlima@gmail.com', 'Administrativo', 'Indicação', 'Entrevista Realizada', 9000, 'Túlio Lopes', 7, 'Servidor público. Revisão de benefício negado. Checklist entregue na entrevista.', 'Ativo', array['Entrevista realizada — 2 dias atrás','Entrevista marcada — 5 dias atrás','Contato via indicação — 7 dias atrás']),
    ('Pedro Araújo Santos', '(91) 99001-2345', 'pedroarauj@email.com', 'Trabalhista', 'WhatsApp', '2º Contato (Follow up)', 4500, 'Coord. Comercial', 2, 'Horas extras não pagas. Empresa de médio porte.', 'Ativo', array['Segundo contato enviado — hoje','Primeiro contato — 2 dias atrás']),
    ('Tereza Nascimento', '(91) 98765-0011', 'terezanasci@gmail.com', 'Previdenciário', 'Indicação', 'Protocolo Iniciado', 6800, 'Túlio Lopes', 35, 'Aposentadoria rural. Contrato assinado. Protocolo em andamento.', 'Contrato Assinado', array['Contrato assinado — 5 dias atrás','Protocolo iniciado — 8 dias atrás']),
    ('Raimundo Costa Barros', '(91) 97788-9900', 'raimundocb@hotmail.com', 'Criminal', 'Ligação', 'Entrevista Marcada', 12000, 'Túlio Lopes', 1, 'Caso criminal. Entrevista marcada para amanhã às 14h.', 'Ativo', array['Entrevista agendada — hoje','Ligação recebida — hoje']),
    ('Marlene Figueiredo', '(91) 99234-5678', 'marlenef@email.com', 'Previdenciário', 'Tráfego Pago (Instagram)', 'Protocolo Iniciado', 7200, 'Assistente Jurídico', 14, 'BPC-LOAS para pessoa com deficiência. Protocolo administrativo iniciado.', 'Ativo', array['Protocolo iniciado — 1 dia atrás','Revisão aprovada — 3 dias atrás']),
    ('Benedito Melo Carvalho', '(91) 98656-7788', 'bmelo@gmail.com', 'Cível', 'Site', 'Documentação Concluída', 5800, 'Assistente Jurídico', 9, 'Ação de cobrança. Documentação quase completa, falta 1 contrato.', 'Ativo', array['Documentação 90% completa — 1 dia atrás','Entrevista realizada — 4 dias atrás']),
    ('Iracema Santos Vieira', '(91) 99456-7890', 'iracema@email.com', 'Trabalhista', 'Indicação', '3º Contato (Follow up)', 5000, 'Coord. Comercial', 0, 'Rescisão indireta. Terceira tentativa de contato em andamento.', 'Ativo', array['Terceiro contato enviado — hoje','Primeiro contato — hoje'])
) as seed(
  name,
  phone,
  email,
  legal_area,
  origin,
  stage,
  estimated_ticket,
  owner,
  days_in_funnel,
  notes,
  status,
  activity
)
where not exists (select 1 from public.leads);
