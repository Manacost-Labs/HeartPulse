import { canOpenAdminPage } from '@/apps/public-web/lib/adminAccess';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { AdminPageClient } from '@/apps/public-web/ui/AdminPageClient';
import './admin.css';

export const dynamic = 'force-dynamic';
export const generateMetadata = seoStaticPageMetadata('/admin');

export default async function Page() {
  if (!await canOpenAdminPage()) {
    return <main className="admin-access-page"><section className="admin-access-card" aria-labelledby="admin-access-title">
      <h1 id="admin-access-title">Админ панель недоступна</h1>
      <p>Войдите в аккаунт администратора или запросите необходимые права.</p>
      <a href="/?login">Войти в профиль</a>
    </section></main>;
  }
  return <AdminPageClient />;
}
