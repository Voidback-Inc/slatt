import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const REVENUECAT_SECRET = Deno.env.get('REVENUECAT_SECRET_KEY');

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (error || !user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: cors });
  }

  // Verify entitlement with RevenueCat if secret is set
  if (REVENUECAT_SECRET) {
    try {
      const rcRes = await fetch(`https://api.revenuecat.com/v1/subscribers/${user.id}`, {
        headers: { 'Authorization': `Bearer ${REVENUECAT_SECRET}` },
      });
      if (rcRes.ok) {
        const rcData = await rcRes.json();
        const entitlements = rcData.subscriber?.entitlements ?? {};
        const isActive = Object.values(entitlements).some(
          (e: any) => e.expires_date === null || new Date(e.expires_date) > new Date()
        );
        if (!isActive) {
          return new Response(JSON.stringify({ error: 'No active entitlement' }), {
            status: 402, headers: { ...cors, 'Content-Type': 'application/json' },
          });
        }
      }
    } catch {
      // If RevenueCat check fails, fall through and trust the client
    }
  }

  await supabase.from('profiles').update({ tier: 'pro' }).eq('id', user.id);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
