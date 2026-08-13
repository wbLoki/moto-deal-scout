import { redirect } from 'next/navigation';
import { auth } from '../../auth.js';
import { getProfilePageData } from '../../src/watchlist.js';
import { WatchedModelsForm } from '../WatchedModelsForm.js';
import { SparklesIcon } from '../icons.js';
import { AuthShell } from '../AuthShell.js';
import { dictionaryFor, getLocale } from '../i18n/getLocale.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { models, profile } = await getProfilePageData(session.user.id);
  const locale = await getLocale();
  const t = dictionaryFor(locale);

  return (
    <AuthShell>
      <div className="auth-card wide">
        <h1 className="auth-title">
          {t.auth.welcome}
          <SparklesIcon className="icon-trail" />
        </h1>
        <p className="auth-subtitle">{t.auth.onboardingSubtitle}</p>
        <WatchedModelsForm
          models={models.map((m) => ({ id: m.id, brand: m.brand, model: m.model }))}
          watchedIds={profile.watchedModelIds}
          mode="onboarding"
          locale={locale}
        />
      </div>
    </AuthShell>
  );
}
