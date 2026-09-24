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
  /** The unique code in the event's link: /e/<slug>. */
  slug: string;
  plannerId: string;
  eventType: EventType;
  title: string; // "Tolu & Dayo’s wedding"
  celebrantName: string; // "Tolu & Dayo"
  recipientLabel: string; // "the couple" -> "₦20,000 sent to the couple"
  theme: ThemeId;
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
  platformFeeKobo: number;
  plannerFeeKobo: number;
  celebrantKobo: number;
  /** Money that arrived before the start or after the end: kept off the screen. */
  outsideWindow: boolean;
  hidden: boolean;
  createdAt: string;
};

export type NewTransfer = Omit<Transfer, 'id' | 'createdAt' | 'hidden'>;

export type EventStats = { totalKobo: number; count: number };
