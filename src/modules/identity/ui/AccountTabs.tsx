import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ACCOUNT_TABS, accountTabFromHash, type AccountTab } from '../model/accountTabs';
import './AccountTabs.css';

/**
 * The account's four tabs. Every panel stays mounted and only the inactive
 * ones are `hidden`: an unsaved contact form survives a look at the plan, and
 * the sections keep loading exactly as they did on the single page.
 *
 * The open tab lives in the address hash (`#subscription`), so it survives a
 * reload and can be linked. An old section anchor (`#account-access`) opens
 * its tab and then scrolls to the section, which the browser cannot do itself
 * while the section is hidden.
 */
export default function AccountTabs({ panels }: { panels: Record<AccountTab, ReactNode> }) {
  const [active, setActive] = useState<AccountTab>('personal');
  const tabRefs = useRef<Partial<Record<AccountTab, HTMLButtonElement | null>>>({});

  useEffect(() => {
    const follow = () => {
      const tab = accountTabFromHash(window.location.hash);
      if (!tab) return;
      setActive(tab);
      const section = window.location.hash.slice(1);
      if (section.startsWith('account-')) {
        window.requestAnimationFrame(() => document.getElementById(section)?.scrollIntoView({ block: 'start' }));
      }
    };
    follow();
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);

  const select = useCallback((tab: AccountTab, focus = false) => {
    setActive(tab);
    // replaceState: switching tabs is not a navigation the Back button should undo.
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#${tab}`);
    if (focus) tabRefs.current[tab]?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = ACCOUNT_TABS.findIndex(tab => tab.id === active);
    const last = ACCOUNT_TABS.length - 1;
    const next = event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
        : event.key === 'Home' ? 0
          : event.key === 'End' ? last
            : -1;
    if (next < 0) return;
    event.preventDefault();
    select(ACCOUNT_TABS[next].id, true);
  };

  return (
    <div className="account-tabs">
      <div className="account-tabs__list" role="tablist" aria-label="Разделы личного кабинета" data-tour-id="profile-tabs" onKeyDown={onKeyDown}>
        {ACCOUNT_TABS.map(tab => (
          <button
            key={tab.id}
            ref={element => { tabRefs.current[tab.id] = element; }}
            type="button"
            role="tab"
            id={`account-tab-${tab.id}`}
            className="account-tabs__tab"
            aria-selected={active === tab.id}
            aria-controls={`account-panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => select(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {ACCOUNT_TABS.map(tab => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`account-panel-${tab.id}`}
          className="account-tabs__panel"
          aria-labelledby={`account-tab-${tab.id}`}
          hidden={active !== tab.id}
        >
          {panels[tab.id]}
        </div>
      ))}
    </div>
  );
}
