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
      'Entrevista Marcada',
      'Entrevista Realizada',
      'Pasta Completa',
      'Revisão Advogado',
      'Protocolo Iniciado',
      'Contrato Assinado'
    )
  ),
  estimated_ticket integer not null default 0,
  owner text not null default 'Túlio Lopes',
  days_in_funnel integer not null default 0,
  notes text,
  activity text[] not null default array['Lead criado — agora'],
  created_at timestamptz not null default now()
);

create table if not exists public.crm_settings (
  id integer primary key default 1 check (id = 1),
  firm_name text not null default 'Túlio Lopes Advocacia',
  owner_name text not null default 'Túlio Lopes',
  monthly_protocol_goal integer not null default 12,
  minimum_ticket integer not null default 6000,
  conversion_goal integer not null default 35,
  updated_at timestamptz not null default now()
);

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

drop policy if exists "Public CRM lead read" on public.leads;
drop policy if exists "Public CRM lead insert" on public.leads;
drop policy if exists "Public CRM lead update" on public.leads;
drop policy if exists "Public CRM lead delete" on public.leads;
drop policy if exists "Public CRM settings read" on public.crm_settings;
drop policy if exists "Public CRM settings write" on public.crm_settings;

create policy "Public CRM lead read"
on public.leads for select
to anon, authenticated
using (true);

create policy "Public CRM lead insert"
on public.leads for insert
to anon, authenticated
with check (true);

create policy "Public CRM lead update"
on public.leads for update
to anon, authenticated
using (true)
with check (true);

create policy "Public CRM lead delete"
on public.leads for delete
to anon, authenticated
using (true);

create policy "Public CRM settings read"
on public.crm_settings for select
to anon, authenticated
using (id = 1);

create policy "Public CRM settings write"
on public.crm_settings for all
to anon, authenticated
using (id = 1)
with check (id = 1);

insert into public.crm_settings (id, firm_name, owner_name, monthly_protocol_goal, minimum_ticket, conversion_goal)
values (1, 'Túlio Lopes Advocacia', 'Túlio Lopes', 12, 6000, 35)
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
  activity
)
select *
from (
  values
    ('Maria das Graças Silva', '(91) 98765-4321', 'mgraças@email.com', 'Previdenciário', 'Indicação', 'Protocolo Iniciado', 7500, 'Túlio Lopes', 12, 'Caso de aposentadoria por invalidez. Documentação médica completa. Urgente.', array['Protocolo iniciado — 3 dias atrás','Revisão jurídica aprovada — 5 dias atrás','Pasta completa confirmada — 8 dias atrás']),
    ('João Batista Ferreira', '(91) 99123-4567', 'jbatista@gmail.com', 'Trabalhista', 'Tráfego Pago (Instagram)', 'Entrevista Marcada', 5500, 'Coord. Comercial', 3, 'Demissão sem justa causa. Entrevista agendada para quinta-feira.', array['Entrevista agendada para 18/04 — 1 dia atrás','Lead qualificado via Instagram — 3 dias atrás']),
    ('Ana Cristina Pinheiro', '(91) 98877-6655', 'anapinheiro@outlook.com', 'Previdenciário', 'WhatsApp', 'Pasta Completa', 8200, 'Assistente Jurídico', 18, 'Pensão por morte do cônjuge. Todos os documentos recebidos e organizados.', array['Pasta completa confirmada — 2 dias atrás','Entrevista realizada — 6 dias atrás','Lead recebido via WhatsApp — 18 dias atrás']),
    ('Carlos Eduardo Mendes', '(91) 97654-3210', 'cemendes@empresa.com', 'Cível', 'Indicação', '1º Contato', 6000, 'Túlio Lopes', 1, 'Indicação do cliente João B. Contato inicial realizado hoje.', array['Primeiro contato realizado — hoje']),
    ('Rosângela Torres', '(91) 99988-7766', 'rtorres@email.com', 'Previdenciário', 'Tráfego Pago (Google)', 'Revisão Advogado', 7000, 'Túlio Lopes', 22, 'Auxílio-doença. Documentação médica em revisão pelo advogado.', array['Revisão jurídica em andamento — 1 dia atrás','Pasta entregue — 4 dias atrás']),
    ('Francisca Lima', '(91) 98811-2233', 'frlima@gmail.com', 'Administrativo', 'Indicação', 'Entrevista Realizada', 9000, 'Túlio Lopes', 7, 'Servidor público. Revisão de benefício negado. Checklist entregue na entrevista.', array['Entrevista realizada — 2 dias atrás','Entrevista marcada — 5 dias atrás','Contato via indicação — 7 dias atrás']),
    ('Pedro Araújo Santos', '(91) 99001-2345', 'pedroarauj@email.com', 'Trabalhista', 'WhatsApp', '1º Contato', 4500, 'Coord. Comercial', 2, 'Horas extras não pagas. Empresa de médio porte.', array['Primeiro contato — 2 dias atrás']),
    ('Tereza Nascimento', '(91) 98765-0011', 'terezanasci@gmail.com', 'Previdenciário', 'Indicação', 'Contrato Assinado', 6800, 'Túlio Lopes', 35, 'Aposentadoria rural. Contrato assinado. Protocolo em andamento.', array['Contrato assinado — 5 dias atrás','Protocolo iniciado — 8 dias atrás']),
    ('Raimundo Costa Barros', '(91) 97788-9900', 'raimundocb@hotmail.com', 'Criminal', 'Ligação', 'Entrevista Marcada', 12000, 'Túlio Lopes', 1, 'Caso criminal. Entrevista marcada para amanhã às 14h.', array['Entrevista agendada — hoje','Ligação recebida — hoje']),
    ('Marlene Figueiredo', '(91) 99234-5678', 'marlenef@email.com', 'Previdenciário', 'Tráfego Pago (Instagram)', 'Protocolo Iniciado', 7200, 'Assistente Jurídico', 14, 'BPC-LOAS para pessoa com deficiência. Protocolo administrativo iniciado.', array['Protocolo iniciado — 1 dia atrás','Revisão aprovada — 3 dias atrás']),
    ('Benedito Melo Carvalho', '(91) 98656-7788', 'bmelo@gmail.com', 'Cível', 'Site', 'Pasta Completa', 5800, 'Assistente Jurídico', 9, 'Ação de cobrança. Documentação quase completa, falta 1 contrato.', array['Pasta 90% completa — 1 dia atrás','Entrevista realizada — 4 dias atrás']),
    ('Iracema Santos Vieira', '(91) 99456-7890', 'iracema@email.com', 'Trabalhista', 'Indicação', '1º Contato', 5000, 'Coord. Comercial', 0, 'Rescisão indireta. Lead novo, contato realizado agora.', array['Primeiro contato — hoje'])
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
  activity
)
where not exists (select 1 from public.leads);
