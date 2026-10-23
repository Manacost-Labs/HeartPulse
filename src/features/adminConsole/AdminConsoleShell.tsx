import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { ThemeScope } from '../../vendor/valyro-ui/theme/ThemeScope';
import { AppShell, type AppShellLabels, type AppShellState } from '../../vendor/valyro-ui/layout/AppShell';
import { Sidebar, type SidebarSection } from '../../vendor/valyro-ui/navigation/Sidebar';
import {
  CommandPalette,
  useCommandPaletteHotkey,
  type CommandPaletteItem,
} from '../../vendor/valyro-ui/navigation/CommandPalette';
import { IconButton } from '../../vendor/valyro-ui/basic/IconButton';
import '../../vendor/valyro-ui/styles/index.css';
import '../../vendor/valyro-ui/styles/themes/manacost.css';
import '../../modules/adminWorkspace/public.css';
import './AdminConsoleShell.css';
import type { AdminMessage, AdminWorkspaceSection } from '../adminWorkspaceState';
import type { AdminNavigationItem } from './adminNavigation';
import { ConsoleToast, ConsoleTopBar } from './AdminConsoleChrome';

const SHELL_LABELS: AppShellLabels = {
  skipToContent: 'Перейти к содержимому',
  navigation: 'Разделы админ панели',
  aside: 'Подробности',
  expandSidebar: 'Развернуть меню',
  collapseSidebar: 'Свернуть меню',
  openNavigation: 'Открыть меню',
};

const PALETTE_LABELS = { results: 'Разделы', navigate: 'Выбрать', run: 'Открыть', close: 'Закрыть', escapeKey: 'esc' };
const COLLAPSED_KEY = 'hp-admin-sidebar-collapsed';

