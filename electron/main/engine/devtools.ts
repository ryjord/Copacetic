// Libs
import type { Debugger } from 'electron';

/** The DevTools protocol connection to a page, as Copacetic drives it. */
export type EngineDebugger = Pick<Debugger, 'attach' | 'detach' | 'isAttached' | 'on' | 'sendCommand'>;
