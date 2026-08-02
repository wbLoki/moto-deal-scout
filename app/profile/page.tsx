import { redirect } from 'next/navigation';
import { auth } from '../../auth.js';
import { getUserProfile, listTrackedModels } from '../../src/watchlist.js';
import { SiteHeader } from '../SiteHeader.js';
import { WatchedModelsForm } from '../WatchedModelsForm.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const [models, profile] = await Promise.all([
    listTrackedModels(),
    getUserProfile(session.user.id),
  ]);

  return (
    <main className="container">
      <SiteHeader />
      <h1 className="title">Profile</h1>
      <p className="subtitle">
        Signed in as {session.user.email}. Choose which models you follow — your dashboard&apos;s
        “Watched” section shows deals for these.
      </p>

      <section className="admin-section">
        <h2 className="settings-title">Watched models</h2>
        <WatchedModelsForm
          models={models.map((m) => ({ id: m.id, brand: m.brand, model: m.model }))}
          watchedIds={profile.watchedModelIds}
          mode="profile"
        />
      </section>
    </main>
  );
}
