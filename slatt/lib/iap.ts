import { Platform, Alert } from 'react-native';
import { supabase } from './supabase';

export type PlanKey = 'monthly' | 'annual';

const APPLE_KEY = process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY ?? '';

let configured = false;

function isExpoGo(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants').default;
    return Constants?.appOwnership === 'expo';
  } catch {
    return false;
  }
}

function getRC(): any {
  try {
    return require('react-native-purchases').default;
  } catch {
    return null;
  }
}

export function setupIAP(): () => void {
  if (Platform.OS !== 'ios' || !APPLE_KEY || isExpoGo()) return () => {};
  const rc = getRC();
  if (!rc || configured) return () => {};
  try {
    const { LOG_LEVEL } = require('react-native-purchases');
    rc.setLogLevel(LOG_LEVEL.ERROR);
    rc.configure({ apiKey: APPLE_KEY });
    configured = true;
    const sub = rc.addCustomerInfoUpdateListener(async (info: any) => {
      if (Object.keys(info.entitlements.active).length > 0) await activatePro();
    });
    return () => sub.remove();
  } catch (e) {
    console.warn('[IAP] setup failed:', e);
    return () => {};
  }
}

export async function purchasePlan(plan: PlanKey): Promise<void> {
  if (isExpoGo()) {
    Alert.alert('Not available', 'Purchases only work on TestFlight or the App Store.');
    return;
  }
  const rc = getRC();
  if (!rc) return;
  try {
    const offerings = await rc.getOfferings();
    const pkg = plan === 'monthly' ? offerings.current?.monthly : offerings.current?.annual;
    if (!pkg) throw new Error(`No ${plan} package found in RevenueCat.`);
    await rc.purchasePackage(pkg);
    await activatePro();
  } catch (e: any) {
    if (!e?.userCancelled) throw e;
  }
}

export async function restorePurchases(): Promise<boolean> {
  const rc = getRC();
  if (!rc || isExpoGo()) return false;
  try {
    const info = await rc.restorePurchases();
    const active = Object.keys(info.entitlements.active).length > 0;
    if (active) await activatePro();
    return active;
  } catch {
    return false;
  }
}

async function activatePro() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/apple-iap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ activate: true }),
    });
  } catch {}
}
