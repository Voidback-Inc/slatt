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

  // Realtime: instantly reflect any DB change (e.g. from RevenueCat webhook or purchase)
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`profile:${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload) => { setProfile(payload.new as Profile); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  return { profile, email, userId, reloadProfile: load };
}
