import { PublicSupportPage } from '../../ui/PublicSupportPage';
export const metadata = {
  title: 'Условия использования | HearthPulse', description: 'Условия использования сайта и сервисов HearthPulse.',
  alternates: { canonical: 'https://hearthpulse.net/terms/' }, robots: { index: true, follow: true },
};
export default function Page() { return <PublicSupportPage page="terms" />; }
