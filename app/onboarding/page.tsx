import { redirect } from 'next/navigation';
import { auth } from '../../auth.js';
import { getProfilePageData } from '../../src/watchlist.js';
import { WatchedModelsForm } from '../WatchedModelsForm.js';
import { SparklesIcon } from '../icons.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { models, profile } = await getProfilePageData(session.user.id);

  return (
    <main className="auth-container">
      <div className="auth-card wide">
        <h1 className="auth-title">
          Welcome
          <SparklesIcon className="icon-trail" />
        </h1>
        <p className="auth-subtitle">
          Pick the motorcycles you want to follow. You&apos;ll get a focused feed for these, and you
          can change them anytime on your profile.
        </p>
        <WatchedModelsForm
          models={models.map((m) => ({ id: m.id, brand: m.brand, model: m.model }))}
          watchedIds={profile.watchedModelIds}
          mode="onboarding"
        />
      </div>
    </main>
  );
}
