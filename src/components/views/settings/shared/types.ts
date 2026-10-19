// Types
import type { AppInfo } from '@shared/types';

export interface SettingsPaneProps {
  info: AppInfo | null;
  /** Moves Settings to another pane, for a link that says "read more" somewhere else. */
  openPane: (id: string) => void;
}
