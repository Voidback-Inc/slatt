import { Platform, Alert } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

const isExpoGo = Constants.appOwnership === 'expo';

export type PlanKey = 'monthly' | 'annual';

const APPLE_KEY = process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY ?? '';

let sdk: any = null;
let configured = false;

function load() {
  if (sdk !== null) return sdk;
  try { sdk = require('react-native-purchases').default; } catch { sdk = false; }
  return sdk;
}

export function setupIAP(): () => void {
  if (Platform.OS !== 'ios' || !APPLE_KEY || isExpoGo) return () => {};
  const rc = load();
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
  const rc = load();
  if (!rc || isExpoGo) {
    Alert.alert('Not available', 'In-app purchases only work on a real device build.');
    return;
  }
  const offerings = await rc.getOfferings();
  const pkg = plan === 'monthly' ? offerings.current?.monthly : offerings.current?.annual;
  if (!pkg) throw new Error(`No ${plan} package in RevenueCat offerings.`);
  await rc.purchasePackage(pkg);
  await activatePro();
}

export async function restorePurchases(): Promise<boolean> {
  const rc = load();
  if (!rc) return false;
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
