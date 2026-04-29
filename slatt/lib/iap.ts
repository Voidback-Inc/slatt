import {
  initConnection,
  endConnection,
  getSubscriptions,
  requestSubscription,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
  getAvailablePurchases,
  type SubscriptionPurchase,
} from 'react-native-iap';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export const PRODUCT_IDS = {
  monthly: 'com.voidback.slatt.monthly',
  annual: 'com.voidback.slatt.annual',
} as const;

export type PlanKey = keyof typeof PRODUCT_IDS;

let connectionActive = false;

export async function setupIAP(): Promise<() => void> {
  if (Platform.OS !== 'ios') return () => {};
  try {
    await initConnection();
    connectionActive = true;
  } catch {
    // IAP not available (simulator, no Apple account, etc.)
  }

  const purchaseSub = purchaseUpdatedListener(async (purchase: SubscriptionPurchase) => {
    if (purchase.transactionReceipt) {
      await verifyAndActivate(purchase.transactionReceipt);
      await finishTransaction({ purchase, isConsumable: false });
    }
  });

  const errorSub = purchaseErrorListener(() => {
    // purchase cancelled or failed — no action needed
  });

  return () => {
    purchaseSub.remove();
    errorSub.remove();
    if (connectionActive) endConnection();
  };
}

export async function purchasePlan(plan: PlanKey): Promise<void> {
  await requestSubscription({ sku: PRODUCT_IDS[plan] });
}

export async function restorePurchases(): Promise<boolean> {
  try {
    const purchases = await getAvailablePurchases();
    for (const purchase of purchases) {
      if (purchase.transactionReceipt) {
        const ok = await verifyAndActivate(purchase.transactionReceipt);
        if (ok) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function verifyAndActivate(receiptData: string): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;

    const res = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/apple-iap`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ receiptData }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}
