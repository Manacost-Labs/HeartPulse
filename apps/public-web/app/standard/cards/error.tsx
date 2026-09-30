'use client';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { usePublicAccess } from '@/apps/public-web/ui/usePublicAccess';
import { navigate } from '@/apps/public-web/ui/navigation';
import { useRouteErrorRecovery } from '@/apps/public-web/ui/useRouteErrorRecovery';
import '@/src/features/StandardCards.styles';

export default function CardsErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const access = usePublicAccess();
  const recovery = useRouteErrorRecovery(error, retry, 'route:standard-cards', {
    heading: 'Данные карты временно недоступны',
    text: 'Не удалось получить каталог. Попробуйте снова через несколько минут.',
  });
  return <PublicPageShell activeTab="standard-cards" pathname="/standard/cards/" access={access} navigate={navigate} wide>
    <section className="constructed-cards constructed-cards__state" role="alert" data-app-error="route:standard-cards">
      <h1>{recovery.heading}</h1>
      <p>{recovery.text}</p>
      <div className="constructed-cards__state-actions">
        <button type="button" onClick={recovery.retry}>{recovery.action}</button>
        <a href="/standard/cards/standard/">К библиотеке карт</a>
      </div>
    </section>
  </PublicPageShell>;
}
