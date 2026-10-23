export type AdminMessage = { type: 'ok' | 'err'; text: string };

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
  | 'contests'
  | 'referrals'
  | 'boosty';

export type AdminWorkspaceState = {
  section: AdminWorkspaceSection;
  openUserMenuId: string;
  message: AdminMessage | null;
};

export type AdminWorkspaceAction =
  | { type: 'navigate'; section: AdminWorkspaceSection }
  | { type: 'toggleUserMenu'; userId: string }
  | { type: 'closeUserMenu' }
  | { type: 'setMessage'; message: AdminMessage | null };

export function createAdminWorkspaceState(section: AdminWorkspaceSection): AdminWorkspaceState {
  return {
    section,
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
      && !state.openUserMenuId
      && !state.message
    ) return state;
    return createAdminWorkspaceState(action.section);
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
