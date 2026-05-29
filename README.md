# CRM Túlio Lopes Advocacia

Sistema web criado a partir do HTML original, mantendo o visual do dashboard, funil, leads, indicadores, configurações, modal e painel lateral.

## Rodar localmente

```bash
npm install
npm run dev
```

Sem variáveis do Supabase, o app abre com os dados de exemplo do HTML original.

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

As policies do arquivo SQL liberam leitura e escrita pela chave anônima para manter o app fiel ao HTML, sem tela de login. Para produção com dados reais, o próximo passo recomendado é adicionar Supabase Auth e trocar as policies para usuários autenticados.

## Vercel

No projeto da Vercel, adicione as mesmas variáveis:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

O build usa:

```bash
npm run build
```

O diretório publicado é `dist`.
