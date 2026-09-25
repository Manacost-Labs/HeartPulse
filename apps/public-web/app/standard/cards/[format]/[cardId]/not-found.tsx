import Link from 'next/link';

export default function CardNotFound() {
  return <main><h1>Карта не найдена</h1><p>Проверьте адрес или вернитесь в библиотеку.</p>
    <Link href="/standard/cards/standard/">К библиотеке карт</Link></main>;
}
