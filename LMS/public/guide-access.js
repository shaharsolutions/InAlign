import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://kvlwkmappgpamigxoiwc.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2bHdrbWFwcGdwYW1pZ3hvaXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyOTgzNDUsImV4cCI6MjA5NTg3NDM0NX0.XtOID0JN-go71FFHE5NzmJRyiaFnS3lYyH1yfLbQHOY'

const ROLE_SUPER_ADMIN = 'super_admin'
const ROLE_ADMIN = 'admin'
const ROLE_ORG_ADMIN = 'org_admin'
const ROLE_LEARNER = 'learner'
const MANAGEMENT_ROLES = [ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_ORG_ADMIN]
const AUTHENTICATED_ROLES = [...MANAGEMENT_ROLES, ROLE_LEARNER]

const GUIDE_ACCESS = {
  'user_guide.html': {
    allowedRoles: MANAGEMENT_ROLES,
    redirectHash: '#/admin/settings',
    title: 'מדריך שימוש אינטראקטיבי'
  },
  'user_guide_training_managers.html': {
    allowedRoles: MANAGEMENT_ROLES,
    redirectHash: '#/admin/settings',
    title: 'מדריך למנהלי הדרכה'
  },
  'user_guide_learners.html': {
    allowedRoles: AUTHENTICATED_ROLES,
    redirectHash: '#/learner',
    title: 'מדריך שימוש ללומדים'
  }
}

const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: true
  }
})

function currentGuide() {
  const fileName = window.location.pathname.split('/').pop() || 'user_guide.html'
  return GUIDE_ACCESS[fileName]
}

function readMockUser() {
  try {
    return JSON.parse(localStorage.getItem('mock.auth.token') || 'null')
  } catch {
    return null
  }
}

async function readSupabaseUserRole() {
  const { data: sessionData, error: sessionError } = await client.auth.getSession()
  if (sessionError || !sessionData.session) return null

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('role')
    .eq('id', sessionData.session.user.id)
    .maybeSingle()

  if (profileError) throw profileError
  return profile?.role || null
}

function appUrl(hash) {
  return new URL(`index.html${hash}`, window.location.href).toString()
}

function renderAccessDenied({ guide, reason }) {
  document.body.innerHTML = `
    <main style="min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f5f7fb; color: #172033; font-family: Assistant, Arial, sans-serif; direction: rtl;">
      <section style="width: min(560px, 100%); background: white; border: 1px solid #d9e1ee; border-radius: 8px; padding: 28px; box-shadow: 0 10px 30px rgba(23, 32, 51, 0.08);">
        <div style="font-size: 2.4rem; color: #c2413d; margin-bottom: 8px;"><i class='bx bx-lock-alt'></i></div>
        <h1 style="margin: 0 0 10px; font-size: 1.55rem;">אין הרשאה לצפייה במדריך</h1>
        <p style="margin: 0 0 18px; color: #5d6b82; line-height: 1.6;">${reason}</p>
        <a href="${appUrl(guide.redirectHash)}" style="display: inline-flex; align-items: center; gap: 8px; min-height: 42px; padding: 0 16px; border-radius: 8px; background: #2563eb; color: white; text-decoration: none; font-weight: 700;">
          <i class='bx bx-arrow-back'></i> חזרה למערכת
        </a>
      </section>
    </main>
  `
  document.documentElement.classList.remove('guide-access-pending')
}

function allowGuide() {
  document.documentElement.classList.remove('guide-access-pending')
}

async function guardGuideAccess() {
  const guide = currentGuide()
  if (!guide) {
    allowGuide()
    return
  }

  try {
    const mockUser = readMockUser()
    const role = mockUser?.role || await readSupabaseUserRole()

    if (!role) {
      renderAccessDenied({
        guide,
        reason: `כדי לצפות ב-${guide.title} יש להתחבר למערכת עם משתמש מורשה.`
      })
      return
    }

    if (!guide.allowedRoles.includes(role)) {
      renderAccessDenied({
        guide,
        reason: `המדריך הזה זמין רק לבעלי התפקידים שהוגדרו עבורו במערכת.`
      })
      return
    }

    allowGuide()
  } catch (error) {
    console.error('[Align] Guide access check failed:', error)
    renderAccessDenied({
      guide,
      reason: 'לא ניתן היה לאמת את הרשאת הגישה למסמך כרגע. נסה להתחבר מחדש למערכת.'
    })
  }
}

guardGuideAccess()
