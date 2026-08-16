import { redirect } from 'next/navigation';
import { auth } from '../../auth.js';
import { getProfilePageData } from '../../src/watchlist.js';
import { AccountSettings } from '../AccountSettings.js';
import { PageShell } from '../PageShell.js';
import { SavedSearchesForm } from '../SavedSearchesForm.js';
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

  const { account, models, searches } = await getProfilePageData(session.user.id);
  const locale = await getLocale();
  const t = dictionaryFor(locale);
  const motoModels = models
    .filter((m) => m.vehicleType === 'motorcycle')
    .map((m) => ({ id: m.id, brand: m.brand, model: m.model }));
  const carModels = models
    .filter((m) => m.vehicleType === 'car')
    .map((m) => ({ id: m.id, brand: m.brand, model: m.model }));
  const motoBrands = [...new Set(motoModels.map((m) => m.brand))].sort();
  const carBrands = [...new Set(carModels.map((m) => m.brand))].sort();

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
        <p className="settings-hint">{t.profile.savedSearchesHint}</p>
        <SavedSearchesForm
          locale={locale}
          vehicleType="motorcycle"
          searches={searches}
          brands={motoBrands}
          models={motoModels}
        />
      </section>

      <section className="admin-section">
        <h2 className="settings-title">{t.nav.cars}</h2>
        <p className="settings-hint">{t.profile.savedSearchesHint}</p>
        <SavedSearchesForm
          locale={locale}
          vehicleType="car"
          searches={searches}
          brands={carBrands}
          models={carModels}
        />
      </section>
    </>
  );
}
