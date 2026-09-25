import type { Metadata } from 'next';
import { UnknownPageClient } from '../ui/UnknownPageClient';
import '../../../src/features/NotFoundPage.css';

export const metadata: Metadata = {
  title: 'Страница не найдена | HearthPulse',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return <UnknownPageClient />;
}
