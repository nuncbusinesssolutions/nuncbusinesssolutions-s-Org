import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_INVITE_ROLES = ['manager', 'cashier', 'barista', 'rider'] as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: canInvite } = await userClient.rpc('has_permission', {
      p_module: 'staff',
      p_action: 'create',
    });
    if (!canInvite) {
      return new Response(JSON.stringify({ error: 'Permission denied: staff.create required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: callerProfile } = await adminClient
      .from('user_profiles')
      .select('branch_id, role_key, full_name')
      .eq('id', userData.user.id)
      .single();

    if (!callerProfile) {
      return new Response(JSON.stringify({ error: 'Caller staff profile not found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const email = String(body.email ?? '').trim().toLowerCase();
    const fullName = String(body.fullName ?? '').trim();
    const roleKey = String(body.roleKey ?? '');
    const branchId = String(body.branchId ?? callerProfile.branch_id);

    if (!ALLOWED_INVITE_ROLES.includes(roleKey as (typeof ALLOWED_INVITE_ROLES)[number])) {
      return new Response(JSON.stringify({ error: 'Invalid or disallowed staff role' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (callerProfile.role_key !== 'super_admin' && branchId !== callerProfile.branch_id) {
      return new Response(JSON.stringify({ error: 'Cross-branch staff invitation denied' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: inviteAuth, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, role_key: roleKey, branch_id: branchId },
    });
    if (inviteErr || !inviteAuth.user) throw inviteErr ?? new Error('Invite failed');

    await adminClient.from('user_profiles').upsert({
      id: inviteAuth.user.id,
      env_mode: 'production',
      branch_id: branchId,
      full_name: fullName,
      email,
      role_key: roleKey,
      is_active: true,
    });

    await adminClient.from('audit_logs').insert({
      env_mode: 'production',
      branch_id: branchId,
      actor_user_id: userData.user.id,
      actor_name: callerProfile.full_name,
      action: 'staff_invited',
      module: 'staff',
      target_id: inviteAuth.user.id,
      metadata: { email, roleKey },
    });

    return new Response(JSON.stringify({ success: true, userId: inviteAuth.user.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
