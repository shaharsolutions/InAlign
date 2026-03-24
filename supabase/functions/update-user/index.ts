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

    if (!userId || !orgId) {
      throw new Error('Missing required parameters: userId or orgId')
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
    }

    // 1. Update Auth payload
    const userMetadataUpdate = { full_name: fullName, phone: phone, role: role, org_id: orgId }
    
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
        email: email || authData.user.email,
        full_name: fullName,
        phone: phone || null,
        role: role,
        org_id: orgId,
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

