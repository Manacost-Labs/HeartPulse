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
  message: AdminMessage | null;
};

export type AdminWorkspaceAction =
  | { type: 'navigate'; section: AdminWorkspaceSection }
  | { type: 'setMessage'; message: AdminMessage | null };

export function createAdminWorkspaceState(section: AdminWorkspaceSection): AdminWorkspaceState {
  return {
    section,
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
      && !state.message
    ) return state;
    return createAdminWorkspaceState(action.section);
  }
  if (action.message === state.message) return state;
  return { ...state, message: action.message };
}
