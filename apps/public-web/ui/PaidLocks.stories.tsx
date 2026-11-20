import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentProps } from 'react';
import { useState, type ReactNode } from 'react';
import { expect, fn, userEvent } from 'storybook/test';
import { INITIAL_ACCESS_STATE } from './accessState';
import { PaidOfferProvider } from './PaidOffer';
import { PublicAccessContext, usePublicAccessStore } from './usePublicAccess';
import { PaidFilterLock, PaidMetricLock } from './PaidLocks';

const meta = {
  title: 'Access/PaidLocks',
  component: PaidMetricLock,
  args: { label: 'Винрейт против класса', onOpen: fn() },
} satisfies Meta<typeof PaidMetricLock>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A table cell: a lock with the figure's name, reachable by keyboard, opening the offer. */
export const Cell: Story = {
  play: async ({ canvas, args }) => {
    const lock = canvas.getByRole('button', { name: 'Винрейт против класса: по подписке. Узнать, как открыть' });
    await expect(lock).toHaveTextContent('По подписке');
    await userEvent.tab();
    await expect(lock).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await userEvent.click(lock);
    await expect(args.onOpen).toHaveBeenCalledTimes(2);
  },
};

export const Card: Story = { ...Cell, args: { variant: 'card', label: 'Игры' }, play: undefined };

export const Filter: StoryObj<ComponentProps<typeof PaidFilterLock> & { onRow: () => void }> = {
  render: args => <div onClick={args.onRow} role="presentation"><PaidFilterLock {...args} /></div>,
  args: { label: 'Мана', value: 'Любая мана', onOpen: fn(), onRow: fn() },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Мана (фильтр): по подписке. Узнать, как открыть' }));
    await expect(args.onOpen).toHaveBeenCalledTimes(1);
    await expect(args.onRow).not.toHaveBeenCalled();
  },
};

const guest = { state: INITIAL_ACCESS_STATE, user: null, checking: true, refresh: async () => undefined };

/** A guest of a page with the subscription offer: the access context the layout provides. */
function GuestPage({ children }: { children: ReactNode }) {
  const store = usePublicAccessStore(guest as unknown as Parameters<typeof usePublicAccessStore>[0]);
  return <PublicAccessContext.Provider value={store}>
    <PaidOfferProvider title="Платные показатели — по подписке" text="Откройте подписку.">{children}</PaidOfferProvider>
  </PublicAccessContext.Provider>;
}

/** The locks in a clickable row (a matchup or meta row that navigates): a press on a lock must not reach the row. */
function ClickableRow({ opener }: { opener: boolean }) {
  const [rowClicks, setRowClicks] = useState(0);
  const [opened, setOpened] = useState(0);
  const onOpen = opener ? () => setOpened(count => count + 1) : undefined;
  return <GuestPage>
    <div role="presentation" onClick={() => setRowClicks(count => count + 1)} style={{ padding: 8 }}>
      <span>Строка таблицы</span>
      <PaidMetricLock label="Винрейт" onOpen={onOpen} />
      <PaidMetricLock label="Игры" variant="card" onOpen={onOpen} />
      <PaidFilterLock label="Мана" value="Любая мана" onOpen={onOpen} />
    </div>
    <output>Строка нажата: {rowClicks}; колбэк: {opened}</output>
  </GuestPage>;
}

/** Without `onOpen` a lock opens the provider's offer. */
export const InClickableRow: StoryObj = { render: () => <ClickableRow opener={false} /> };
/** With `onOpen` the callback runs instead. */
export const InClickableRowWithOnOpen: StoryObj = { render: () => <ClickableRow opener /> };
