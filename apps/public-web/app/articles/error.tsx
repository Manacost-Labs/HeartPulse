'use client';

import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { usePublicAccess } from '@/apps/public-web/ui/usePublicAccess';
import { navigate } from '@/apps/public-web/ui/navigation';

export default function ArticlesError({ reset }: { error: Error; reset: () => void }) {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="articles" pathname="/articles/" access={access}
    navigate={navigate} editorial>
    <div role="alert" className="articles-empty-modern text-center py-16">
      <h1 className="font-hs text-xl">Статьи временно недоступны</h1>
      <p>Попробуйте загрузить раздел ещё раз.</p>
      <button type="button" onClick={reset}>Повторить</button>
    </div>
  </PublicPageShell>;
}
