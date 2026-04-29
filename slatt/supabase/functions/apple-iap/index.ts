import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APPLE_VERIFY_URL_PROD = 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_VERIFY_URL_SANDBOX = 'https://sandbox.itunes.apple.com/verifyReceipt';

async function verifyReceipt(receiptData: string, sharedSecret: string, sandbox = false) {
  const url = sandbox ? APPLE_VERIFY_URL_SANDBOX : APPLE_VERIFY_URL_PROD;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 'receipt-data': receiptData, password: sharedSecret }),
  });
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const APPLE_IAP_SHARED_SECRET = Deno.env.get('APPLE_IAP_SHARED_SECRET');

  if (!APPLE_IAP_SHARED_SECRET) {
    return new Response(JSON.stringify({ error: 'Missing APPLE_IAP_SHARED_SECRET' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: cors,
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (error || !user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401, headers: cors,
    });
  }

  const { receiptData } = await req.json();
  if (!receiptData) {
    return new Response(JSON.stringify({ error: 'Missing receiptData' }), {
      status: 400, headers: cors,
    });
  }

  // Try production first, fall back to sandbox (covers TestFlight)
  let result = await verifyReceipt(receiptData, APPLE_IAP_SHARED_SECRET, false);
  if (result.status === 21007) {
    result = await verifyReceipt(receiptData, APPLE_IAP_SHARED_SECRET, true);
  }

  // status 0 = valid
  if (result.status !== 0) {
    return new Response(JSON.stringify({ error: `Apple rejected receipt: status ${result.status}` }), {
      status: 402, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Check there's an active subscription in the latest receipt info
  const latestInfo: Record<string, string>[] = result.latest_receipt_info ?? [];
  const now = Date.now();
  const active = latestInfo.some(
    (info) => parseInt(info.expires_date_ms) > now
  );

  if (!active) {
    return new Response(JSON.stringify({ error: 'No active subscription found' }), {
      status: 402, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  await supabase.from('profiles').update({ tier: 'pro' }).eq('id', user.id);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
