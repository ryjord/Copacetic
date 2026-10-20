/**
 * The parts of Chrome's extension API that Electron leaves undefined, filled
 * in from Copacetic's main process.
 *
 * This function is serialised and run in the extension's own world, so it can
 * close over nothing: everything it needs is on the bridge the preload exposed
 * under BRIDGE_KEY, and that name is repeated inside it on purpose.
 *
 * Only what is missing is defined. Where Electron implements something, such
 * as `tabs.sendMessage` or `scripting`, its own version is left alone.
 */
export function installChromePolyfill(): void {
  interface Bridge {
    invoke(method: string, args: unknown[]): Promise<unknown>;
    onEvent(listener: (name: string, args: unknown[]) => void): void;
  }
  const bridge = Reflect.get(globalThis, '__copaceticExtensions') as Bridge | undefined;
  if (!bridge) {
    return;
  }

  const listeners = new Map<string, Set<(...args: unknown[]) => unknown>>();
  bridge.onEvent((name, args) => {
    listeners.get(name)?.forEach((listener) => {
      try {
        listener(...args);
      } catch (error) {
        console.error(error);
      }
    });
  });

  const event = (name: string) => ({
    addListener: (listener: (...args: unknown[]) => unknown) => {
      const set = listeners.get(name) ?? new Set();
      set.add(listener);
      listeners.set(name, set);
      void bridge.invoke('events.listen', [name]);
    },
    removeListener: (listener: (...args: unknown[]) => unknown) => listeners.get(name)?.delete(listener),
    hasListener: (listener: (...args: unknown[]) => unknown) => listeners.get(name)?.has(listener) ?? false,
    hasListeners: () => (listeners.get(name)?.size ?? 0) > 0,
  });

  // Promise or callback, as the caller prefers: older extensions pass a function last.
  const method =
    (name: string) =>
    (...args: unknown[]) => {
      const last = args.at(-1);
      const callback = typeof last === 'function' ? (last as (result: unknown) => void) : null;
      const sent = callback ? args.slice(0, -1) : args;
      const answer = bridge.invoke(
        name,
        sent.map((arg) => (arg === undefined ? null : arg)),
      );
      if (callback) {
        void answer.then(callback, () => callback(undefined));
        return undefined;
      }
      return answer;
    };

  // Electron has its own versions of these, which know nothing of Copacetic's tabs or toolbar, so ours replace them.
  const REPLACED = new Set(['tabs', 'windows', 'action']);

  const SURFACE: Record<string, { methods: string[]; events: string[]; constants?: Record<string, unknown> }> = {
    tabs: {
      methods: [
        'query',
        'get',
        'getCurrent',
        'create',
        'update',
        'remove',
        'reload',
        'duplicate',
        'highlight',
        'move',
        'discard',
        'getZoom',
        'setZoom',
        'goBack',
        'goForward',
        'group',
        'ungroup',
      ],
      events: [
        'onCreated',
        'onUpdated',
        'onActivated',
        'onRemoved',
        'onReplaced',
        'onHighlighted',
        'onMoved',
        'onAttached',
        'onDetached',
        'onZoomChange',
      ],
      constants: { TAB_ID_NONE: -1 },
    },
    windows: {
      methods: ['get', 'getAll', 'getCurrent', 'getLastFocused', 'create', 'update', 'remove'],
      events: ['onCreated', 'onRemoved', 'onFocusChanged', 'onBoundsChanged'],
      constants: { WINDOW_ID_NONE: -1, WINDOW_ID_CURRENT: -2 },
    },
    webNavigation: {
      methods: ['getFrame', 'getAllFrames'],
      events: [
        'onBeforeNavigate',
        'onCommitted',
        'onDOMContentLoaded',
        'onCompleted',
        'onErrorOccurred',
        'onCreatedNavigationTarget',
        'onHistoryStateUpdated',
        'onReferenceFragmentUpdated',
        'onTabReplaced',
      ],
    },
    contextMenus: {
      methods: ['create', 'update', 'remove', 'removeAll'],
      events: ['onClicked'],
      constants: { ACTION_MENU_TOP_LEVEL_LIMIT: 6 },
    },
    action: {
      methods: [
        'setTitle',
        'getTitle',
        'setIcon',
        'setBadgeText',
        'getBadgeText',
        'setBadgeBackgroundColor',
        'getBadgeBackgroundColor',
        'setBadgeTextColor',
        'getBadgeTextColor',
        'setPopup',
        'getPopup',
        'enable',
        'disable',
        'isEnabled',
        'getUserSettings',
        'openPopup',
      ],
      events: ['onClicked', 'onUserSettingsChanged'],
    },
    permissions: {
      methods: ['contains', 'getAll', 'request', 'remove'],
      events: ['onAdded', 'onRemoved'],
    },
    commands: { methods: ['getAll'], events: ['onCommand'] },
    notifications: {
      methods: ['create', 'update', 'clear', 'getAll', 'getPermissionLevel'],
      events: ['onClicked', 'onClosed', 'onButtonClicked', 'onPermissionLevelChanged', 'onShowSettings'],
    },
    idle: { methods: ['queryState', 'setDetectionInterval', 'getAutoLockDelay'], events: ['onStateChanged'] },
    sidePanel: { methods: ['setOptions', 'getOptions', 'setPanelBehavior', 'getPanelBehavior', 'open'], events: [] },
    userScripts: { methods: ['register', 'unregister', 'getScripts', 'update', 'configureWorld'], events: [] },
  };

  const roots = [Reflect.get(globalThis, 'chrome'), Reflect.get(globalThis, 'browser')].filter(
    (root, index, all): root is Record<string, unknown> =>
      typeof root === 'object' && root !== null && all.indexOf(root) === index,
  );
  roots.forEach((root) => {
    Object.entries(SURFACE).forEach(([namespace, surface]) => {
      const existing = root[namespace];
      const target = (typeof existing === 'object' && existing !== null ? existing : {}) as Record<string, unknown>;
      // Defined rather than assigned, since a binding Electron made may refuse a plain assignment.
      const put = (member: string, value: unknown) => {
        try {
          Object.defineProperty(target, member, { value, configurable: true, writable: true, enumerable: true });
        } catch (error) {
          console.error(error);
        }
      };
      const isReplaced = REPLACED.has(namespace);
      surface.methods
        .filter((member) => isReplaced || target[member] === undefined)
        .forEach((member) => put(member, method(`${namespace}.${member}`)));
      surface.events
        .filter((member) => isReplaced || target[member] === undefined)
        .forEach((member) => put(member, event(`${namespace}.${member}`)));
      Object.entries(surface.constants ?? {})
        .filter(([member]) => target[member] === undefined)
        .forEach(([member, value]) => (target[member] = value));
      if (existing === undefined) {
        root[namespace] = target;
      }
    });

    // Electron defines `storage.sync` but refuses every call to it. Sync is kept on this machine, which is all there is.
    const storage = root.storage as Record<string, unknown> | undefined;
    if (storage && storage.local) {
      Object.defineProperty(storage, 'sync', { value: storage.local, configurable: true, writable: true });
    }
    if (storage && storage.managed === undefined) {
      storage.managed = {
        get: (_keys: unknown, callback?: (items: Record<string, never>) => void) => {
          callback?.({});
          return Promise.resolve({});
        },
        onChanged: event('storage.managed.onChanged'),
      };
    }
    const runtime = root.runtime as Record<string, unknown> | undefined;
    if (runtime && runtime.openOptionsPage === undefined) {
      runtime.openOptionsPage = method('runtime.openOptionsPage');
    }
  });
}
