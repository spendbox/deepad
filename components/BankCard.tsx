import { groupAccountNumber } from '@/lib/money';

/** A saved bank account shown as a card, like the one in your wallet. */
export default function BankCard({
  bankName,
  accountNumber,
  accountName,
  label = 'Payout account',
  onEdit,
}: {
  bankName: string;
  accountNumber: string;
  accountName: string;
  label?: string;
  onEdit?: () => void;
}) {
  return (
    <div className="bank-card">
      <div className="bank-card-top">
        <span className="bank-card-label">{label}</span>
        <span className="bank-card-ok" aria-label="Verified">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
          Verified
        </span>
      </div>
      <div className="bank-card-bank">{bankName}</div>
      <div className="bank-card-num">{groupAccountNumber(accountNumber)}</div>
      <div className="bank-card-bottom">
        <span className="bank-card-name">{accountName}</span>
        {onEdit && (
          <button type="button" className="bank-card-edit" onClick={onEdit}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13 7l4 4" /></svg>
            Edit
          </button>
        )}
      </div>
    </div>
  );
}
