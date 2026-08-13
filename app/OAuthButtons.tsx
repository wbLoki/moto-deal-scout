import { oauthSignInAction } from './auth-actions.js';
import { getDictionary } from './i18n/getLocale.js';

function google(): boolean {
  return Boolean(process.env['AUTH_GOOGLE_ID'] && process.env['AUTH_GOOGLE_SECRET']);
}
function github(): boolean {
  return Boolean(process.env['AUTH_GITHUB_ID'] && process.env['AUTH_GITHUB_SECRET']);
}

/** Renders one button per configured OAuth provider, or nothing if none are set up. */
export async function OAuthButtons() {
  const hasGoogle = google();
  const hasGitHub = github();
  if (!hasGoogle && !hasGitHub) return null;
  const t = await getDictionary();

  return (
    <div className="oauth">
      <div className="oauth-divider">
        <span>{t.auth.orContinueWith}</span>
      </div>
      <div className="oauth-buttons">
        {hasGoogle && (
          <form action={oauthSignInAction.bind(null, 'google')}>
            <button className="btn" type="submit">
              Google
            </button>
          </form>
        )}
        {hasGitHub && (
          <form action={oauthSignInAction.bind(null, 'github')}>
            <button className="btn" type="submit">
              GitHub
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
