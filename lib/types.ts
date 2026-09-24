export type EventStatus = 'draft' | 'live' | 'ended';

export type DashEvent = {
  id: string;
  slug: string;
  title: string; // "Tolu & Dayo's wedding"
  celebrants: string; // "Tolu & Dayo"
  mcName: string;
  status: EventStatus;
  paused: boolean;
  nextUp: string | null; // "Couple trivia starts after this song"
  bigSprayKobo: number;
  platformFeeBps: number;
  mcFeeBps: number;
  // The event's fixed account number (backup way, shown on the big screen).
  accountNumber: string | null;
  accountBank: string | null;
  accountName: string | null;
  // Where the money settles. Kept for records and for the Paystack split.
  celebrantBank: string | null;
  celebrantAccountNumber: string | null;
  celebrantAccountName: string | null;
  mcBank: string | null;
  mcAccountNumber: string | null;
  mcAccountName: string | null;
  paystackSplitCode: string | null;
  createdAt: string;
};

export type NewEvent = Omit<DashEvent, 'id' | 'createdAt'>;

export type IntentStatus = 'pending' | 'paid' | 'expired';

/** A guest filled the form and got a one-time account; waiting for the transfer. */
export type SprayIntent = {
  reference: string;
  eventId: string;
  guestName: string;
  message: string | null;
  anonymous: boolean;
  sprayKobo: number;
  feeKobo: number;
  totalKobo: number;
  accountNumber: string;
  bankName: string;
  accountName: string;
  expiresAt: string;
  status: IntentStatus;
  sprayId: number | null;
  createdAt: string;
};

export type SpraySource = 'qr' | 'direct';

/** A confirmed payment. Only these ever reach the screen. */
export type Spray = {
  id: number;
  eventId: string;
  reference: string;
  source: SpraySource;
  /** Real name (typed by guest or from the bank). Private: never sent to the screen for anonymous sprays. */
  guestName: string;
  /** Name as shown on screen. */
  displayName: string;
  message: string | null;
  anonymous: boolean;
  amountKobo: number;
  platformFeeKobo: number;
  mcFeeKobo: number;
  celebrantKobo: number;
  hidden: boolean;
  createdAt: string;
};

export type NewSpray = Omit<Spray, 'id' | 'createdAt' | 'hidden'>;

export type LeaderRow = { name: string; amountKobo: number };

export type EventStats = {
  totalKobo: number;
  count: number;
  leaderboard: LeaderRow[];
};
