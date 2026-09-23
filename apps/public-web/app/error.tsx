'use client';
import { useRouter } from 'next/navigation';
import { startTransition } from 'react';
import '../../../src/features/StandardCards.styles';
export default function ErrorPage({ reset }: { reset: () => void }) {
  const router = useRouter();
  const retry = () => startTransition(() => { router.refresh(); reset(); });
  return <main className="constructed-cards constructed-cards__state" role="alert">
    <h1>Данные карты временно недоступны</h1>
    <p>Не удалось получить каталог. Попробуйте снова через несколько минут.</p>
    <div className="constructed-cards__state-actions"><button type="button" onClick={retry}>Повторить</button>
      <a href="/standard/cards/standard/">К библиотеке карт</a></div>
  </main>;
}
