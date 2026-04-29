export type PlanKey = 'monthly' | 'annual';

export function setupIAP(): () => void {
  return () => {};
}

export async function purchasePlan(_plan: PlanKey): Promise<void> {
  throw new Error('unavailable');
}

export async function restorePurchases(): Promise<boolean> {
  return false;
}
