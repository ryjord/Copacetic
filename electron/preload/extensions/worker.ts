// Utils
import { contextBridge } from 'electron';
import { provideChromeApi } from './bridge';

// The preload's own context has no location; the worker's world does.
provideChromeApi(
  contextBridge.executeInMainWorld({
    func: () => {
      const location: unknown = Reflect.get(globalThis, 'location');
      return typeof location === 'object' && location !== null ? Reflect.get(location, 'protocol') : null;
    },
  }),
);
