/** "Payouts arrive within 2 business days", shown wherever money is set up. */
export default function PayoutNote({ children }: { children?: React.ReactNode }) {
  return (
    <div className="payout-note">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      <span>{children ?? 'Payouts arrive in the bank account within 2 business days of each spray.'}</span>
    </div>
  );
}
