import { redirect } from 'next/navigation';
import { auth } from '../../auth.js';
import { getAccount } from '../../src/auth/userService.js';
import { getUserProfile, listTrackedModels } from '../../src/watchlist.js';
import { AccountSettings } from '../AccountSettings.js';
import { SiteHeader } from '../SiteHeader.js';
import { WatchedModelsForm } from '../WatchedModelsForm.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const [account, models, profile] = await Promise.all([
    getAccount(session.user.id),
    listTrackedModels(),
    getUserProfile(session.user.id),
  ]);

  return (
    <main className="container">
      <SiteHeader />
      <h1 className="title">Profile</h1>
      <p className="subtitle">Manage your account and the models you follow.</p>

      <section className="admin-section">
        <h2 className="settings-title">Account</h2>
        {account && (
          <AccountSettings
            email={account.email}
            name={account.name ?? ''}
            hasPassword={account.hasPassword}
          />
        )}
      </section>

      <section className="admin-section">
        <h2 className="settings-title">Watched models</h2>
        <p className="settings-hint">
          Your dashboard&apos;s “Watched” tab shows deals for these models.
        </p>
        <WatchedModelsForm
          models={models.map((m) => ({ id: m.id, brand: m.brand, model: m.model }))}
          watchedIds={profile.watchedModelIds}
          mode="profile"
        />
      </section>
    </main>
  );
}
