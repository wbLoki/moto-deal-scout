import { auth } from '../../auth.js';
import { MOTORCYCLE_CATALOG } from '../../src/catalog/motorcycleCatalog.js';
import { CompareForm } from '../CompareForm.js';
import { PageShell } from '../PageShell.js';
import { dictionaryFor, getLocale } from '../i18n/getLocale.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CATALOG = MOTORCYCLE_CATALOG.map((b) => ({ brand: b.brand, models: [...b.models] }));

export default function ComparePage() {
  return (
    <PageShell>
      <CompareBody />
    </PageShell>
  );
}

async function CompareBody() {
  const session = await auth();
  const signedIn = !!session?.user?.id;
  const locale = await getLocale();
  const t = dictionaryFor(locale);
  return (
    <>
      <h1 className="page-title">{t.compare.title}</h1>
      <p className="subtitle">{t.compare.subtitle}</p>
      <CompareForm catalog={CATALOG} signedIn={signedIn} locale={locale} />
    </>
  );
}
