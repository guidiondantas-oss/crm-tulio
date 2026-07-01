# CRM Túlio Lopes Advocacia

Sistema web criado a partir do HTML original, mantendo o visual do dashboard, funil, leads, indicadores, configurações, modal e painel lateral.

## Rodar localmente

```bash
npm install
npm run dev
```

Sem variáveis do Supabase, o app usa um login local para desenvolvimento e abre com os dados de exemplo do HTML original.

## Supabase

1. Crie um projeto no Supabase.
2. Abra o SQL Editor.
3. Execute `supabase/schema.sql`.
4. Crie pelo menos um usuário em Authentication > Users.
5. Copie `.env.example` para `.env.local`.
6. Preencha:

```bash
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-public
```

As policies do arquivo SQL exigem Supabase Auth. Com as variáveis configuradas, a tela de login usa e-mail e senha do usuário criado no Supabase.

O `schema.sql` também cria as configurações da automação de retorno dos três primeiros contatos, a data de entrada em cada etapa do funil, as listas editáveis do formulário e os campos usados nos indicadores.

## Vercel

No projeto da Vercel, adicione as mesmas variáveis:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

O build usa:

```bash
npm run build
```

O diretório publicado é `dist`.
