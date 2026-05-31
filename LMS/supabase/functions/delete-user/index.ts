import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPER_ADMIN_ROLE = 'super_admin'
const ADMIN_ROLES = ['admin', 'org_admin']

async function getCallerProfile(req: Request, supabaseClient: ReturnType<typeof createClient>) {
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) throw new Error('Missing authorization token')

  const { data: authData, error: authError } = await supabaseClient.auth.getUser(token)
  if (authError || !authData.user) throw new Error('Invalid authorization token')

  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('id, role, org_id')
    .eq('id', authData.user.id)
    .single()

  if (profileError || !profile) throw new Error('Could not verify caller identity.')
  if (profile.role !== SUPER_ADMIN_ROLE && !ADMIN_ROLES.includes(profile.role)) {
    throw new Error('Unauthorized: Only admins can delete users.')
  }

  return profile
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json();
    const { userId, userIds } = body;
    const callerProfile = await getCallerProfile(req, supabaseClient)

    const usersToProcess = userIds && Array.isArray(userIds) ? userIds : (userId ? [userId] : []);
    
    if (usersToProcess.length === 0) {
      throw new Error('UserId or UserIds is required')
    }

    const results = [];

    for (const uid of usersToProcess) {
      try {
        // Admins can delete only users from their own organization.
        if (callerProfile.role !== SUPER_ADMIN_ROLE) {
          const { data: targetUser, error: targetError } = await supabaseClient
            .from('profiles')
            .select('role, org_id')
            .eq('id', uid)
            .single()
          
          if (targetError || !targetUser) {
            throw new Error(`Target user ${uid} not found.`)
          }

          if (targetUser.org_id !== callerProfile.org_id) {
            throw new Error(`Unauthorized: Cannot delete user ${uid} from different organization.`)
          }

          if (targetUser.role === SUPER_ADMIN_ROLE || ADMIN_ROLES.includes(targetUser.role)) {
            throw new Error(`Unauthorized: Only Super Admin can delete admin users.`)
          }
        }

        const { error: authError } = await supabaseClient.auth.admin.deleteUser(uid)
        if (authError) throw authError
        
        results.push({ userId: uid, status: 'success' });
      } catch (err: any) {
        results.push({ userId: uid, status: 'error', error: err.message });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200, // Return 200 even on error to avoid CORS preflight issues on 4xx if not handled
    })
  }
})
