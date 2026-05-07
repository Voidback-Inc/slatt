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
    // Identify user so RevenueCat subscriber ID matches Supabase user ID.
    // This makes webhook lookups and REST API calls work correctly.
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) rc.logIn(user.id).catch(() => {});
    });
    rc.addCustomerInfoUpdateListener(async (info: any) => {
      const hasActive = Object.keys(info.entitlements.active).length > 0;
      if (hasActive) await activatePro();
      else await deactivatePro();
    });
    return () => {};
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
    // Identify user before purchase so RC subscriber ID matches Supabase user ID
    const { data: { user } } = await supabase.auth.getUser();
    if (user) { try { await rc.logIn(user.id); } catch {} }

    const offerings = await rc.getOfferings();
    const current = offerings.current;
    if (!current) throw new Error('No offerings available. Make sure products are configured in RevenueCat.');

    // Try shorthand first ($rc_monthly / $rc_annual), then scan all packages by type
    let pkg = plan === 'monthly' ? current.monthly : current.annual;
    if (!pkg) {
      const targetType = plan === 'monthly' ? 'MONTHLY' : 'ANNUAL';
      pkg = (current.availablePackages ?? []).find(
        (p: any) => p.packageType === targetType,
      ) ?? null;
    }
    if (!pkg) throw new Error(`No ${plan} package found. Check RevenueCat offering setup.`);
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
    const { data: { user } } = await supabase.auth.getUser();
    if (user) { try { await rc.logIn(user.id); } catch {} }
    const info = await rc.restorePurchases();
    const active = Object.keys(info.entitlements.active).length > 0;
    if (active) await activatePro();
    return active;
  } catch {
    return false;
  }
}

async function activatePro(retries = 2): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/apple-iap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ activate: true }),
    });
    if (res.status === 402 && retries > 0) {
      await new Promise(r => setTimeout(r, 2500));
      return activatePro(retries - 1);
    }
  } catch {}
}

async function deactivatePro() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/apple-iap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ activate: false }),
    });
  } catch {}
}
