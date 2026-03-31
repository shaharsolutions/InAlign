import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
    const { userId, userIds, callerId } = body;

    if (!callerId) {
      throw new Error('Caller ID is required for verification.')
    }

    const { data: callerProfile, error: callerError } = await supabaseClient
      .from('profiles')
      .select('role, org_id')
      .eq('id', callerId)
      .single()

    if (callerError || !callerProfile) {
      throw new Error('Could not verify caller identity.')
    }

    if (callerProfile.role !== 'super_admin' && callerProfile.role !== 'org_admin') {
      throw new Error('Unauthorized: Only admins can delete users.')
    }

    const usersToProcess = userIds && Array.isArray(userIds) ? userIds : (userId ? [userId] : []);
    
    if (usersToProcess.length === 0) {
      throw new Error('UserId or UserIds is required')
    }

    const results = [];

    for (const uid of usersToProcess) {
      try {
        // Optional: If org_admin, verify user belongs to same org
        if (callerProfile.role === 'org_admin') {
          const { data: targetUser, error: targetError } = await supabaseClient
            .from('profiles')
            .select('org_id')
            .eq('id', uid)
            .single()
          
          if (targetError || !targetUser) {
            throw new Error(`Target user ${uid} not found.`)
          }

          if (targetUser.org_id !== callerProfile.org_id) {
            throw new Error(`Unauthorized: Cannot delete user ${uid} from different organization.`)
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


