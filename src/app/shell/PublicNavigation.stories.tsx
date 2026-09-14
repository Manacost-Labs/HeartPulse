import { useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ARENA_TABS, MISC_TABS, type TabId } from '../../routes';
import '../../parchment-theme.css';
import { PublicNavigation } from './PublicNavigation';

type StoryArgs = {
  activeTab: TabId;
  mobileMenuOpen: boolean;
  mobileNavGroup: 'constructors' | 'misc' | null;
  sidebarNavGroup: 'constructors' | 'misc' | null;
};

function PublicNavigationPreview({
  activeTab: initialActiveTab,
  mobileMenuOpen: initialMobileMenuOpen,
  mobileNavGroup: initialMobileNavGroup,
  sidebarNavGroup: initialSidebarNavGroup,
}: StoryArgs) {
  const [activeTab, setActiveTab] = useState(initialActiveTab);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(initialMobileMenuOpen);
  const [mobileNavGroup, setMobileNavGroup] = useState(initialMobileNavGroup);
  const [sidebarNavGroup, setSidebarNavGroup] = useState(initialSidebarNavGroup);
  const mobileMenuRef = useRef<HTMLElement>(null);
  const mobileMenuToggleRef = useRef<HTMLButtonElement>(null);

  return (
    <PublicNavigation
      activeTab={activeTab}
      mobileMenuOpen={mobileMenuOpen}
      mobileNavGroup={mobileNavGroup}
      sidebarNavGroup={sidebarNavGroup}
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
      onWarm={() => {}}
      onToggleMobileMenu={() => {
        setMobileMenuOpen(open => !open);
        setMobileNavGroup(null);
      }}
      onCloseMobileMenu={() => {
        setMobileMenuOpen(false);
        setMobileNavGroup(null);
      }}
      onToggleMobileNavGroup={group => setMobileNavGroup(current => current === group ? null : group)}
      onToggleSidebarNavGroup={group => setSidebarNavGroup(current => current === group ? null : group)}
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
