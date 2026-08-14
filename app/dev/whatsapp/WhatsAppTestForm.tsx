'use client';

import { useActionState } from 'react';
import { sendWhatsAppTestAction, type WhatsAppTestState } from './actions.js';

const initial: WhatsAppTestState = {};

export function WhatsAppTestForm({ defaultPhone }: { defaultPhone: string }) {
  const [state, action, pending] = useActionState(sendWhatsAppTestAction, initial);

  return (
    <form action={action} className="auth-form">
      <label className="auth-field">
        <span>Phone (E.164)</span>
        <input
          type="tel"
          name="phone"
          defaultValue={defaultPhone}
          placeholder="+212612345678"
          required
        />
      </label>
      <label className="auth-field">
        <span>Title (model_vehicle)</span>
        <input type="text" name="title" defaultValue="Yamaha MT-07 — test" />
      </label>
      <label className="auth-field">
        <span>Price MAD (price)</span>
        <input type="number" name="price" defaultValue={68000} min={0} step={1000} />
      </label>
      <label className="auth-field">
        <span>Source id (button → /l/source/id)</span>
        <input type="text" name="sourceId" defaultValue="avito" />
      </label>
      <label className="auth-field">
        <span>External id (from a real listing in the app)</span>
        <input type="text" name="externalId" defaultValue="" placeholder="e.g. 123456789" />
      </label>
      {state.message && (
        <p className={state.ok ? 'settings-status ok' : 'settings-status err'}>{state.message}</p>
      )}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? 'Sending…' : 'Send test message'}
      </button>
    </form>
  );
}
