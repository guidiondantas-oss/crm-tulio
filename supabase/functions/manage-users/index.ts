import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type AuthUser = {
  id: string
  email?: string
  created_at?: string
  last_sign_in_at?: string
  banned_until?: string
  app_metadata?: Record<string, unknown>
  user_metadata?: Record<string, unknown>
}

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

function getUserRole(user: AuthUser | null | undefined) {
  return String(user?.app_metadata?.role || '')
}

function getUserName(user: AuthUser) {
  return String(user.user_metadata?.name || user.user_metadata?.full_name || user.email || '').trim()
}

function isSuspended(user: AuthUser) {
  if (!user.banned_until) return false

  const bannedUntil = Date.parse(user.banned_until)
  return !Number.isNaN(bannedUntil) && bannedUntil > Date.now()
}

function mapManagedUser(user: AuthUser) {
  return {
    id: user.id,
    name: getUserName(user),
    email: user.email || '',
    role: getUserRole(user),
    status: isSuspended(user) ? 'suspended' : 'active',
    createdAt: user.created_at || '',
    lastSignInAt: user.last_sign_in_at || null,
    bannedUntil: user.banned_until || null,
    createdBy: String(user.app_metadata?.created_by || ''),
    createdByEmail: String(user.app_metadata?.created_by_email || ''),
  }
}

async function listAllUsers(adminClient: ReturnType<typeof createClient>) {
  let page = 1
  const perPage = 1000
  const users: AuthUser[] = []

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage })
    if (error) throw error

    users.push(...(data.users as AuthUser[]))
    if (!data.nextPage) return users
    page = data.nextPage
  }
}

async function getManagedUser(adminClient: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await adminClient.auth.admin.getUserById(userId)
  if (error) throw error

  const user = data.user as AuthUser | null
  if (!user || getUserRole(user) !== 'user') {
    throw new Response(JSON.stringify({ error: 'Usuário não encontrado ou não gerenciável.' }), {
      status: 404,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    })
  }

  return user
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

  try {
    const { data: authData, error: authError } = await adminClient.auth.getUser(accessToken)
    const caller = authData.user as AuthUser | null
    const callerRole = getUserRole(caller)

    if (authError || !caller || callerRole !== 'admin') {
      return jsonResponse({ error: 'Acesso negado.' }, 403)
    }

    let payload: Record<string, unknown>
    try {
      payload = await request.json()
    } catch {
      return jsonResponse({ error: 'JSON invalido.' }, 400)
    }

    const action = cleanString(payload.action) || 'list'

    if (action === 'list') {
      const users = await listAllUsers(adminClient)
      const managedUsers = users
        .filter((user) => getUserRole(user) === 'user')
        .map(mapManagedUser)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

      return jsonResponse({ users: managedUsers })
    }

    const userId = cleanString(payload.userId)
    if (!userId) {
      return jsonResponse({ error: 'Informe o usuário.' }, 400)
    }

    const targetUser = await getManagedUser(adminClient, userId)

    if (action === 'suspend') {
      const { data, error } = await adminClient.auth.admin.updateUserById(userId, {
        ban_duration: '876000h',
        app_metadata: {
          ...(targetUser.app_metadata || {}),
          suspended_by: caller.id,
          suspended_by_email: caller.email,
          suspended_at: new Date().toISOString(),
        },
      })
      if (error) throw error
      return jsonResponse({ user: mapManagedUser(data.user as AuthUser) })
    }

    if (action === 'activate') {
      const appMetadata = { ...(targetUser.app_metadata || {}) }
      delete appMetadata.suspended_by
      delete appMetadata.suspended_by_email
      delete appMetadata.suspended_at

      const { data, error } = await adminClient.auth.admin.updateUserById(userId, {
        ban_duration: 'none',
        app_metadata: appMetadata,
      })
      if (error) throw error
      return jsonResponse({ user: mapManagedUser(data.user as AuthUser) })
    }

    if (action === 'set-password') {
      const password = typeof payload.password === 'string' ? payload.password : ''
      if (password.length < 8) {
        return jsonResponse({ error: 'A senha precisa ter pelo menos 8 caracteres.' }, 400)
      }

      const { data, error } = await adminClient.auth.admin.updateUserById(userId, { password })
      if (error) throw error
      return jsonResponse({ user: mapManagedUser(data.user as AuthUser) })
    }

    if (action === 'delete') {
      const { error } = await adminClient.auth.admin.deleteUser(userId)
      if (error) throw error
      return jsonResponse({ deleted: true, userId })
    }

    return jsonResponse({ error: 'Acao invalida.' }, 400)
  } catch (error) {
    if (error instanceof Response) return error

    const message = error instanceof Error ? error.message : 'Erro ao gerenciar usuários.'
    return jsonResponse({ error: message }, 400)
  }
})
