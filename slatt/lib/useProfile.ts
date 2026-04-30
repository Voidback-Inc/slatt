import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import type { Profile } from './supabase';

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string>('');
  const [userId, setUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    setEmail(user.email ?? '');
    const { data } = await supabase
      .from('profiles')
      .select('id, tier, queries_today, queries_reset_date, stripe_customer_id, stripe_subscription_id')
      .eq('id', user.id)
      .single();
    if (data) setProfile(data as Profile);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { profile, email, userId, reloadProfile: load };
}
