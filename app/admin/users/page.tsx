import { redirect } from 'next/navigation';
import { auth } from '../../../auth.js';
import { listUsers } from '../../../src/adminMetrics.js';
import { AdminNav } from '../../AdminNav.js';
import { SiteHeader } from '../../SiteHeader.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

export default async function AdminUsersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  if (session.user.role !== 'admin') redirect('/');

  const users = await listUsers();

  return (
    <main className="container">
      <SiteHeader />
      <h1 className="title">Admin · Users</h1>
      <AdminNav active="users" />

      <section className="admin-section">
        <h2 className="settings-title">All users ({users.length})</h2>
        {users.length === 0 ? (
          <div className="empty">No users yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="user-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Sign-up</th>
                  <th>Watching</th>
                  <th>Onboarded</th>
                  <th>Budget set</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{u.name ?? '—'}</td>
                    <td>{u.role === 'admin' ? <span className="badge on">admin</span> : 'user'}</td>
                    <td>{u.method === 'password' ? 'Email' : 'Social'}</td>
                    <td>{u.watchedCount}</td>
                    <td>{u.onboarded ? 'Yes' : 'No'}</td>
                    <td>{u.hasRange ? 'Yes' : 'No'}</td>
                    <td>{formatDate(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
