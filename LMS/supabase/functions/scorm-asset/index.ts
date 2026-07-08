import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-scorm-path, range',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, ETag',
}

const SUPER_ADMIN_ROLE = 'super_admin'
const MANAGEMENT_ROLES = ['admin', 'org_admin', SUPER_ADMIN_ROLE]
const BUCKET = 'scorm_packages'
const PROFILE_CACHE_TTL_MS = 60_000
const ACCESS_CACHE_TTL_MS = 300_000

type CallerProfile = { id: string; role: string; org_id: string | null }

const profileCache = new Map<string, { expires: number; profile: CallerProfile }>()
const accessCache = new Map<string, number>()

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
    webm: 'video/webm',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    pps: 'application/vnd.ms-powerpoint',
    ppsx: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
    key: 'application/vnd.apple.keynote',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    otf: 'font/otf',
  }
  return map[ext || ''] || 'application/octet-stream'
}

function responseHeaders(path: string, sourceHeaders?: Headers) {
  const headers = new Headers(corsHeaders)
  headers.set('Content-Type', sourceHeaders?.get('Content-Type') || getContentType(path))
  headers.set('Cache-Control', 'private, max-age=86400, stale-while-revalidate=604800')

  const contentLength = sourceHeaders?.get('Content-Length')
  const contentRange = sourceHeaders?.get('Content-Range')
  const acceptRanges = sourceHeaders?.get('Accept-Ranges')
  const etag = sourceHeaders?.get('ETag')
  const lastModified = sourceHeaders?.get('Last-Modified')

  if (contentLength) headers.set('Content-Length', contentLength)
  if (contentRange) headers.set('Content-Range', contentRange)
  if (acceptRanges) headers.set('Accept-Ranges', acceptRanges)
  else headers.set('Accept-Ranges', 'bytes')
  if (etag) headers.set('ETag', etag)
  if (lastModified) headers.set('Last-Modified', lastModified)

  return headers
}

async function getCallerProfile(req: Request, supabaseAdmin: ReturnType<typeof createClient>): Promise<CallerProfile> {
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) throw new Error('Missing authorization token')

  const cached = profileCache.get(token)
  if (cached && cached.expires > Date.now()) return cached.profile

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !authData.user) throw new Error('Invalid authorization token')

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, role, org_id')
    .eq('id', authData.user.id)
    .single()

  if (profileError || !profile) throw new Error('Could not verify caller profile')
  profileCache.set(token, {
    expires: Date.now() + PROFILE_CACHE_TTL_MS,
    profile,
  })
  return profile
}

function cacheAccess(profile: CallerProfile, orgId: string, courseId: string) {
  accessCache.set(`${profile.id}:${profile.role}:${profile.org_id || ''}:${orgId}:${courseId}`, Date.now() + ACCESS_CACHE_TTL_MS)
}

function hasCachedAccess(profile: CallerProfile, orgId: string, courseId: string) {
  const expires = accessCache.get(`${profile.id}:${profile.role}:${profile.org_id || ''}:${orgId}:${courseId}`)
  return !!expires && expires > Date.now()
}

async function assertCanAccessPath(
  path: string,
  profile: CallerProfile,
  supabaseAdmin: ReturnType<typeof createClient>,
) {
  const match = path.match(/^org_([^/]+)\/courses\/([^/]+)\//)
  if (!match) throw new Error('Invalid SCORM asset path')

  const [, orgId, courseId] = match

  if (hasCachedAccess(profile, orgId, courseId)) return

  const { data: course, error: courseError } = await supabaseAdmin
    .from('courses')
    .select('id, org_id, published')
    .eq('id', courseId)
    .eq('org_id', orgId)
    .single()

  if (courseError || !course) throw new Error('Course not found')

  if (profile.role === SUPER_ADMIN_ROLE) {
    cacheAccess(profile, orgId, courseId)
    return
  }

  if (profile.org_id !== orgId) {
    throw new Error('Unauthorized organization access')
  }

  if (MANAGEMENT_ROLES.includes(profile.role)) {
    cacheAccess(profile, orgId, courseId)
    return
  }

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

  if (directProgress && directProgress.length > 0) {
    cacheAccess(profile, orgId, courseId)
    return
  }

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

  cacheAccess(profile, orgId, courseId)
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

    const { data: signedData, error: signedError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, 60)
    if (signedError || !signedData?.signedUrl) throw new Error('SCORM asset not found')

    const upstreamHeaders = new Headers()
    const range = req.headers.get('Range')
    if (range) upstreamHeaders.set('Range', range)

    const upstream = await fetch(signedData.signedUrl, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: upstreamHeaders,
    })
    if (!upstream.ok && upstream.status !== 206) throw new Error('SCORM asset not found')

    return new Response(req.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders(path, upstream.headers),
    })
  } catch (error: any) {
    const status = /Unauthorized|not assigned|not published|authorization|Invalid/.test(error.message || '') ? 403 : 404
    return new Response(JSON.stringify({ error: error.message || String(error) }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
