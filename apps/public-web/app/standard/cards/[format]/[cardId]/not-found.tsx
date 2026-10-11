import { SectionBanner } from '@/src/shared/ui/EditorialRouteChrome';
import Link from 'next/link';

export default function CardNotFound() {
  return <main><SectionBanner title="Карта не найдена" /><p>Проверьте адрес или вернитесь в библиотеку.</p>
    <Link href="/standard/cards/standard/">К библиотеке карт</Link></main>;
}
