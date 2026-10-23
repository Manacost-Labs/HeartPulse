import type React from 'react';
import {
  CircleDollarSign,
  Database,
  Image as ImageIcon,
  Languages,
  LayoutDashboard,
  Link2,
  Mail,
  MessageCircle,
  Newspaper,
  ShieldCheck,
  Sparkles,
  Tags,
  Trophy,
  Users,
} from 'lucide-react';
import type { AdminWorkspaceSection } from '../adminWorkspaceState';

export type AdminNavigationItem = {
  id: AdminWorkspaceSection;
  label: string;
  /** One line under the page title and extra search words in the command palette. */
  caption: string;
  group: string;
  icon: React.ElementType;
  /** Other words people type for the section in the command palette (Cyrillic spellings, slang). */
  keywords?: readonly string[];
};

/** Every admin section in menu order; the group order is the order of first appearance. */
export const ADMIN_NAV_ITEMS: ReadonlyArray<AdminNavigationItem> = [
  { id: 'dashboard', label: 'Обзор', caption: 'Что требует внимания, показатели и события', group: 'Рабочий стол', icon: LayoutDashboard },
  { id: 'users', label: 'Пользователи', caption: 'Поиск людей, доступ, заметки и история', group: 'Люди и деньги', icon: Users, keywords: ['люди', 'юзеры', 'crm'] },
  { id: 'mailing', label: 'Рассылка', caption: 'Письма, шаблоны и история отправок', group: 'Люди и деньги', icon: Mail, keywords: ['email', 'почта', 'newsletter'] },
  { id: 'boosty', label: 'Boosty', caption: 'Подписчики и уровни доступа', group: 'Люди и деньги', icon: CircleDollarSign, keywords: ['бусти', 'буст', 'подписка'] },
  { id: 'telegram', label: 'Telegram', caption: 'Аккаунты и проверка доступа', group: 'Люди и деньги', icon: MessageCircle, keywords: ['телеграм', 'тг', 'vip'] },
  { id: 'articles', label: 'Статьи', caption: 'Публикации, раздел и доступ', group: 'Контент', icon: Newspaper },
  { id: 'gallery', label: 'Галерея', caption: 'Арты и оригиналы для скачивания', group: 'Контент', icon: ImageIcon },
  { id: 'translations', label: 'Переводы', caption: 'Названия архетипов и синхронизация BlizzCore', group: 'Контент', icon: Languages },
  { id: 'mechanics', label: 'Механики и теги', caption: 'Русские переводы, примеры карт и контроль покрытия', group: 'Контент', icon: Tags },
  { id: 'fun-decks', label: 'Фановые колоды', caption: 'Off-meta подборка и коды колод', group: 'Контент', icon: Sparkles, keywords: ['фан', 'колоды'] },
  { id: 'contests', label: 'Конкурсы', caption: 'Заявки, статусы и победители', group: 'Рост', icon: Trophy },
  { id: 'referrals', label: 'Реферальная ссылка', caption: 'Кампании: переходы, регистрации и доступ', group: 'Рост', icon: Link2 },
  { id: 'standard-data', label: 'Данные и парсеры', caption: 'Режим меты, автообновление и очереди', group: 'Система', icon: Database, keywords: ['парсер', 'hsreplay', 'кэш'] },
  { id: 'api-keys', label: 'Public API', caption: 'Ключи приложений и доступ к данным', group: 'Система', icon: ShieldCheck, keywords: ['апи', 'api', 'токен'] },
];

export const CONTEST_ADMIN_NAV_ITEMS = ADMIN_NAV_ITEMS.filter(item => item.id === 'contests');

const SECTION_IDS = new Set<string>(ADMIN_NAV_ITEMS.map(item => item.id));

export function isAdminSection(value: string): value is AdminWorkspaceSection {
  return SECTION_IDS.has(value);
}

/** The section named by the address bar (`?section=`, or the legacy `?contest`/`?section=list`). */
export function adminSectionFromSearch(search: string, defaultSection: AdminWorkspaceSection): AdminWorkspaceSection {
  const params = new URLSearchParams(search);
  const requested = params.get('section');
  if (requested === 'list') return 'articles';
  if (requested && isAdminSection(requested)) return requested;
  if (params.has('contest') || params.has('contests')) return 'contests';
  return defaultSection;
}
