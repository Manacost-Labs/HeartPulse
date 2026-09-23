import { PublicSupportPage } from '../../ui/PublicSupportPage';
export const metadata = {
  title: 'Политика конфиденциальности | HearthPulse', description: 'Обработка персональных данных и настройки приватности HearthPulse.',
  alternates: { canonical: 'https://hearthpulse.net/privacy/' }, robots: { index: true, follow: true },
};
export default function Page() { return <PublicSupportPage page="privacy" />; }
