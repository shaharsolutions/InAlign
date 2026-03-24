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
    const { userId, callerId } = body;

    if (!userId) {
      throw new Error('UserId is required')
    }

    if (!callerId) {
      throw new Error('Caller ID is required for verification.')
    }

    // 1. Verify caller permissions
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

    // Optional: If org_admin, verify user belongs to same org
    if (callerProfile.role === 'org_admin') {
      const { data: targetUser, error: targetError } = await supabaseClient
        .from('profiles')
        .select('org_id')
        .eq('id', userId)
        .single()
      
      if (targetError || !targetUser) {
        throw new Error('Target user not found.')
      }

      if (targetUser.org_id !== callerProfile.org_id) {
        throw new Error('Unauthorized: Cannot delete user from different organization.')
      }
    }

    // 2. Delete from Auth
    const { error: authError } = await supabaseClient.auth.admin.deleteUser(userId)
    if (authError) throw authError

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

