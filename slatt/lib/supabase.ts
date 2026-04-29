import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key).catch(() => null),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value).catch(() => {}),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key).catch(() => {}),
};

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY!;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type Profile = {
  id: string;
  tier: 'free' | 'pro';
  queries_today: number;
  queries_reset_date: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};
