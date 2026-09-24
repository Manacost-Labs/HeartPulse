'use client';

import { PublicPageShell } from '../../../../src/app/shell/PublicPageShell';
import { usePublicAccess } from '../../ui/usePublicAccess';

export default function ContestsError({ reset }: { error: Error; reset: () => void }) {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="contests" pathname="/contests/" access={access}
    navigate={path => window.location.assign(path)} editorial>
    <div role="alert" className="contest-empty">
      <h1>Конкурсы временно недоступны</h1>
      <p>Попробуйте загрузить раздел ещё раз.</p>
      <button type="button" onClick={reset}>Повторить</button>
    </div>
  </PublicPageShell>;
}
