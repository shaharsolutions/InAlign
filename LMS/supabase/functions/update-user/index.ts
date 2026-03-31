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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json();
    const { userId, password, fullName, phone, role, orgId, email, callerId } = body;

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

    // Verify caller has permissions
    if (callerId) {
      const { data: callerData, error: callerError } = await supabaseAdmin
        .from('profiles')
        .select('role, org_id')
        .eq('id', callerId)
        .single()

      if (callerError || (callerData.role !== 'org_admin' && callerData.role !== 'super_admin')) {
        throw new Error('Unauthorized to perform this action')
      }
      
      // If Org Admin, verify they own the user
      if (callerData.role === 'org_admin' && callerData.org_id !== finalOrgId) {
         throw new Error('Unauthorized to edit users from other organizations')
      }
    }

    // 1. Update Auth payload
    const userMetadataUpdate = { 
        full_name: fullName || existingProfile.full_name, 
        phone: phone || existingProfile.phone, 
        role: role || existingProfile.role, 
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
      authUpdatePayload.password = password
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
        role: role || existingProfile.role,
        org_id: finalOrgId,
      })

    if (profileError) throw profileError

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

