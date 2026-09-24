import type { ThemeId } from './themes';

/** An event planner (or MC) who creates spray events. */
export type Planner = {
  id: string;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  // Where the planner's cut is paid.
  bankCode: string | null;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  paystackSubaccount: string | null;
  createdAt: string;
};

export type NewPlanner = Omit<Planner, 'id' | 'createdAt'>;

export type EventType = 'wedding' | 'birthday' | 'burial' | 'graduation' | 'other';

export type SetupStatus = 'pending' | 'ready' | 'failed';

export type SprayEvent = {
  id: string;
  /** The event's short link: dashpad.ng/<slug>, chosen by the planner. */
  slug: string;
  plannerId: string;
  eventType: EventType;
  title: string; // "Tolu & Dayo’s wedding"
  celebrantName: string; // "Tolu & Dayo"
  recipientLabel: string; // "the couple" -> "₦20,000 sent to the couple"
  theme: ThemeId;
  /** Photos of the celebrants (public image links), shown on the big screen. */
  photos: string[];
  /** Fun lines shown for sprays that arrive without a message. Empty = use the defaults. */
  hypeLines: string[];
  startsAt: string;
  endsAt: string;
  plannerFeeBps: number; // 0–4500 (0–45%)
  platformFeeBps: number; // 500 (5%)
  bigSprayKobo: number;
  paused: boolean;
  // Where the celebrant's money goes.
  payoutBankCode: string;
  payoutBankName: string;
  payoutAccountNumber: string;
  payoutAccountName: string;
  // The event's own account number that guests transfer to (from Paystack).
  accountNumber: string | null;
  accountBank: string | null;
  accountName: string | null;
  paystackCustomerCode: string | null;
  paystackDvaId: string | null;
  paystackSplitCode: string | null;
  paystackPayoutSubaccount: string | null;
  setupStatus: SetupStatus;
  setupError: string | null;
  closedAt: string | null;
  reportSentAt: string | null;
  /** Set when the planner deletes an event that already received money (kept for records). */
  deletedAt: string | null;
  createdAt: string;
};

export type NewSprayEvent = Omit<SprayEvent, 'id' | 'createdAt'>;

/** A confirmed bank transfer to an event's account. */
export type Transfer = {
  id: number;
  eventId: string;
  reference: string;
  amountKobo: number;
  /** Bank account name of the sender. Private: never shown on screen. */
  senderName: string | null;
  senderBank: string | null;
  /** The description the sender typed, cleaned. Shown on screen unless hidden. */
  message: string | null;
  /** Exactly what the bank sent as the description, before cleaning. Private. */
  rawNarration: string | null;
  platformFeeKobo: number;
  plannerFeeKobo: number;
  celebrantKobo: number;
  /** Paystack's processing fee on this transfer. DashPad pays it out of its 5%. */
  processingFeeKobo: number;
  /** Money that arrived before the start or after the end: kept off the screen. */
  outsideWindow: boolean;
  hidden: boolean;
  createdAt: string;
};

export type NewTransfer = Omit<Transfer, 'id' | 'createdAt' | 'hidden'>;

export type EventStats = { totalKobo: number; count: number };

export type PasswordReset = {
  id: string;
  plannerId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
};

export type PaymentLogOutcome = 'recorded' | 'duplicate' | 'ignored' | 'unmatched' | 'bad_signature' | 'error';

/** One payment notification from Paystack (or one check we made), for fixing problems. */
export type PaymentLog = {
  id: number;
  source: 'webhook' | 'check';
  paystackEvent: string | null;
  reference: string | null;
  outcome: PaymentLogOutcome;
  detail: string | null;
  eventId: string | null;
  /** The full notification Paystack sent (admin only), to see exactly what the bank passed on. */
  raw?: unknown;
  createdAt: string;
};

export type NewPaymentLog = Omit<PaymentLog, 'id' | 'createdAt'>;

export type IntentStatus = 'pending' | 'paid';

/**
 * A guest typed a message on their phone and got a one-time account number
 * for this one spray. The transfer to it is matched to the message for certain.
 */
export type SprayIntent = {
  reference: string;
  eventId: string;
  message: string | null;
  amountKobo: number;
  accountNumber: string;
  bankName: string;
  accountName: string;
  expiresAt: string;
  status: IntentStatus;
  transferId: number | null;
  createdAt: string;
};

export type NewSprayIntent = Omit<SprayIntent, 'createdAt' | 'status' | 'transferId'>;
