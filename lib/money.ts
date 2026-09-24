// All money is stored and passed around in kobo (1 naira = 100 kobo) so we
// never lose precision. Only format to naira at the moment we display it.

/** DashPad's cut of every transfer: 5%. */
export const PLATFORM_FEE_BPS = 500;
/** The most a planner can take from each transfer: 45%. */
export const MAX_PLANNER_FEE_BPS = 4500;

/** "₦20,000" (or "₦20,000.50" when there are kobo). */
export function naira(kobo: number): string {
  const whole = Math.round(kobo) % 100 === 0;
  return (
    '₦' +
    (kobo / 100).toLocaleString('en-NG', {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    })
  );
}

export type Split = {
  amountKobo: number;
  platformFeeKobo: number;
  plannerFeeKobo: number;
  celebrantKobo: number;
};

/**
 * Split one transfer. The screen shows the full amount sent; DashPad's 5% and
 * the planner's cut come out of it and the celebrant gets the rest.
 */
export function splitTransfer(amountKobo: number, plannerFeeBps: number, platformFeeBps = PLATFORM_FEE_BPS): Split {
  const platformFeeKobo = Math.round((amountKobo * platformFeeBps) / 10000);
  const plannerFeeKobo = Math.round((amountKobo * plannerFeeBps) / 10000);
  return {
    amountKobo,
    platformFeeKobo,
    plannerFeeKobo,
    celebrantKobo: amountKobo - platformFeeKobo - plannerFeeKobo,
  };
}

export function clampPlannerFeeBps(bps: number): number {
  if (!Number.isFinite(bps)) return 0;
  return Math.min(MAX_PLANNER_FEE_BPS, Math.max(0, Math.round(bps)));
}

/** Group digits of an account number so it reads well from far away: "0123 456 789". */
export function groupAccountNumber(acct: string): string {
  const d = acct.replace(/\D/g, '');
  if (d.length === 10) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  return d.replace(/(\d{3})(?=\d)/g, '$1 ');
}

/** Percent text from basis points: 500 -> "5%", 250 -> "2.5%". */
export function percent(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}
