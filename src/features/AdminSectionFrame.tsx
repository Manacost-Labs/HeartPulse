import { Activity, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { LogIn, RefreshCw } from 'lucide-react';
import { canManageContests, fetchCurrentAuthUser } from '../modules/identity/public';
import { ACCESS_REJECTED_EVENT } from '../shared/http/fetchWithDeadline';
import { RecoverableSurfaceBoundary } from './recovery/RecoverableSurface';
import './recovery/RecoverableSurface.css';
import '../shared/ui/LoadingSurface.css';
import './adminSessionNotice.css';

/**
 * Watches for refused admin requests. A 401 or 403 alone may be a missing permission, so the
 * session is re-checked; only when the person is no longer signed in as a manager does the
 * panel say so. Unsaved input stays on the page while they sign in again in another tab.
 */
function useAdminSessionWatch() {
  const [lost, setLost] = useState(false);
  const checking = useRef<AbortController | null>(null);
  const check = useCallback(() => {
    if (checking.current) return;
    const controller = new AbortController();
    checking.current = controller;
    void fetchCurrentAuthUser(controller.signal)
      .then(user => setLost(!(user && canManageContests(user))))
      .catch(() => { /* an unreachable server is reported by the request that failed */ })
      .finally(() => { checking.current = null; });
  }, []);
  useEffect(() => {
    window.addEventListener(ACCESS_REJECTED_EVENT, check);
    return () => {
      window.removeEventListener(ACCESS_REJECTED_EVENT, check);
      checking.current?.abort();
    };
  }, [check]);
  return { lost, recheck: check };
}

function AdminSessionNotice({ onRecheck }: { onRecheck: () => void }) {
  return (
    <div className="admin-session-notice" role="alert">
      <div>
        <strong>Нет доступа к админке</strong>
        <span>Вы вышли из аккаунта или права администратора сняты, поэтому изменения сейчас не сохраняются. Войдите снова в новой вкладке — введённые здесь данные останутся — и нажмите «Проверить вход».</span>
      </div>
      <div className="admin-session-notice__actions">
        <a href="/?login" target="_blank" rel="noopener"><LogIn size={16} aria-hidden="true" /> Войти</a>
        <button type="button" onClick={onRecheck}><RefreshCw size={16} aria-hidden="true" /> Проверить вход</button>
      </div>
    </div>
  );
}

/**
 * The admin sections. The first visit mounts a section; afterwards it stays mounted behind
 * React's Activity while another section is shown, so its drafts, filters and loaded rows are
 * there on return without a render or a request. A hidden section's effects
 * (polling, listeners) are stopped and start again when it is shown. Each section has its own
 * error boundary: a section that fails to load or render shows its error while the menu and the
 * other sections keep working.
 */
export function AdminSectionFrame<Section extends string>({ section, renderSection }: {
  section: Section;
  renderSection: (section: Section) => ReactNode;
}) {
  const session = useAdminSessionWatch();
  const [visited, setVisited] = useState<Section[]>([section]);
  if (!visited.includes(section)) setVisited([...visited, section]);
  return (
    <>
      {session.lost && <AdminSessionNotice onRecheck={session.recheck} />}
      {visited.map(id => (
        <Activity key={id} mode={id === section ? 'visible' : 'hidden'}>
          <RecoverableSurfaceBoundary
            scope={`admin:${id}`}
            title="Раздел не открылся"
            message="Остальные разделы работают: выберите другой в меню или нажмите «Повторить»."
          >
            {renderSection(id)}
          </RecoverableSurfaceBoundary>
        </Activity>
      ))}
    </>
  );
}
