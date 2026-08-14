import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import {
  ChartNoAxesCombined,
  CircleDollarSign,
  Database,
  Gift,
  Image,
  KeyRound,
  LayoutDashboard,
  Link2,
  Mail,
  MessageCircle,
  Newspaper,
  Sparkles,
  Tags,
  Trophy,
  Users,
  WandSparkles,
} from 'lucide-react';
import {
  AdminWorkspaceShell,
  type AdminWorkspaceNavigationItem,
} from '../public';
import '../adminWorkspace.css';
import './AdminWorkspaceShell.stories.css';

type StorySection =
  | 'dashboard'
  | 'articles'
  | 'gallery'
  | 'translations'
  | 'mechanics'
  | 'standard-data'
  | 'fun-decks'
  | 'api-keys'
  | 'arena-synergies'
  | 'users'
  | 'mailing'
  | 'boosty'
  | 'analytics'
  | 'telegram'
  | 'contests'
  | 'referrals';

const navigation: ReadonlyArray<AdminWorkspaceNavigationItem<StorySection>> = [
  { id: 'dashboard', label: 'Обзор', caption: 'Состояние проекта и быстрые действия', status: 'Сводка проекта', group: 'Рабочий стол', icon: LayoutDashboard },
  { id: 'articles', label: 'Статьи', caption: 'Публикации, раздел и доступ', status: 'Сохранение по кнопке', group: 'Контент', icon: Newspaper },
  { id: 'gallery', label: 'Галерея', caption: 'Арты и оригиналы', status: 'Сохранение по кнопке', group: 'Контент', icon: Image },
  { id: 'translations', label: 'Переводы', caption: 'Названия архетипов', status: 'Ручные правки защищены', group: 'Контент', icon: WandSparkles },
  { id: 'mechanics', label: 'Механики и теги', caption: 'Переводы и покрытие', status: 'Сохранение по кнопке', group: 'Контент', icon: Tags },
  { id: 'standard-data', label: 'Данные и парсеры', caption: 'Автообновление и очереди', status: 'Центр управления данными', group: 'Система', icon: Database },
  { id: 'fun-decks', label: 'Фановые колоды', caption: 'Off-meta подборка', status: 'Обновляется автоматически', group: 'Система', icon: Sparkles },
  { id: 'api-keys', label: 'Public API', caption: 'Ключи приложений', status: 'Секрет показывается один раз', group: 'Система', icon: KeyRound },
  { id: 'arena-synergies', label: 'Сочетания в Арене', caption: 'Связки карт', status: 'Последние 500 забегов', group: 'Система', icon: Gift },
  { id: 'users', label: 'Пользователи', caption: 'Права и блокировки', status: 'Действия с подтверждением', group: 'Аудитория', icon: Users },
  { id: 'mailing', label: 'Рассылка', caption: 'Шаблоны и история', status: 'Безопасная очередь', group: 'Аудитория', icon: Mail },
  { id: 'boosty', label: 'Boosty', caption: 'Подписчики и доступ', status: 'Только для просмотра', group: 'Аудитория', icon: CircleDollarSign },
  { id: 'analytics', label: 'Аналитика', caption: 'Подписки и выручка', status: 'Наблюдаемые данные', group: 'Аудитория', icon: ChartNoAxesCombined },
  { id: 'telegram', label: 'Telegram', caption: 'Аккаунты и доступ', status: 'Только для просмотра', group: 'Аудитория', icon: MessageCircle },
  { id: 'contests', label: 'Конкурсы', caption: 'Заявки и победители', status: 'Сохранение по кнопке', group: 'Рост', icon: Trophy },
  { id: 'referrals', label: 'Реферальные ссылки', caption: 'Кампании и клики', status: 'Сохранение по кнопке', group: 'Рост', icon: Link2 },
];

function DashboardPreview() {
  return (
    <>
      <div className="admin-shell-story-stats">
        <div><span>Контент</span><strong>184</strong><small>статей · 42 арта</small></div>
        <div><span>Аудитория</span><strong>2 418</strong><small>активных пользователей</small></div>
        <div><span>Конкурсы</span><strong>6</strong><small>1 284 заявки</small></div>
        <div><span>Кампании</span><strong>23</strong><small>8 905 переходов</small></div>
      </div>
      <div className="admin-shell-story-grid">
        <section className="admin-shell-story-card">
          <h2>Быстрый доступ</h2>
          <div className="admin-shell-story-actions">
            <button type="button">Создать конкурс</button>
            <button type="button">Добавить статью</button>
            <button type="button">Загрузить арт</button>
            <button type="button">Создать рассылку</button>
          </div>
        </section>
        <section className="admin-shell-story-card">
          <h2>Состояние данных</h2>
          <p className="admin-shell-story-muted">Все основные источники отвечают. Последнее обновление — 4 минуты назад.</p>
        </section>
      </div>
    </>
  );
}

const meta = {
  title: 'Admin/Workspace Shell',
  component: AdminWorkspaceShell,
  args: {
    navigation,
    activeSection: 'dashboard',
    menuOpen: false,
    accessLabel: 'Полный доступ',
    userLabel: 'QA Administrator',
    userTitle: 'qa@example.com',
    message: null,
    onToggleMenu: fn(),
    onCloseMenu: fn(),
    onNavigate: fn(),
    onDismissMessage: fn(),
    children: <DashboardPreview />,
  },
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'light' },
  },
} satisfies Meta<typeof AdminWorkspaceShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FullAccess: Story = {
  play: async ({ canvas, args }) => {
    const overviewButton = canvas.queryByRole('button', { name: 'Обзор' });
    if (overviewButton) {
      await userEvent.click(overviewButton);
      await expect(args.onNavigate).toHaveBeenCalledWith('dashboard');
    } else {
      await expect(canvas.getByRole('heading', { name: 'Обзор' })).toBeVisible();
    }
  },
};

export const MobileDrawerOpen: Story = {
  args: { menuOpen: true },
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
  play: async ({ canvas, args }) => {
    const closeButtons = canvas.getAllByRole('button', { name: 'Закрыть меню' });
    await userEvent.click(closeButtons.at(-1)!);
    await expect(args.onCloseMenu).toHaveBeenCalledOnce();
  },
};

export const ContestOnly: Story = {
  args: {
    navigation: navigation.filter(item => item.id === 'contests'),
    activeSection: 'contests',
    accessLabel: 'Управление конкурсами',
    children: (
      <section className="admin-shell-story-card">
        <h2>Конкурсы</h2>
        <p className="admin-shell-story-muted">Доступны заявки, статусы и выбор победителей.</p>
      </section>
    ),
  },
  play: async ({ canvas, args }) => {
    const contestButton = canvas.queryByRole('button', { name: /Конкурсы/ });
    if (contestButton) {
      await userEvent.click(contestButton);
      await expect(args.onNavigate).toHaveBeenCalledWith('contests');
    } else {
      await expect(canvas.getByRole('heading', { name: 'Конкурсы' })).toBeVisible();
    }
  },
};

export const SuccessToast: Story = {
  args: { message: { type: 'ok', text: 'Изменения сохранены.' } },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Закрыть уведомление' }));
    await expect(args.onDismissMessage).toHaveBeenCalledOnce();
  },
};

export const ErrorToast: Story = {
  args: { message: { type: 'err', text: 'Не удалось сохранить изменения.' } },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Закрыть уведомление' }));
    await expect(args.onDismissMessage).toHaveBeenCalledOnce();
  },
};
