import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPER_ADMIN_ROLE = 'super_admin'
const ADMIN_ROLES = ['admin', 'org_admin']
const PRIMARY_SUPER_ADMIN_EMAIL = (Deno.env.get('SUPER_ADMIN_EMAIL') || 'shaharsolutions@gmail.com').toLowerCase()

async function getCallerProfile(req: Request, supabaseAdmin: ReturnType<typeof createClient>) {
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) throw new Error('Missing authorization token')

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !authData.user) throw new Error('Invalid authorization token')

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, role, org_id')
    .eq('id', authData.user.id)
    .single()

  if (profileError || !profile) throw new Error('Could not verify caller profile')
  if (profile.role !== SUPER_ADMIN_ROLE && !ADMIN_ROLES.includes(profile.role)) {
    throw new Error('Unauthorized to perform this action')
  }

  return profile
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json();
    const { userId, password, fullName, phone, role, orgId, email } = body;

    if (!userId) {
      throw new Error('Missing required parameter: userId')
    }

    // Fetch existing profile to get current data if needed
    const { data: existingProfile, error: profileFetchError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (profileFetchError) throw new Error('Could not find profile for user ' + userId)

    const finalOrgId = orgId || existingProfile.org_id;
    if (!finalOrgId) {
      throw new Error('User has no organization associated and none was provided')
    }

    const callerData = await getCallerProfile(req, supabaseAdmin)

    // Admins can manage only users from their own organization and cannot appoint admins.
    if (callerData.role !== SUPER_ADMIN_ROLE && callerData.org_id !== finalOrgId) {
       throw new Error('Unauthorized to edit users from other organizations')
    }

    if (callerData.role !== SUPER_ADMIN_ROLE && (existingProfile.role === SUPER_ADMIN_ROLE || ADMIN_ROLES.includes(existingProfile.role))) {
      throw new Error('Only Super Admin can edit admins')
    }

    if (callerData.role !== SUPER_ADMIN_ROLE && (role === SUPER_ADMIN_ROLE || ADMIN_ROLES.includes(role))) {
      throw new Error('Only Super Admin can appoint admins')
    }

    const finalRole = role || existingProfile.role
    const finalEmail = (email || existingProfile.email || '').toLowerCase()

    if (finalRole === SUPER_ADMIN_ROLE && finalEmail !== PRIMARY_SUPER_ADMIN_EMAIL) {
      throw new Error('Only the primary owner email can be assigned as Super Admin')
    }

    if (password && password.trim() !== '' && password.trim().length < 8) {
      throw new Error('Password must contain at least 8 characters')
    }

    // 1. Update Auth payload
    const userMetadataUpdate = { 
        full_name: fullName || existingProfile.full_name, 
        phone: phone || existingProfile.phone, 
        role: finalRole, 
        org_id: finalOrgId 
    }
    
    const authUpdatePayload: any = {
      user_metadata: userMetadataUpdate
    }

    if (email) {
      authUpdatePayload.email = email
      authUpdatePayload.email_confirm = true
    }

    if (phone) {
      authUpdatePayload.phone = phone
    }

    if (password && password.trim() !== '') {
      authUpdatePayload.password = password.trim()
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      authUpdatePayload
    )

    if (authError) throw authError

    // 2. עדכון או יצירת טבלת profiles הציבורית
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        email: email || authData.user.email || existingProfile.email,
        full_name: fullName || existingProfile.full_name,
        phone: (phone !== undefined) ? (phone || null) : existingProfile.phone,
        role: finalRole,
        org_id: finalOrgId,
      })

    if (profileError) throw profileError

    if (finalOrgId !== existingProfile.org_id) {
      const { error: progressError } = await supabaseAdmin
        .from('learner_progress')
        .update({ org_id: finalOrgId })
        .eq('user_id', userId)

      if (progressError) throw progressError
    }

    await supabaseAdmin.from('activity_logs').insert({
      actor_id: callerData.id,
      actor_name: callerData.full_name,
      actor_role: callerData.role,
      org_id: finalOrgId,
      action: 'update',
      entity_type: 'profiles',
      entity_id: userId,
      entity_label: fullName || existingProfile.full_name,
      details: {
        source: 'edge_function:update-user',
        changed_fields: Object.entries({
          email,
          fullName,
          phone,
          role,
          orgId,
          password: password ? 'updated' : undefined
        })
          .filter(([, value]) => value !== undefined && value !== null && value !== '')
          .map(([key]) => key)
      }
    })

    return new Response(JSON.stringify({ message: 'User updated successfully' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})
