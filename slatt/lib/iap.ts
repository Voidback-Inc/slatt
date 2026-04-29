import Purchases, { LOG_LEVEL, type PurchasesPackage } from 'react-native-purchases';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export type PlanKey = 'monthly' | 'annual';

const REVENUECAT_APPLE_KEY = process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY ?? '';

let configured = false;

export function setupIAP(): () => void {
  if (Platform.OS !== 'ios' || configured) return () => {};
  try {
    Purchases.setLogLevel(LOG_LEVEL.ERROR);
    Purchases.configure({ apiKey: REVENUECAT_APPLE_KEY });
    configured = true;

    const listener = Purchases.addCustomerInfoUpdateListener(async (info) => {
      const isActive = Object.keys(info.entitlements.active).length > 0;
      if (isActive) await activatePro();
    });
    return () => listener.remove();
  } catch {
    return () => {};
  }
}

export async function purchasePlan(plan: PlanKey): Promise<void> {
  const offerings = await Purchases.getOfferings();
  const current = offerings.current;
  if (!current) throw new Error('No offerings available');

  const pkg: PurchasesPackage | null =
    plan === 'monthly' ? current.monthly : current.annual;
  if (!pkg) throw new Error(`No ${plan} package found`);

  await Purchases.purchasePackage(pkg);
  await activatePro();
}

export async function restorePurchases(): Promise<boolean> {
  try {
    const info = await Purchases.restorePurchases();
    const isActive = Object.keys(info.entitlements.active).length > 0;
    if (isActive) await activatePro();
    return isActive;
  } catch {
    return false;
  }
}

async function activatePro(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/apple-iap`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ activate: true }),
      },
    );
  } catch {}
}
