import { PublicSupportPage } from '../../ui/PublicSupportPage';
export const metadata = {
  title: 'Частые вопросы | HearthPulse', description: 'Ответы на вопросы об авторизации, подписках и статистике HearthPulse.',
  alternates: { canonical: 'https://hearthpulse.net/faq/' }, robots: { index: true, follow: true },
};
export default function Page() { return <PublicSupportPage page="faq" />; }
