import { useEffect, useRef, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ARENA_TABS, MISC_TABS, type TabId } from '../routing/navigationRoutes';
import '../../parchment-theme.css';
import { PublicNavigation } from './PublicNavigation';
import type { NavigationBadges, NavigationGroup } from './NavigationItems';
import { COMPACT_NAVIGATION_ATTRIBUTE } from './navigationPreference';
import { useNavigationTooltip } from './useNavigationFeedback';

type StoryArgs = {
  activeTab: TabId;
  mobileMenuOpen: boolean;
  mobileNavGroup: NavigationGroup | null;
  sidebarNavGroup: NavigationGroup | null;
  compact?: boolean;
  badges?: NavigationBadges;
};

const groupSet = (group: NavigationGroup | null): ReadonlySet<NavigationGroup> => new Set(group ? [group] : []);
const toggled = (groups: ReadonlySet<NavigationGroup>, group: NavigationGroup) => {
  const next = new Set(groups);
  if (!next.delete(group)) next.add(group);
  return next;
};

function PublicNavigationPreview({
  activeTab: initialActiveTab,
  mobileMenuOpen: initialMobileMenuOpen,
  mobileNavGroup: initialMobileNavGroup,
  sidebarNavGroup: initialSidebarNavGroup,
  compact: initialCompact = false,
  badges = {},
}: StoryArgs) {
  const [activeTab, setActiveTab] = useState(initialActiveTab);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(initialMobileMenuOpen);
  const [mobileNavGroups, setMobileNavGroups] = useState(() => groupSet(initialMobileNavGroup));
  const [sidebarNavGroups, setSidebarNavGroups] = useState(() => groupSet(initialSidebarNavGroup));
  const [compact, setCompact] = useState(initialCompact);
  // The rail is driven by the document attribute, as in the Next layout.
  useEffect(() => {
    document.documentElement.toggleAttribute(COMPACT_NAVIGATION_ATTRIBUTE, compact);
    return () => document.documentElement.removeAttribute(COMPACT_NAVIGATION_ATTRIBUTE);
  }, [compact]);
  useNavigationTooltip(compact);
  const mobileMenuRef = useRef<HTMLElement>(null);
  const mobileMenuToggleRef = useRef<HTMLButtonElement>(null);

  return (
    <PublicNavigation
      activeTab={activeTab}
      mobileMenuOpen={mobileMenuOpen}
      mobileNavGroups={mobileNavGroups}
      sidebarNavGroups={sidebarNavGroups}
      compact={compact}
      badges={badges}
      onToggleCompact={() => setCompact(value => !value)}
      visibleArenaTabs={ARENA_TABS}
      visibleMiscTabs={MISC_TABS}
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
      onToggleMobileNavGroup={group => setMobileNavGroups(current => toggled(current, group))}
      onToggleSidebarNavGroup={group => setSidebarNavGroups(current => toggled(current, group))}
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
    mobileNavGroup: null,
    sidebarNavGroup: 'misc',
  },
};

export const MobileDrawer: Story = {
  args: {
    activeTab: 'bg-heroes',
    mobileMenuOpen: true,
    mobileNavGroup: null,
    sidebarNavGroup: null,
  },
};

export const ExpandedConstructors: Story = {
  args: {
    activeTab: 'bg-strategies',
    mobileMenuOpen: false,
    mobileNavGroup: null,
    sidebarNavGroup: 'constructors',
  },
};

const patchBadge: NavigationBadges = { 'patch-notes': { label: 'Новый', title: 'Новый патч 37.0.0' } };

export const NewPatchBadge: Story = {
  args: {
    activeTab: 'standard-meta',
    mobileMenuOpen: false,
    mobileNavGroup: null,
    sidebarNavGroup: null,
    badges: patchBadge,
  },
};

export const CompactRail: Story = {
  args: {
    activeTab: 'tierlist',
    mobileMenuOpen: false,
    mobileNavGroup: null,
    sidebarNavGroup: null,
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

export const IndependentGroups: Story = {
  args: {
    activeTab: 'gallery',
    mobileMenuOpen: false,
    mobileNavGroup: null,
    sidebarNavGroup: 'misc',
  },
  play: async ({ canvasElement }) => {
    const sidebar = within(canvasElement.querySelector('.arena-sidebar') as HTMLElement);
    const misc = sidebar.getByRole('button', { name: /Разное/ });
    const before = misc.getBoundingClientRect().top;
    await userEvent.click(sidebar.getByRole('button', { name: /Конструкторы/ }));
    await expect(misc).toHaveAttribute('aria-expanded', 'true');
    // Opening a group pushes the groups below it once and never pulls a control back.
    await expect(misc.getBoundingClientRect().top).toBeGreaterThan(before);
  },
};
