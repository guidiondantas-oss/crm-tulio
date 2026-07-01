# CRM Túlio Lopes Advocacia

Sistema web criado a partir do HTML original, mantendo o visual do dashboard, funil, leads, indicadores, configurações, modal e painel lateral.

## Rodar localmente

```bash
npm install
npm run dev
```

Sem variáveis reais do Supabase, o app bloqueia o acesso. Não existe mais login local/de teste.

## Supabase

1. Crie um projeto no Supabase.
2. Abra o SQL Editor.
3. Execute `supabase/schema.sql`.
4. Copie `.env.example` para `.env.local`.
5. Preencha:

```bash
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-public
```

6. Crie o usuário administrador com o script abaixo.

As policies do arquivo SQL exigem Supabase Auth e aceitam usuários com `app_metadata.role = "admin"` ou `app_metadata.role = "user"`. Com as variáveis configuradas, a tela de login usa e-mail e senha dos usuários criados no Supabase.

O `schema.sql` também cria as configurações da automação de retorno dos três primeiros contatos, a data de entrada em cada etapa do funil, as listas editáveis do formulário e os campos usados nos indicadores.

## Criar administrador

No Supabase, copie a `service_role key` em Project Settings > API. Use essa chave somente no terminal local ou como secret de Edge Function, nunca no front-end e nunca nas variáveis da Vercel do site.

PowerShell:

```powershell
$env:SUPABASE_URL="https://seu-projeto.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="sua-chave-service-role"
$env:ADMIN_EMAIL="admin@escritorio.com"
$env:ADMIN_PASSWORD="uma-senha-forte"
$env:ADMIN_NAME="Administrador"
npm run create-admin
```

Se o e-mail já existir no Supabase Auth, o script atualiza a senha e marca o usuário como administrador. Se já existir outro administrador, o script para sem criar um segundo admin.

## Criar usuários pelo CRM

Depois que o administrador inicial entrar no sistema, ele pode criar usuários comuns em Configurações > Usuários do Sistema. Essa ação usa a Edge Function `create-user`, que precisa estar publicada no Supabase:

```bash
supabase link --project-ref seu-project-ref
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role
supabase functions deploy create-user
```

Os usuários criados pelo CRM recebem `app_metadata.role = "user"`. Eles acessam o CRM, mas não veem a área de Configurações.

## Vercel

No projeto da Vercel, adicione somente as variáveis públicas do front-end:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

O build usa:

```bash
npm run build
```

O diretório publicado é `dist`.