function readCollapsed(): boolean {
  try { return window.localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
}

function storeCollapsed(collapsed: boolean) {
  try { window.localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0'); } catch { /* private mode: the rail is not remembered */ }
}

type Navigation = ReadonlyArray<AdminNavigationItem>;

function sidebarSections(navigation: Navigation): SidebarSection[] {
  const groups: SidebarSection[] = [];
  for (const item of navigation) {
    const entry = { id: item.id, label: item.label, icon: <item.icon size={18} strokeWidth={1.8} aria-hidden="true" /> };
    const previous = groups.at(-1);
    if (previous?.label === item.group) previous.items.push(entry);
    else groups.push({ label: item.group, items: [entry] });
  }
  return groups;
}

function paletteCommands(navigation: Navigation, onNavigate: (section: AdminWorkspaceSection) => void): CommandPaletteItem[] {
  return [
    ...navigation.map(item => ({
      id: item.id,
      label: item.label,
      group: item.group,
      icon: <item.icon size={16} aria-hidden="true" />,
      keywords: [...item.caption.split(/[\s,]+/), ...(item.keywords ?? [])],
      onSelect: () => onNavigate(item.id),
    })),
    {
      id: 'public-site',
      label: 'Открыть публичный сайт',
      group: 'Переходы',
      icon: <ExternalLink size={16} aria-hidden="true" />,
      onSelect: () => window.open('/', '_blank', 'noopener'),
    },
  ];
}

type ConsoleSidebarProps = {
  shell: AppShellState;
  navigation: Navigation;
  activeSection: AdminWorkspaceSection;
  accessLabel: string;
  onNavigate: (section: AdminWorkspaceSection) => void;
  onIntent?: (section: AdminWorkspaceSection) => void;
};

function ConsoleSidebar({ shell, navigation, activeSection, accessLabel, onNavigate, onIntent }: ConsoleSidebarProps) {
  const sections = useMemo(() => sidebarSections(navigation), [navigation]);
  // The Valyro sidebar has no per-item hover callback; one delegated listener maps a row back to its section.
  const announceIntent = (target: EventTarget) => {
    if (!onIntent || !(target instanceof Element)) return;
    const row = target.closest('.ui-sidebar__item');
    const label = row?.getAttribute('aria-label') ?? row?.textContent?.trim();
    const item = label ? navigation.find(entry => entry.label === label) : undefined;
    if (item && item.id !== activeSection) onIntent(item.id);
  };
  return (
    <Sidebar
      label="Разделы админ панели"
      sections={sections}
      value={activeSection}
      collapsed={shell.sidebarCollapsed}
      onPointerOver={event => announceIntent(event.target)}
      onFocus={event => announceIntent(event.target)}
      onValueChange={id => {
        onNavigate(id as AdminWorkspaceSection);
        if (shell.mobile) shell.setSidebarOpen(false);
      }}
      header={(
        <div className="admin-console-brand">
          <span className="admin-console-brand__mark" aria-hidden="true" />
          {!shell.sidebarCollapsed && <span className="admin-console-brand__name"><strong>HearthPulse</strong><small>{accessLabel}</small></span>}
          {shell.mobile && (
            <IconButton
              className="admin-console-brand__close"
              variant="ghost"
              size="sm"
              icon={<X size={18} />}
              label="Закрыть меню"
              aria-expanded="true"
              onClick={() => shell.setSidebarOpen(false)}
            />
          )}
        </div>
      )}
      footer={(
        <a className="admin-console-site-link" href="/" target="_blank" rel="noreferrer" title="Открыть публичный сайт">
          <ExternalLink size={18} aria-hidden="true" />
          {!shell.sidebarCollapsed && <span>Открыть сайт</span>}
        </a>
      )}
    />
  );
}

const MAIN_ID = 'main-content';

/**
 * Each section keeps its own scroll position in the shared scrolling main area: returning to a
 * section lands where the operator left it, a section opened for the first time starts at the top.
 */
function useSectionScrollMemory(section: string) {
  const positions = useRef(new Map<string, number>());
  const current = useRef(section);
  useEffect(() => {
    const main = document.getElementById(MAIN_ID);
    if (!main) return undefined;
    const remember = () => positions.current.set(current.current, main.scrollTop);
    main.addEventListener('scroll', remember, { passive: true });
    return () => main.removeEventListener('scroll', remember);
  }, []);
  useLayoutEffect(() => {
    if (current.current === section) return;
    current.current = section;
    const main = document.getElementById(MAIN_ID);
    if (main) main.scrollTop = positions.current.get(section) ?? 0;
  }, [section]);
}

export type AdminConsoleShellProps = {
  navigation: Navigation;
  activeSection: AdminWorkspaceSection;
  accessLabel: string;
  userLabel: string;
  userTitle?: string;
  message: AdminMessage | null;
  onNavigate: (section: AdminWorkspaceSection) => void;
  /** The pointer or keyboard focus reached a menu item: a chance to fetch that section ahead of the click. */
  onIntent?: (section: AdminWorkspaceSection) => void;
  onDismissMessage: () => void;
  children: ReactNode;
};

/**
 * The admin console frame on Valyro: a grouped sidebar that folds into an icon rail (a drawer on
 * narrow screens), a top bar with the section path and the Ctrl+K section search, and the page
 * title. Sections render inside the scrolling main area; the frame never remounts between them.
 */
export function AdminConsoleShell({
  navigation,
  activeSection,
  accessLabel,
  userLabel,
  userTitle,
  message,
  onNavigate,
  onIntent,
  onDismissMessage,
  children,
}: AdminConsoleShellProps) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [paletteOpen, setPaletteOpen] = useState(false);
  useCommandPaletteHotkey(setPaletteOpen);
  const active = navigation.find(item => item.id === activeSection) ?? navigation[0];
  const commands = useMemo(() => paletteCommands(navigation, onNavigate), [navigation, onNavigate]);
  useSectionScrollMemory(activeSection);

  return (
    <ThemeScope theme="manacost" mode="light" className="admin-console">
      <AppShell
        mainId={MAIN_ID}
        labels={SHELL_LABELS}
        mobileBreakpoint={960}
        sidebarCollapsed={collapsed}
        onSidebarCollapsedChange={next => { setCollapsed(next); storeCollapsed(next); }}
        sidebar={shell => (
          <ConsoleSidebar
            shell={shell}
            navigation={navigation}
            activeSection={activeSection}
            accessLabel={accessLabel}
            onNavigate={onNavigate}
            onIntent={onIntent}
          />
        )}
        header={<ConsoleTopBar active={active} userLabel={userLabel} userTitle={userTitle} onSearch={() => setPaletteOpen(true)} />}
      >
        <div
          className="admin-workspace-content contest-admin-page admin-workspace-page admin-tailadmin-shell"
          id={`admin-section-${activeSection}`}
          role="region"
          aria-labelledby="admin-section-title"
        >
          <header className="admin-console-page-head">
            <h1 id="admin-section-title">{active?.label ?? 'Админка'}</h1>
            {active && <p>{active.caption}</p>}
          </header>
          {children}
        </div>
      </AppShell>

      <CommandPalette
        commands={commands}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        placeholder="Раздел или действие…"
        labels={PALETTE_LABELS}
        renderEmpty={query => `Ничего не найдено по запросу «${query}»`}
      />

      {message && <ConsoleToast message={message} onDismiss={onDismissMessage} />}
    </ThemeScope>
  );
}
