import { useEffect, useRef, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ARENA_TABS, COMMUNITY_TABS, modeOfTab, type TabId } from '../routing/navigationRoutes';
import '../../parchment-theme.css';
import { PublicNavigation } from './PublicNavigation';
import type { NavigationBadges } from './NavigationItems';
import { useModePanels } from './useModePanels';
import { COMPACT_NAVIGATION_ATTRIBUTE } from './navigationPreference';
import { useNavigationTooltip } from './useNavigationFeedback';

type StoryArgs = {
  activeTab: TabId;
  mobileMenuOpen: boolean;
  compact?: boolean;
  badges?: NavigationBadges;
};

function PublicNavigationPreview({
  activeTab: initialActiveTab,
  mobileMenuOpen: initialMobileMenuOpen,
  compact: initialCompact = false,
  badges = {},
}: StoryArgs) {
  const [activeTab, setActiveTab] = useState(initialActiveTab);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(initialMobileMenuOpen);
  const [compact, setCompact] = useState(initialCompact);
  // The rail is driven by the document attribute, as in the Next layout.
  useEffect(() => {
    document.documentElement.toggleAttribute(COMPACT_NAVIGATION_ATTRIBUTE, compact);
    return () => document.documentElement.removeAttribute(COMPACT_NAVIGATION_ATTRIBUTE);
  }, [compact]);
  useNavigationTooltip(compact);
  useModePanels();
  const mobileMenuRef = useRef<HTMLElement>(null);
  const mobileMenuToggleRef = useRef<HTMLButtonElement>(null);

  return (
    <PublicNavigation
      activeTab={activeTab}
      mobileMenuOpen={mobileMenuOpen}
      mode={modeOfTab(activeTab) ?? 'standard'}
      compact={compact}
      badges={badges}
      onToggleCompact={() => setCompact(value => !value)}
      visibleArenaTabs={ARENA_TABS}
      visibleCommunityTabs={COMMUNITY_TABS}
      appIsContestAdmin={false}
      wantsLogin={false}
      updatedAtLabel="14 сентября 2026, 12:00"
      mobileMenuRef={mobileMenuRef}
      mobileMenuToggleRef={mobileMenuToggleRef}
      mobileProfile={<><span aria-hidden="true">◈</span><span>Войти</span></>}
      sidebarProfile={<span className="arena-sidebar-profile-content">Профиль HearthPulse</span>}
      profileLabel="Войти в профиль"
      onNavigate={setActiveTab}
      onNavigateLogin={() => setActiveTab('home')}
      onToggleMobileMenu={() => {
        setMobileMenuOpen(open => !open);
      }}
      onCloseMobileMenu={() => {
        setMobileMenuOpen(false);
      }}
    />
  );
}

const meta = {
  title: 'App shell/Public navigation',
  component: PublicNavigationPreview,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'tavern', values: [{ name: 'tavern', value: '#5d0d13' }] },
  },
} satisfies Meta<typeof PublicNavigationPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DesktopCurrentPage: Story = {
  args: {
    activeTab: 'standard-meta',
    mobileMenuOpen: false,
  },
};

export const MobileDrawer: Story = {
  args: {
    activeTab: 'bg-heroes',
    mobileMenuOpen: true,
  },
};

export const BattlegroundsMode: Story = {
  args: {
    activeTab: 'bg-strategies',
    mobileMenuOpen: false,
  },
};

const patchBadge: NavigationBadges = { 'patch-notes': { label: 'Новый', title: 'Новый патч 37.0.0' } };

export const NewPatchBadge: Story = {
  args: {
    activeTab: 'standard-meta',
    mobileMenuOpen: false,
    badges: patchBadge,
  },
};

export const CompactRail: Story = {
  args: {
    activeTab: 'tierlist',
    mobileMenuOpen: false,
    compact: true,
    badges: patchBadge,
  },
  play: async ({ canvasElement }) => {
    const sidebar = within(canvasElement.querySelector('.arena-sidebar') as HTMLElement);
    const tierList = canvasElement.querySelector<HTMLAnchorElement>('.arena-sidebar a[href="/tierlist/"]');
    if (!tierList) throw new Error('Arena tier-list link is missing');
    await expect(sidebar.getByRole('link', { name: 'Тир-лист', current: 'page' })).toBe(tierList);
    await userEvent.hover(tierList);
    const tooltip = canvasElement.querySelector('.arena-nav-tooltip');
    await waitFor(() => expect(tooltip).toHaveTextContent('Тир-лист · Арена'));
    await userEvent.click(sidebar.getByRole('button', { name: 'Развернуть меню' }));
    await expect(sidebar.getByRole('button', { name: 'Свернуть меню' })).toHaveAttribute('aria-pressed', 'false');
  },
};

export const ModePanel: Story = {
  args: {
    activeTab: 'gallery',
    mobileMenuOpen: false,
  },
  play: async ({ canvasElement }) => {
    const sidebar = within(canvasElement.querySelector('.arena-sidebar') as HTMLElement);
    const button = sidebar.getByText('Режим', { selector: '.hp-mode-kicker' }).closest('summary') as HTMLElement;
    await userEvent.click(button);
    const panel = canvasElement.querySelector('.arena-sidebar details.hp-mode') as HTMLDetailsElement;
    await expect(panel.open).toBe(true);
    await expect(canvasElement.querySelectorAll('.arena-sidebar [data-mode-card]')).toHaveLength(4);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(panel.open).toBe(false));
  },
};
