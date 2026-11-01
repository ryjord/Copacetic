// Libs
import {
  type FileFilter,
  type MessageBoxOptions,
  type MessageBoxReturnValue,
  type OpenDialogOptions,
  type OpenDialogReturnValue,
  type SaveDialogOptions,
  type SaveDialogReturnValue,
  dialog as electronDialog,
} from 'electron';

// Utils
import { electronWindowOf } from './native';

// Types
import type { EngineWindow } from './windows';

export type DialogFileFilter = FileFilter;
export type MessageBoxChoice = MessageBoxOptions;
export type OpenDialogChoice = OpenDialogOptions;

/** The system's own dialogs, each sheeted to a window when there is one to attach to. */
export const dialog = {
  showErrorBox(title: string, content: string): void {
    electronDialog.showErrorBox(title, content);
  },
  showMessageBox(parent: EngineWindow | null, options: MessageBoxOptions): Promise<MessageBoxReturnValue> {
    return parent
      ? electronDialog.showMessageBox(electronWindowOf(parent), options)
      : electronDialog.showMessageBox(options);
  },
  showOpenDialog(parent: EngineWindow | null, options: OpenDialogOptions): Promise<OpenDialogReturnValue> {
    return parent
      ? electronDialog.showOpenDialog(electronWindowOf(parent), options)
      : electronDialog.showOpenDialog(options);
  },
  showSaveDialog(parent: EngineWindow | null, options: SaveDialogOptions): Promise<SaveDialogReturnValue> {
    return parent
      ? electronDialog.showSaveDialog(electronWindowOf(parent), options)
      : electronDialog.showSaveDialog(options);
  },
};
