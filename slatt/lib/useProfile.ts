import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabase';
import type { Profile } from './supabase';

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string>('');
  const [userId, setUserId] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    return () => { mounted.current = false; };
  }, []);

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted.current) return;
      setUserId(user.id);
      setEmail(user.email ?? '');
      const { data } = await supabase
        .from('profiles')
        .select('id, tier, queries_today, queries_reset_date, stripe_customer_id, stripe_subscription_id')
        .eq('id', user.id)
        .single();
      if (data && mounted.current) setProfile(data as Profile);
    } catch {
      // Auth session gone (sign-out in progress) — ignore
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { profile, email, userId, reloadProfile: load };
}
