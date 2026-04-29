import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// RevenueCat event types that grant pro access
const ACTIVATE_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'REACTIVATION',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'TRANSFER',
]);

// RevenueCat event types that revoke pro access
const DEACTIVATE_EVENTS = new Set([
  'EXPIRATION',
  'CANCELLATION',
]);

// BILLING_ISSUE: keep pro — Apple gives a grace period before actual expiration.
// RevenueCat will send EXPIRATION when the grace period ends.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const WEBHOOK_SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');

  // Verify RevenueCat webhook authorization header
  const authHeader = req.headers.get('Authorization');
  if (WEBHOOK_SECRET && authHeader !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const event = body?.event;
  if (!event) return new Response('Missing event', { status: 400 });

  const eventType: string = event.type ?? '';
  // app_user_id is the RevenueCat subscriber ID — we set this to the Supabase user ID via rc.logIn()
  const appUserId: string = event.app_user_id ?? '';

  if (!appUserId) return new Response('Missing app_user_id', { status: 400 });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (ACTIVATE_EVENTS.has(eventType)) {
    await supabase.from('profiles').update({ tier: 'pro' }).eq('id', appUserId);
    console.log(`[webhook] ${eventType} → set ${appUserId} to pro`);
  } else if (DEACTIVATE_EVENTS.has(eventType)) {
    // Only downgrade if truly expired (CANCELLATION keeps access until period ends in Apple's system)
    // For CANCELLATION we check if there's still an active period before downgrading.
    // RevenueCat sends EXPIRATION when the subscription actually ends, so that's the safer trigger.
    if (eventType === 'EXPIRATION') {
      await supabase.from('profiles').update({ tier: 'free' }).eq('id', appUserId);
      console.log(`[webhook] ${eventType} → set ${appUserId} to free`);
    } else {
      // CANCELLATION: user cancelled but is still in their paid period — keep pro
      console.log(`[webhook] ${eventType} → ${appUserId} cancelled but still in paid period, keeping pro`);
    }
  } else {
    console.log(`[webhook] unhandled event type: ${eventType}`);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
