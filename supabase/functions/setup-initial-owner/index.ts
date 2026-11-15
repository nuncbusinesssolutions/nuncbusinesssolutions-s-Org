import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const fullName = String(body.fullName ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const businessName = String(body.businessName ?? '').trim();
    const branchName = String(body.branchName ?? 'Main Branch').trim();
    const branchCode = String(body.branchCode ?? 'MAIN').trim().toUpperCase();
    const address = String(body.address ?? 'Manila, Philippines').trim();
    const phone = String(body.phone ?? '').trim();

    if (fullName.length < 2 || !email.includes('@') || password.length < 8 || businessName.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Valid full name, email, business name, and password (min 8 chars) required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: ownerExists, error: checkErr } = await adminClient.rpc('is_owner_exists', {
      p_env: 'production',
    });
    if (checkErr) throw checkErr;
    if (ownerExists) {
      return new Response(JSON.stringify({ error: 'Initial owner already configured.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role_key: 'super_admin' },
    });
    if (authErr || !authData.user) throw authErr ?? new Error('Failed to create owner auth user');

    const { data: branch, error: branchErr } = await adminClient
      .from('branches')
      .insert({
        env_mode: 'production',
        code: branchCode || 'MAIN',
        name: branchName,
        address,
        phone,
        is_primary: true,
        is_active: true,
        order_prefix: (branchCode || 'MN').slice(0, 4),
      })
      .select()
      .single();
    if (branchErr) {
      await adminClient.auth.admin.deleteUser(authData.user.id);
      throw branchErr;
    }

    const { error: profileErr } = await adminClient.from('user_profiles').insert({
      id: authData.user.id,
      env_mode: 'production',
      branch_id: branch.id,
      full_name: fullName,
      email,
      phone,
      role_key: 'super_admin',
      is_active: true,
    });
    if (profileErr) {
      await adminClient.auth.admin.deleteUser(authData.user.id);
      const isDuplicateOwner = profileErr.code === '23505';
      return new Response(
        JSON.stringify({ error: isDuplicateOwner ? 'Initial owner already configured.' : profileErr.message }),
        { status: isDuplicateOwner ? 403 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await adminClient.from('business_settings').upsert({
      env_mode: 'production',
      business_name: businessName,
      address,
      phone,
      email,
      currency_code: 'PHP',
      currency_symbol: '₱',
      timezone: 'Asia/Manila',
      is_setup_completed: false,
      setup_step: 2,
    });

    await adminClient.from('kds_stations').insert([
      { env_mode: 'production', branch_id: branch.id, name: 'Barista Station', code: 'BAR', sort_order: 1 },
      { env_mode: 'production', branch_id: branch.id, name: 'Hot Kitchen & Bakery', code: 'KIT', sort_order: 2 },
    ]);
    await adminClient.from('cash_drawers').insert({
      env_mode: 'production',
      branch_id: branch.id,
      name: 'Main Counter Drawer 1',
    });
    await adminClient.from('branch_hours').insert(
      [0, 1, 2, 3, 4, 5, 6].map((day) => ({
        branch_id: branch.id,
        day_of_week: day,
        open_time: '07:00',
        close_time: '22:00',
        is_closed: false,
      }))
    );
    await adminClient.from('tax_profiles').insert({
      env_mode: 'production',
      branch_id: branch.id,
      name: 'Non-VAT Exempt (Default)',
      tax_type: 'non_vat',
      pricing_mode: 'inclusive',
      rate_percent: 0,
      is_exempt: true,
      is_default: true,
    });
    await adminClient.from('channel_policies').insert([
      { env_mode: 'production', branch_id: branch.id, channel: 'pos', approval_policy: 'auto_confirm', require_payment_before_confirm: false },
      { env_mode: 'production', branch_id: branch.id, channel: 'qr_table', approval_policy: 'staff_approval', require_payment_before_confirm: false },
      { env_mode: 'production', branch_id: branch.id, channel: 'kiosk', approval_policy: 'auto_confirm', require_payment_before_confirm: false },
      { env_mode: 'production', branch_id: branch.id, channel: 'online', approval_policy: 'staff_approval', require_payment_before_confirm: false },
    ]);
    await adminClient.from('menu_categories').insert([
      { env_mode: 'production', branch_id: branch.id, name: 'Espresso & Drinks', sort_order: 1, is_active: true },
      { env_mode: 'production', branch_id: branch.id, name: 'Pastries & Kitchen', sort_order: 2, is_active: true },
    ]);
    const { data: mainZone } = await adminClient
      .from('dining_zones')
      .insert({ env_mode: 'production', branch_id: branch.id, name: 'Main Floor', sort_order: 1 })
      .select()
      .single();
    if (mainZone) {
      await adminClient.from('dining_tables').insert({
        env_mode: 'production',
        branch_id: branch.id,
        zone_id: mainZone.id,
        table_number: 'T-01',
        seats: 4,
        pos_x: 40,
        pos_y: 40,
      });
    }

    return new Response(JSON.stringify({ success: true, branchId: branch.id, userId: authData.user.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
