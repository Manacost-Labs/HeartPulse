export const BOOSTY_VIP_CHANNEL_ID = '-1002311131780';

export type BoostyChannelMembership = {
  state: 'member' | 'absent' | 'unlinked' | 'unknown' | 'stale';
  label: string;
  tone: 'ok' | 'muted' | 'warn';
  checkedAt: string;
};

type TelegramSnapshot = {
  email: string;
  telegramId: string;
  checkedAt: string;
  stale: boolean;
  chats: Array<Record<string, unknown>>;
};

const labels: Record<BoostyChannelMembership['state'], Pick<BoostyChannelMembership, 'label' | 'tone'>> = {
  member: { label: 'В канале', tone: 'ok' },
  absent: { label: 'Нет в канале', tone: 'muted' },
  unlinked: { label: 'Telegram не привязан', tone: 'muted' },
  unknown: { label: 'Не удалось проверить', tone: 'warn' },
  stale: { label: 'Проверка устарела', tone: 'warn' },
};

function result(state: BoostyChannelMembership['state'], checkedAt = ''): BoostyChannelMembership {
  return { state, ...labels[state], checkedAt };
}

function channelMembership(account: TelegramSnapshot): BoostyChannelMembership {
  if (!/^[1-9]\d*$/.test(account.telegramId)) return result('unlinked');
  if (!Number.isFinite(Date.parse(account.checkedAt))) return result('unknown');
  if (account.stale) return result('stale', account.checkedAt);
  const chats = account.chats.filter(chat => String(chat.chatId) === BOOSTY_VIP_CHANNEL_ID);
  if (chats.length !== 1) return result('unknown', account.checkedAt);
  const chat = chats[0];
  if (chat.ok === false || chat.error) return result('unknown', account.checkedAt);
  if (['member', 'administrator', 'creator'].includes(String(chat.status))) return result('member', account.checkedAt);
  if (chat.status === 'left' || chat.status === 'kicked') return result('absent', account.checkedAt);
  const isMember = chat.isMember ?? chat.hasAccess;
  if (chat.status === 'restricted' && typeof isMember === 'boolean') return result(isMember ? 'member' : 'absent', account.checkedAt);
  return result('unknown', account.checkedAt);
}

/** Email matches are display-only; ambiguity, old checks and other chats never establish membership. */
export function boostyChannelMembershipIndex(accounts: readonly TelegramSnapshot[]): Map<string, BoostyChannelMembership> {
  const index = new Map<string, BoostyChannelMembership>();
  for (const account of accounts) {
    const email = account.email.trim().toLowerCase();
    if (!email) continue;
    index.set(email, index.has(email) ? result('unknown') : channelMembership(account));
  }
  return index;
}
