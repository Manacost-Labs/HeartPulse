import type { ElementType, ReactNode, Ref } from 'react';

export type AdminWorkspaceNavigationItem<Section extends string = string> = {
  id: Section;
  label: string;
  caption: string;
  status: string;
  group: string;
  icon: ElementType;
};

export type AdminWorkspaceShellMessage = {
  type: 'ok' | 'err';
  text: string;
};

export type AdminWorkspaceShellProps<Section extends string = string> = {
  navigation: ReadonlyArray<AdminWorkspaceNavigationItem<Section>>;
  activeSection: Section;
  menuOpen: boolean;
  accessLabel: string;
  userLabel: string;
  userTitle?: string;
  message: AdminWorkspaceShellMessage | null;
  menuButtonRef?: Ref<HTMLButtonElement>;
  navigationRef?: Ref<HTMLElement>;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onNavigate: (section: Section) => void;
  onDismissMessage: () => void;
  children: ReactNode;
};
