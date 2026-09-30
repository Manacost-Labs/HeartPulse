'use client';
import { useRouter } from 'next/navigation';
import { startTransition } from 'react';
import { useRouteErrorReport } from '@/apps/public-web/ui/useRouteErrorReport';
import '@/src/features/StandardCards.styles';
export default function CardsErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  useRouteErrorReport(error, 'route:standard-cards');
  const retry = () => startTransition(() => { router.refresh(); reset(); });
  return <main className="constructed-cards constructed-cards__state" role="alert" data-app-error="route:standard-cards">
    <h1>Данные карты временно недоступны</h1>
    <p>Не удалось получить каталог. Попробуйте снова через несколько минут.</p>
    <div className="constructed-cards__state-actions"><button type="button" onClick={retry}>Повторить</button>
      <a href="/standard/cards/standard/">К библиотеке карт</a></div>
  </main>;
}
