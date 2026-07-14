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

create or replace function public.is_crm_user()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'user');
$$;

create or replace function public.current_crm_owner_label()
returns text
language sql
stable
as $$
  select trim(coalesce(
    auth.jwt() -> 'user_metadata' ->> 'name',
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    auth.jwt() ->> 'email',
    ''
  ));
$$;

create or replace function public.can_access_crm_lead(lead_owner text)
returns boolean
language sql
stable
as $$
  select public.is_crm_admin()
    or (
      public.is_crm_user()
      and nullif(trim(coalesce(lead_owner, '')), '') is not null
      and lower(trim(lead_owner)) = lower(public.current_crm_owner_label())
    );
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
using (public.can_access_crm_lead(owner));

create policy "Public CRM lead insert"
on public.leads for insert
to authenticated
with check (public.can_access_crm_lead(owner));

create policy "Public CRM lead update"
on public.leads for update
to authenticated
using (public.can_access_crm_lead(owner))
with check (
  public.is_crm_user()
  and nullif(trim(coalesce(owner, '')), '') is not null
);

create policy "Public CRM lead delete"
on public.leads for delete
to authenticated
using (public.is_crm_admin());

create policy "Public CRM settings read"
on public.crm_settings for select
to authenticated
using (id = 1 and public.is_crm_user());

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
