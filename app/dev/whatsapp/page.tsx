import { notFound, redirect } from 'next/navigation';
import { auth } from '../../../auth.js';
import { getAccount } from '../../../src/auth/userService.js';
import { loadEnv } from '../../../src/config/env.js';
import { PageShell } from '../../PageShell.js';
import { WhatsAppTestForm } from './WhatsAppTestForm.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function WhatsAppDevPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const account = await getAccount(session.user.id);
  const env = loadEnv();
  const config = {
    tokenSet: Boolean(env.WHATSAPP_TOKEN),
    phoneNumberIdSet: Boolean(env.WHATSAPP_PHONE_NUMBER_ID),
    templateName: env.WHATSAPP_TEMPLATE_NAME ?? '',
    templateLang: env.WHATSAPP_TEMPLATE_LANG,
  };
  const ready = config.tokenSet && config.phoneNumberIdSet && Boolean(config.templateName);

  return (
    <PageShell>
      <h1 className="title">Dev · WhatsApp test</h1>
      <p className="subtitle">
        Sends one Cloud API template message through the same path as scan alerts. The template must
        already be approved in Meta Business Manager, with named body parameters model_vehicle and
        price, plus a Visit website button whose URL is{' '}
        <code>{'https://motosnipe.com/l/{{1}}'}</code> (suffix is sourceId/externalId).
      </p>

      <section className="admin-section">
        <h2 className="settings-title">Config</h2>
        <ul className="settings-hint">
          <li>WHATSAPP_TOKEN: {config.tokenSet ? 'set' : 'missing'}</li>
          <li>WHATSAPP_PHONE_NUMBER_ID: {config.phoneNumberIdSet ? 'set' : 'missing'}</li>
          <li>WHATSAPP_TEMPLATE_NAME: {config.templateName || 'missing'}</li>
          <li>WHATSAPP_TEMPLATE_LANG: {config.templateLang}</li>
        </ul>
        {!ready && (
          <p className="settings-status err">
            Fill the missing vars in <code>.env</code> and restart <code>npm run dev</code>.
          </p>
        )}
      </section>

      <section className="admin-section">
        <h2 className="settings-title">Send</h2>
        <WhatsAppTestForm defaultPhone={account?.phone ?? ''} />
      </section>
    </PageShell>
  );
}
