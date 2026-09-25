export {
  AdminWorkspaceShell,
  type AdminWorkspaceNavigationItem,
  type AdminWorkspaceShellMessage,
  type AdminWorkspaceShellProps,
} from './ui/AdminWorkspaceShell';
/** Loads the private Wild catalog only for the Next page that renders it. */
export function loadWildArchetypesPage() {
  return import('./ui/WildArchetypesPage');
}

let adminWorkspaceShellPromise:
  | Promise<typeof import('./AdminWorkspaceShell.lazy')>
  | undefined;

/** Keeps the workspace shell and its stylesheet in the existing lazy chunk. */
export function loadAdminWorkspaceShell() {
  adminWorkspaceShellPromise ??= import('./AdminWorkspaceShell.lazy');
  return adminWorkspaceShellPromise;
}
