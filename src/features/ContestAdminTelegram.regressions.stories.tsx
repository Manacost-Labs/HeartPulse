import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ContestAdminTelegram, type TelegramAdminAccount } from './ContestAdminTelegram';
import { AdminConsoleShell } from './adminConsole/AdminConsoleShell';
import { ADMIN_NAV_ITEMS } from './adminConsole/adminNavigation';
import './contests.css';
import '../modules/adminWorkspace/public.css';

// Synthetic rows reproduce long content and failed membership checks without exposing users.
const member: TelegramAdminAccount = {
  id: 'qa-member', profileId: 'profile_with_a_long_identifier_0123456789', name: 'Участник с длинным именем',
  email: 'telegram_account_with_a_long_identifier_1234567890@example.test', role: 'user', blockedAt: '',
  telegramId: '1234567890', telegramOidcId: 'qa-oidc', telegramUsername: 'long_telegram_username_for_qa', contactTelegram: '', photoUrl: '',
  hasTelegramIdentity: true, hasContactOnly: false, canBeChecked: true, hasAccess: true, telegramHasAccess: true,
  accessState: 'access', source: 'telegram', message: '', checkedAt: '2026-10-29T08:30:00.000Z', updatedAt: '', stale: false,
  entitlements: { arena: true, standard: true }, boostyHasAccess: false, createdAt: '', userUpdatedAt: '',
  chats: [{ chatId: '-100000000001', status: 'member', isMember: true }, { chatId: '-100000000002', ok: false, error: 'Bad Request: chat not found' }],
};
const accounts: TelegramAdminAccount[] = [
  member,
  { ...member, id: 'qa-error', name: 'Проверка с ошибкой', telegramHasAccess: false, accessState: 'checkable', boostyHasAccess: true, source: 'boosty', chats: [
    { chatId: '-100000000001', ok: false, error: 'Bad Request: member not found' },
    { chatId: '-100000000002', ok: false, error: 'Bad Request: PARTICIPANT_ID_INVALID' },
  ] },
  { ...member, id: 'qa-left', name: 'Вышел из групп', telegramHasAccess: false, hasAccess: false, accessState: 'checkable', entitlements: {}, chats: [
    { chatId: '-100000000001', ok: true, status: 'left' }, { chatId: '-100000000002', ok: true, status: 'kicked' },
  ] },
];

const meta = {
  title: 'Admin/Telegram regressions', component: ContestAdminTelegram,
  parameters: { layout: 'fullscreen', fullPage: true },
  decorators: [Story => (
    <AdminConsoleShell navigation={ADMIN_NAV_ITEMS} activeSection="telegram" accessLabel="Полный доступ"
      userLabel="QA Administrator" message={null} onNavigate={fn()} onDismissMessage={fn()}>
      <Story />
    </AdminConsoleShell>
  )],
  args: {
    payload: { configured: true, chatIds: ['-100000000001', '-100000000002'], accounts,
      summary: { total: 3, access: 1, checkable: 3, contactOnly: 0, stale: 0, blocked: 0 }, fetchedAt: '2026-10-29T08:30:00.000Z' },
    loading: false, onReload: fn(), formatDate: () => '29.10.2026, 11:30',
    entitlementLabels: row => row.hasAccess ? ['Арена', 'Поля Сражений', 'Стандарт', 'Конкурсы', 'Архив гайдов', 'Статьи Арены', 'Статьи Полей'] : [],
  },
} satisfies Meta<typeof ContestAdminTelegram>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LongRowsAndFailedChecks: Story = {
  play: async ({ canvas, canvasElement, args }) => {
    const cells = [...canvasElement.querySelectorAll<HTMLElement>('.admin-telegram-row td')];
    await expect(cells.length).toBe(12);
    for (const cell of cells) await expect(cell.scrollWidth, `Cell ${cell.dataset.label ?? 'Человек'} must not overlap its neighbour`).toBeLessThanOrEqual(cell.clientWidth + 1);
    const failedRow = canvas.getByRole('button', { name: 'Проверка с ошибкой' }).closest('tr');
    if (!failedRow) throw new Error('Failed membership fixture must render a table row');
    await expect(within(failedRow).getByText('Проверка не удалась')).toBeVisible();
    await expect(within(failedRow).queryByText('Нет в VIP-группах')).not.toBeInTheDocument();
    await expect(within(failedRow).getByText('Есть доступ к сайту')).toBeVisible();
    await userEvent.click(within(failedRow).getAllByText('Подробности')[1]);
    await expect(within(failedRow).getByText('Bad Request: PARTICIPANT_ID_INVALID')).toBeVisible();
    for (const cell of cells) await expect(cell.scrollWidth, 'Expanded diagnostics must stay inside the cell').toBeLessThanOrEqual(cell.clientWidth + 1);
    const search = canvas.getByRole('searchbox', { name: 'Поиск по Telegram-аккаунтам' });
    await userEvent.type(search, 'Вышел из групп');
    await expect(canvasElement.querySelectorAll('.admin-telegram-row').length).toBe(1);
    await expect(canvas.getByText('Нет в VIP-группах')).toBeVisible();
    await userEvent.clear(search);
    await expect(canvasElement.querySelectorAll('.admin-telegram-row').length).toBe(3);
    await userEvent.click(canvas.getByRole('button', { name: 'Обновить' }));
    await expect(args.onReload).toHaveBeenCalledOnce();
  },
};
