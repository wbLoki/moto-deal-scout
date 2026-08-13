import { redirect } from 'next/navigation';
import { auth } from '../../auth.js';
import { getProfilePageData } from '../../src/watchlist.js';
import { AccountSettings } from '../AccountSettings.js';
import { PageShell } from '../PageShell.js';
import { WatchedModelsForm } from '../WatchedModelsForm.js';
import { dictionaryFor, getLocale } from '../i18n/getLocale.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const t = dictionaryFor(await getLocale());
  return (
    <PageShell fallback={<p className="subtitle">{t.profile.loading}</p>}>
      <ProfileBody />
    </PageShell>
  );
}

async function ProfileBody() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { account, models, profile } = await getProfilePageData(session.user.id);
  const locale = await getLocale();
  const t = dictionaryFor(locale);

  return (
    <>
      <h1 className="title">{t.profile.title}</h1>
      <p className="subtitle">{t.profile.subtitle}</p>

      <section className="admin-section">
        <h2 className="settings-title">{t.profile.account}</h2>
        {account && (
          <AccountSettings
            locale={locale}
            email={account.email}
            name={account.name ?? ''}
            hasPassword={account.hasPassword}
          />
        )}
      </section>

      <section className="admin-section">
        <h2 className="settings-title">{t.nav.motos}</h2>
        <p className="settings-hint">{t.profile.watchedHint}</p>
        <WatchedModelsForm
          models={models
            .filter((m) => m.vehicleType === 'motorcycle')
            .map((m) => ({ id: m.id, brand: m.brand, model: m.model }))}
          watchedIds={profile.watchedModelIds.filter((id) =>
            models.some((m) => m.id === id && m.vehicleType === 'motorcycle'),
          )}
          mode="profile"
          locale={locale}
          vehicleType="motorcycle"
        />
      </section>

      <section className="admin-section">
        <h2 className="settings-title">{t.nav.cars}</h2>
        <p className="settings-hint">{t.profile.watchedHint}</p>
        <WatchedModelsForm
          models={models
            .filter((m) => m.vehicleType === 'car')
            .map((m) => ({ id: m.id, brand: m.brand, model: m.model }))}
          watchedIds={profile.watchedModelIds.filter((id) =>
            models.some((m) => m.id === id && m.vehicleType === 'car'),
          )}
          mode="profile"
          locale={locale}
          vehicleType="car"
        />
      </section>
    </>
  );
}
