export type AdminMessage = { type: 'ok' | 'err'; text: string };

// Keep this media query aligned with the drawer breakpoint in adminWorkspace.css.
export const ADMIN_DRAWER_MEDIA_QUERY = '(max-width: 1023px)';

export type AdminWorkspaceSection =
  | 'dashboard'
  | 'users'
  | 'mailing'
  | 'telegram'
  | 'articles'
  | 'gallery'
  | 'translations'
  | 'mechanics'
  | 'standard-data'
  | 'fun-decks'
  | 'api-keys'
  | 'arena-synergies'
  | 'contests'
  | 'referrals'
  | 'boosty'
  | 'analytics';

export type AdminWorkspaceState = {
  section: AdminWorkspaceSection;
  adminMenuOpen: boolean;
  openUserMenuId: string;
  message: AdminMessage | null;
};

export type AdminWorkspaceAction =
  | { type: 'navigate'; section: AdminWorkspaceSection }
  | { type: 'toggleAdminMenu' }
  | { type: 'closeAdminMenu' }
  | { type: 'toggleUserMenu'; userId: string }
  | { type: 'closeUserMenu' }
  | { type: 'setMessage'; message: AdminMessage | null };

export function createAdminWorkspaceState(section: AdminWorkspaceSection): AdminWorkspaceState {
  return {
    section,
    adminMenuOpen: false,
    openUserMenuId: '',
    message: null,
  };
}

export function adminWorkspaceReducer(
  state: AdminWorkspaceState,
  action: AdminWorkspaceAction,
): AdminWorkspaceState {
  if (action.type === 'navigate') {
    if (
      state.section === action.section
      && !state.adminMenuOpen
      && !state.openUserMenuId
      && !state.message
    ) return state;
    return createAdminWorkspaceState(action.section);
  }
  if (action.type === 'toggleAdminMenu') {
    return { ...state, adminMenuOpen: !state.adminMenuOpen };
  }
  if (action.type === 'closeAdminMenu') {
    return state.adminMenuOpen ? { ...state, adminMenuOpen: false } : state;
  }
  if (action.type === 'toggleUserMenu') {
    const openUserMenuId = state.openUserMenuId === action.userId ? '' : action.userId;
    return openUserMenuId === state.openUserMenuId ? state : { ...state, openUserMenuId };
  }
  if (action.type === 'closeUserMenu') {
    return state.openUserMenuId ? { ...state, openUserMenuId: '' } : state;
  }
  if (action.message === state.message) return state;
  return { ...state, message: action.message };
}
