// All money is stored and passed around in kobo (1 naira = 100 kobo) so we
// never lose precision. Only format to naira at the moment we display it.

export const PRESET_AMOUNTS_NAIRA = [1000, 5000, 10000, 20000, 50000, 100000];
export const MIN_SPRAY_NAIRA = 100;
export const MAX_SPRAY_NAIRA = 5_000_000;

/** "₦20,000" (or "₦20,000.50" when there are kobo). */
export function naira(kobo: number): string {
  const whole = Math.round(kobo) % 100 === 0;
  const value = kobo / 100;
  return (
    '₦' +
    value.toLocaleString('en-NG', {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    })
  );
}

export type FeeSettings = {
  /** Our platform fee in basis points (500 = 5%). */
  platformFeeBps: number;
  /** The MC's share in basis points (200 = 2%). */
  mcFeeBps: number;
};

export type FeeBreakdown = {
  sprayKobo: number;
  platformFeeKobo: number;
  mcFeeKobo: number;
  feeKobo: number;
  totalKobo: number;
  celebrantKobo: number;
};

/**
 * QR sprays: the guest pays the fee on top of the spray, so the celebrant
 * receives the full spray amount.
 */
export function feesOnTop(sprayKobo: number, s: FeeSettings): FeeBreakdown {
  const platformFeeKobo = Math.round((sprayKobo * s.platformFeeBps) / 10000);
  const mcFeeKobo = Math.round((sprayKobo * s.mcFeeBps) / 10000);
  const feeKobo = platformFeeKobo + mcFeeKobo;
  return {
    sprayKobo,
    platformFeeKobo,
    mcFeeKobo,
    feeKobo,
    totalKobo: sprayKobo + feeKobo,
    celebrantKobo: sprayKobo,
  };
}

/**
 * Direct transfers to the event account: there is no form to add a fee, so
 * the screen shows the full amount the guest sent and the fee comes out of
 * it before it reaches the celebrant.
 */
export function feesInside(receivedKobo: number, s: FeeSettings): FeeBreakdown {
  const platformFeeKobo = Math.round((receivedKobo * s.platformFeeBps) / 10000);
  const mcFeeKobo = Math.round((receivedKobo * s.mcFeeBps) / 10000);
  const feeKobo = platformFeeKobo + mcFeeKobo;
  return {
    sprayKobo: receivedKobo,
    platformFeeKobo,
    mcFeeKobo,
    feeKobo,
    totalKobo: receivedKobo,
    celebrantKobo: receivedKobo - feeKobo,
  };
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
