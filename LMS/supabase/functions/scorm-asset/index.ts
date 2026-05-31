import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-scorm-path',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const SUPER_ADMIN_ROLE = 'super_admin'
const MANAGEMENT_ROLES = ['admin', 'org_admin', SUPER_ADMIN_ROLE]
const BUCKET = 'scorm_packages'

function safePath(rawPath: string | null) {
  const decoded = decodeURIComponent(rawPath || '').replace(/^\/+/, '')
  if (!decoded || decoded.includes('..') || decoded.includes('\\')) {
    throw new Error('Invalid SCORM asset path')
  }
  return decoded
}

function getContentType(path: string) {
  const ext = path.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    html: 'text/html; charset=utf-8',
    htm: 'text/html; charset=utf-8',
    js: 'application/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8',
    json: 'application/json; charset=utf-8',
    xml: 'application/xml; charset=utf-8',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    mp4: 'video/mp4',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    pdf: 'application/pdf',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    otf: 'font/otf',
  }
  return map[ext || ''] || 'application/octet-stream'
}

async function getCallerProfile(req: Request, supabaseAdmin: ReturnType<typeof createClient>) {
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) throw new Error('Missing authorization token')

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !authData.user) throw new Error('Invalid authorization token')

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, role, org_id')
    .eq('id', authData.user.id)
    .single()

  if (profileError || !profile) throw new Error('Could not verify caller profile')
  return profile
}

async function assertCanAccessPath(
  path: string,
  profile: { id: string; role: string; org_id: string | null },
  supabaseAdmin: ReturnType<typeof createClient>,
) {
  const match = path.match(/^org_([^/]+)\/courses\/([^/]+)\//)
  if (!match) throw new Error('Invalid SCORM asset path')

  const [, orgId, courseId] = match

  const { data: course, error: courseError } = await supabaseAdmin
    .from('courses')
    .select('id, org_id, published')
    .eq('id', courseId)
    .eq('org_id', orgId)
    .single()

  if (courseError || !course) throw new Error('Course not found')

  if (profile.role === SUPER_ADMIN_ROLE) return

  if (profile.org_id !== orgId) {
    throw new Error('Unauthorized organization access')
  }

  if (MANAGEMENT_ROLES.includes(profile.role)) return

  if (!course.published) {
    throw new Error('Course is not published')
  }

  const [{ data: directProgress }, { data: groupMemberships }] = await Promise.all([
    supabaseAdmin
      .from('learner_progress')
      .select('id')
      .eq('user_id', profile.id)
      .eq('course_id', courseId)
      .limit(1),
    supabaseAdmin
      .from('group_members')
      .select('group_id')
      .eq('user_id', profile.id),
  ])

  if (directProgress && directProgress.length > 0) return

  const groupIds = (groupMemberships || []).map((membership: { group_id: string }) => membership.group_id)
  if (groupIds.length === 0) throw new Error('Course is not assigned to learner')

  const { data: groupAssignments } = await supabaseAdmin
    .from('group_assignments')
    .select('group_id')
    .eq('course_id', courseId)
    .in('group_id', groupIds)
    .limit(1)

  if (!groupAssignments || groupAssignments.length === 0) {
    throw new Error('Course is not assigned to learner')
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const path = safePath(url.searchParams.get('path') || req.headers.get('x-scorm-path'))

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const profile = await getCallerProfile(req, supabaseAdmin)
    await assertCanAccessPath(path, profile, supabaseAdmin)

    const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path)
    if (error || !data) throw new Error('SCORM asset not found')

    return new Response(data, {
      headers: {
        ...corsHeaders,
        'Content-Type': getContentType(path),
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (error: any) {
    const status = /Unauthorized|not assigned|not published|authorization|Invalid/.test(error.message || '') ? 403 : 404
    return new Response(JSON.stringify({ error: error.message || String(error) }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
