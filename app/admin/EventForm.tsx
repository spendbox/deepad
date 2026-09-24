'use client';

import { useActionState } from 'react';
import type { DashEvent } from '@/lib/types';

type Action = (prev: string | null, form: FormData) => Promise<string | null>;

function Field(props: {
  name: string;
  label: string;
  defaultValue?: string | number | null;
  hint?: string;
  required?: boolean;
  inputMode?: 'numeric' | 'decimal' | 'text';
  placeholder?: string;
}) {
  const id = `f-${props.name}`;
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      <input
        id={id}
        name={props.name}
        className="input"
        defaultValue={props.defaultValue ?? ''}
        required={props.required}
        inputMode={props.inputMode}
        placeholder={props.placeholder}
      />
      {props.hint && <span className="hint">{props.hint}</span>}
    </div>
  );
}

export default function EventForm({ action, event, submitLabel }: { action: Action; event?: DashEvent; submitLabel: string }) {
  const [message, formAction, pending] = useActionState(action, null);
  const e = event;
  return (
    <form action={formAction} className="panel">
      <fieldset>
        <legend>The event</legend>
        <div className="grid-2">
          <Field name="celebrants" label="Who is being celebrated" defaultValue={e?.celebrants} required placeholder="Tolu & Dayo" />
          <Field name="title" label="Title on the big screen" defaultValue={e?.title} placeholder="Tolu & Dayo’s wedding" />
          <Field name="slug" label="Web address" defaultValue={e?.slug} placeholder="tolu-dayo" hint="Guests’ link will be /s/this-name. Letters, numbers and dashes." />
          <Field name="mcName" label="MC’s name" defaultValue={e?.mcName} placeholder="MC Kunle" />
          <Field name="nextUp" label="Coming up next (optional)" defaultValue={e?.nextUp} placeholder="Couple trivia starts after this song" />
          <Field name="bigSprayNaira" label="Big spray amount (₦)" inputMode="numeric" defaultValue={e ? e.bigSprayKobo / 100 : 100000} hint="A single spray this big takes over the whole screen." />
        </div>
      </fieldset>

      <fieldset>
        <legend>Fees (paid by the guest, on top of their spray)</legend>
        <div className="grid-2">
          <Field name="platformFeePercent" label="DashPad fee (%)" inputMode="decimal" defaultValue={e ? e.platformFeeBps / 100 : 5} />
          <Field name="mcFeePercent" label="MC’s share (%)" inputMode="decimal" defaultValue={e ? e.mcFeeBps / 100 : 2} />
        </div>
        <span className="hint">
          Example: with 5% + 2%, a ₦10,000 spray costs the guest ₦10,700. For direct transfers to the event account,
          the fee is taken out of the amount sent.
        </span>
      </fieldset>

      <fieldset>
        <legend>Event account number (shown large on the big screen)</legend>
        <div className="grid-2">
          <Field name="accountNumber" label="Account number" inputMode="numeric" defaultValue={e?.accountNumber} placeholder="0123456789" />
          <Field name="accountBank" label="Bank" defaultValue={e?.accountBank} placeholder="Wema Bank" />
          <Field name="accountName" label="Account name" defaultValue={e?.accountName} placeholder="DashPad / Tolu & Dayo" />
          <Field name="paystackSplitCode" label="Paystack split code (optional)" defaultValue={e?.paystackSplitCode} placeholder="SPL_xxxxxxxx" hint="Sends each payment’s shares to the celebrant, MC and DashPad automatically." />
        </div>
      </fieldset>

      <fieldset>
        <legend>Where the money goes</legend>
        <div className="grid-2">
          <Field name="celebrantBank" label="Celebrant’s bank" defaultValue={e?.celebrantBank} />
          <Field name="celebrantAccountNumber" label="Celebrant’s account number" inputMode="numeric" defaultValue={e?.celebrantAccountNumber} />
          <Field name="celebrantAccountName" label="Celebrant’s account name" defaultValue={e?.celebrantAccountName} />
          <Field name="mcBank" label="MC’s bank" defaultValue={e?.mcBank} />
          <Field name="mcAccountNumber" label="MC’s account number" inputMode="numeric" defaultValue={e?.mcAccountNumber} />
          <Field name="mcAccountName" label="MC’s account name" defaultValue={e?.mcAccountName} />
        </div>
      </fieldset>

      {message && (
        <p role="status" style={{ margin: 0, fontWeight: 700, color: message === 'Saved.' ? 'var(--green)' : 'var(--danger)' }}>
          {message}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="btn dark" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
