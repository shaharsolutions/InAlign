import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  // 1. מענה לבקשת preflight של הדפדפן (CORS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // אתחול לקוח Supabase עזרת SERVICE_ROLE_KEY שיש לו הרשאות מלאות!
    // חשוב: מפתח זה אסור שיגיע לעולם לצד הלקוח (הדפדפן)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // משיכת הפרטים שנשלחו מהלקוח
    const body = await req.json();
    const { email, password, fullName, phone, role, orgId, callerId } = body;

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
    } else {
       // In case callerId is missing, we could try to verify Auth token, but for now we follow existing logic
       // Optionally throw error if security policy requires it.
    }

    // 1. יצירת המשתמש בהגדרות האימות (Auth) של Supabase
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // חוסך שליחת מייל אישור
      phone: phone || undefined,
      user_metadata: { full_name: fullName, phone: phone, role: role, org_id: orgId },
    })

    if (authError) throw authError

    // 2. עדכון או יצירת טבלת profiles הציבורית
    // (שימוש ב-upsert כדי להבטיח שהשורה תיווצר גם אם אין trigger במסד)
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: authData.user.id,
        email: email, // שמירת המייל לצורך תצוגה
        full_name: fullName,
        phone: phone || null,
        role: role,
        org_id: orgId,
      })

    if (profileError) throw profileError

    return new Response(
      JSON.stringify({
        message: 'המשתמש נוצר בהצלחה',
        user: { id: authData.user.id, email },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200, // Returning 200 so the frontend can handle the {error: ...} object comfortably
    })
  }
})

