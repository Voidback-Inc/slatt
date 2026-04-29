import { Platform } from 'react-native';
import { supabase } from './supabase';

export type PlanKey = 'monthly' | 'annual';

const REVENUECAT_APPLE_KEY = process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY ?? '';

let Purchases: any = null;
let configured = false;

function getSDK() {
  if (Purchases) return Purchases;
  try {
    Purchases = require('react-native-purchases').default;
  } catch {
    Purchases = null;
  }
  return Purchases;
}

export function setupIAP(): () => void {
  if (Platform.OS !== 'ios') return () => {};
  const sdk = getSDK();
  if (!sdk || configured) return () => {};
  try {
    sdk.setLogLevel(require('react-native-purchases').LOG_LEVEL.ERROR);
    sdk.configure({ apiKey: REVENUECAT_APPLE_KEY });
    configured = true;
    const listener = sdk.addCustomerInfoUpdateListener(async (info: any) => {
      if (Object.keys(info.entitlements.active).length > 0) await activatePro();
    });
    return () => listener.remove();
  } catch {
    return () => {};
  }
}

export async function purchasePlan(plan: PlanKey): Promise<void> {
  const sdk = getSDK();
  if (!sdk) throw new Error('IAP not available in Expo Go — test on TestFlight');
  const offerings = await sdk.getOfferings();
  const pkg = plan === 'monthly' ? offerings.current?.monthly : offerings.current?.annual;
  if (!pkg) throw new Error(`No ${plan} package found — check RevenueCat offerings`);
  await sdk.purchasePackage(pkg);
  await activatePro();
}

export async function restorePurchases(): Promise<boolean> {
  const sdk = getSDK();
  if (!sdk) return false;
  try {
    const info = await sdk.restorePurchases();
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
