import { SectionBanner } from '@/src/shared/ui/EditorialRouteChrome';
import Link from 'next/link';

export default function CosmeticsNotFound() {
  return <main><SectionBanner title="Косметика не найдена" />
    <p>Запрошенный объект косметики Hearthstone не найден.</p>
    <Link href="/cosmetics/">Вернуться в каталог</Link>
  </main>;
}
