import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function cleanString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Metodo nao permitido.' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authHeader = request.headers.get('Authorization') || ''
  const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Funcao sem variaveis do Supabase.' }, 500)
  }

  if (!accessToken) {
    return jsonResponse({ error: 'Sessao obrigatoria.' }, 401)
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const { data: authData, error: authError } = await adminClient.auth.getUser(accessToken)
  const callerRole = String(authData.user?.app_metadata?.role || '')

  if (authError || !authData.user || callerRole !== 'admin') {
    return jsonResponse({ error: 'Acesso negado.' }, 403)
  }

  let payload: Record<string, unknown>
  try {
    payload = await request.json()
  } catch {
    return jsonResponse({ error: 'JSON invalido.' }, 400)
  }

  const name = cleanString(payload.name)
  const email = cleanString(payload.email).toLowerCase()
  const password = typeof payload.password === 'string' ? payload.password : ''

  if (!name || !email || !password) {
    return jsonResponse({ error: 'Nome, e-mail e senha sao obrigatorios.' }, 400)
  }

  if (password.length < 8) {
    return jsonResponse({ error: 'A senha precisa ter pelo menos 8 caracteres.' }, 400)
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name,
      full_name: name,
      role: 'user',
    },
    app_metadata: {
      role: 'user',
      created_by: authData.user.id,
      created_by_email: authData.user.email,
    },
  })

  if (error) {
    return jsonResponse({ error: error.message }, error.status || 400)
  }

  return jsonResponse({
    user: {
      id: data.user.id,
      email: data.user.email,
    },
  })
})
