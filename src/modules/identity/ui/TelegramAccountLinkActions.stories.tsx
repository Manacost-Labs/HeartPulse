import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import './AccountDashboard.css';
import {
  TelegramAccountLinkActionsView,
  type TelegramAccountLinkActionsViewProps,
} from './TelegramAccountLinkActions';

// The actions as the account page shows them: inside the Telegram row of «Вход и привязки».
const render = (args: TelegramAccountLinkActionsViewProps) => (
  <div className="account-dashboard">
    <ul className="account-links__list">
      <li className="account-links__row">
        <span className="account-brand account-brand--telegram" aria-hidden="true">T</span>
        <span className="account-links__text"><strong>Telegram</strong><small>Не привязан</small></span>
        <div className="account-links__telegram"><TelegramAccountLinkActionsView {...args} /></div>
      </li>
    </ul>
  </div>
);

const meta = {
  title: 'Identity/Telegram Account Link Actions',
  component: TelegramAccountLinkActionsView,
  parameters: { layout: 'padded' },
  render,
  args: {
    mode: 'oidc',
    botUsername: 'manacost_auth_bot',
    action: null,
    code: '',
    expiresAt: '',
    onOidcLink: fn(),
    onBotCodeRequest: fn(),
  },
} satisfies Meta<typeof TelegramAccountLinkActionsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OidcAndBotReady: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Привязать Telegram' }));
    await expect(args.onOidcLink).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole('button', { name: 'ID-код для бота' }));
    await expect(args.onBotCodeRequest).toHaveBeenCalledOnce();
  },
};

export const BotCodeIssued: Story = {
  args: {
    mode: 'legacy-widget',
    code: 'TG-v9Qx2Wm4Lp7Ks8Nc3Hd6Rf1Z',
    expiresAt: '2026-08-17T22:45:00.000Z',
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('TG-v9Qx2Wm4Lp7Ks8Nc3Hd6Rf1Z')).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Открыть @manacost_auth_bot' })).toBeVisible();
  },
};

export const CreatingBotCode: Story = {
  args: {
    mode: 'legacy-widget',
    action: 'bot',
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Создаем...' })).toBeDisabled();
  },
};

export const OpeningOidc: Story = {
  args: {
    action: 'oidc',
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Открываем...' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'ID-код для бота' })).toBeDisabled();
  },
};

export const AlreadyLinked: Story = {
  render: () => (
    <div className="account-dashboard">
      <ul className="account-links__list">
        <li className="account-links__row">
          <span className="account-brand account-brand--telegram" aria-hidden="true">T</span>
          <span className="account-links__text"><strong>Telegram</strong><small>Привязан</small></span>
        </li>
      </ul>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button', { name: 'Привязать Telegram' })).not.toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: 'ID-код для бота' })).not.toBeInTheDocument();
  },
};
