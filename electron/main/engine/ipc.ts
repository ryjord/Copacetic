// Libs
import { type IpcMainInvokeEvent, ipcMain } from 'electron';

// Types
import type { EngineFrame, EnginePage } from './views';

/** Who asked: the page, and the frame within it, that sent an IPC call. */
export interface IpcCaller {
  readonly sender: EnginePage;
  readonly senderFrame: EngineFrame | null;
}

/** Answers calls from the chrome on one channel; the handler's result goes back as the reply. */
export function handleIpc(channel: string, handler: (caller: IpcCaller, ...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => handler(event, ...args));
}

export function removeIpcHandler(channel: string): void {
  ipcMain.removeHandler(channel);
}
