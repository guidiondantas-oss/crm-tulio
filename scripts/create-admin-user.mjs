import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const adminEmail = process.env.ADMIN_EMAIL
const adminPassword = process.env.ADMIN_PASSWORD
const adminName = process.env.ADMIN_NAME || 'Administrador'

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!supabaseUrl) fail('Defina SUPABASE_URL ou VITE_SUPABASE_URL.')
if (!serviceRoleKey) fail('Defina SUPABASE_SERVICE_ROLE_KEY. Nunca use essa chave no front-end ou na Vercel.')
if (!adminEmail) fail('Defina ADMIN_EMAIL.')
if (!adminPassword) fail('Defina ADMIN_PASSWORD.')
if (adminPassword.length < 8) fail('ADMIN_PASSWORD precisa ter pelo menos 8 caracteres.')

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function findUserByEmail(email) {
  let page = 1
  const perPage = 1000
  const normalizedEmail = email.toLowerCase()

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error

    const user = data.users.find((item) => item.email?.toLowerCase() === normalizedEmail)
    if (user) return user
    if (!data.nextPage) return null
    page = data.nextPage
  }
}

const metadata = {
  name: adminName,
  full_name: adminName,
  role: 'admin',
}

try {
  const existingUser = await findUserByEmail(adminEmail)
  const userPayload = {
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
    user_metadata: metadata,
    app_metadata: {
      ...(existingUser?.app_metadata || {}),
      role: 'admin',
    },
  }

  if (existingUser) {
    const { data, error } = await supabase.auth.admin.updateUserById(existingUser.id, userPayload)
    if (error) throw error
    console.log(`Usuario administrador atualizado: ${data.user.email}`)
  } else {
    const { data, error } = await supabase.auth.admin.createUser(userPayload)
    if (error) throw error
    console.log(`Usuario administrador criado: ${data.user.email}`)
  }
} catch (error) {
  console.error(error.message || error)
  process.exit(1)
}
