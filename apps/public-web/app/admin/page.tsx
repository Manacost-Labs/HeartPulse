import type { Metadata } from 'next';
import { canOpenAdminPage } from '../../lib/adminAccess';
import { AdminPageClient } from '../../ui/AdminPageClient';
import './admin.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Панель управления — HearthPulse',
  robots: { index: false, follow: false },
};

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
