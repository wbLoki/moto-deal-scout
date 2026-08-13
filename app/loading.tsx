import { getDictionary } from './i18n/getLocale.js';

/** Instant soft-nav feedback while the destination RSC stream loads. */
export default async function Loading() {
  const t = await getDictionary();
  return (
    <main className="container">
      <header className="site-header" aria-hidden />
      <div className="title" style={{ opacity: 0.35 }}>
        &nbsp;
      </div>
      <p className="subtitle" style={{ opacity: 0.35 }}>
        {t.common.loading}
      </p>
    </main>
  );
}
