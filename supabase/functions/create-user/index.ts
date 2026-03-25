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
    const { email, password, fullName, phone, role, orgId, callerId, users } = body;

    // Verify caller has permissions
    if (callerId) {
      const { data: callerData, error: callerError } = await supabaseAdmin
        .from('profiles')
        .select('role, org_id')
        .eq('id', callerId)
        .single()

      if (callerError || (callerData.role !== 'org_admin' && callerData.role !== 'super_admin')) {
        throw new Error('Unauthorized: Only admins can create users')
      }
    }

    // Determine if bulk or single
    const usersToProcess = users && Array.isArray(users) 
      ? users 
      : [{ email, password, fullName, phone, role, orgId, groupName: body.groupName }];

    const results = [];
    const groupsCache: Record<string, string> = {}; // { name_orgId: groupId }

    const cleanEmail = (email: string) => {
       if (!email) return "";
       // Remove all control characters, whitespace, and zero-width spaces
       // Also ensures it corresponds to standard ASCII for email addresses
       return email.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, "").trim().toLowerCase();
    };

    for (const user of usersToProcess) {
      const uEmail = cleanEmail(user.email);
      const uFullName = user.fullName?.trim();
      const uPassword = user.password || 'Lms123456';
      const uRole = user.role || 'learner';
      const uOrgId = user.orgId || orgId;
      const uPhone = user.phone?.toString().trim() || null;
      const uGroupName = user.groupName?.trim();


      try {
        if (!uEmail || !uFullName) {
          throw new Error('Missing email or full name');
        }

        // 1. Create Auth User
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: uEmail,
          password: uPassword,
          email_confirm: true,
          phone: uPhone || undefined,
          user_metadata: { full_name: uFullName, phone: uPhone, role: uRole, org_id: uOrgId },
        })

        if (authError) throw authError

        // 2. Create/Update Profile
        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .upsert({
            id: authData.user.id,
            email: uEmail,
            full_name: uFullName,
            phone: uPhone,
            role: uRole,
            org_id: uOrgId,
          })

        if (profileError) throw profileError

        // 3. Handle Group Assignment
        if (uGroupName && uOrgId) {
          const cacheKey = `${uGroupName}_${uOrgId}`;
          let groupId = groupsCache[cacheKey];

          if (!groupId) {
            // Check if group exists in DB
            const { data: existingGroup } = await supabaseAdmin
              .from('groups')
              .select('id')
              .eq('name', uGroupName)
              .eq('org_id', uOrgId)
              .maybeSingle();

            if (existingGroup) {
              groupId = existingGroup.id;
            } else {
              // Create new group
              const { data: newGroup, error: groupCreateError } = await supabaseAdmin
                .from('groups')
                .insert({ name: uGroupName, org_id: uOrgId })
                .select('id')
                .single();
              
              if (!groupCreateError && newGroup) {
                groupId = newGroup.id;
              }
            }
            if (groupId) groupsCache[cacheKey] = groupId;
          }

          if (groupId) {
            await supabaseAdmin.from('group_members').upsert({
              group_id: groupId,
              user_id: authData.user.id
            }, { onConflict: 'group_id, user_id' });
          }
        }

        results.push({ email: uEmail, status: 'success', userId: authData.user.id });
      } catch (err: any) {
        results.push({ email: uEmail || 'unknown', status: 'error', error: err.message });
      }
    }

    return new Response(
      JSON.stringify({
        message: 'Processing complete',
        results: results,
        // For backward compatibility return first user if single request
        user: results.length === 1 && results[0].status === 'success' ? { id: results[0].userId, email: results[0].email } : null,
        error: results.length === 1 && results[0].status === 'error' ? results[0].error : null,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})


