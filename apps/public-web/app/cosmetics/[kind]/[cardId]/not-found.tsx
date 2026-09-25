import Link from 'next/link';

export default function CosmeticsNotFound() {
  return <main><h1>Косметика не найдена</h1>
    <p>Запрошенный объект косметики Hearthstone не найден.</p>
    <Link href="/cosmetics/">Вернуться в каталог</Link>
  </main>;
}
