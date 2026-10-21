// Utils
import { PersistedFile, isRecord } from '../../data/persistence';
import { isExtensionId } from '../crx';

// Types
import type { KeptNetRules, NetRulesStore } from './extension-net-rules';

type KeptByExtension = Record<string, KeptNetRules>;

/** What each extension's rules kept between runs, read back as untrusted, beside the profile's list of extensions. */
export class NetRulesFile implements NetRulesStore {
  private readonly file: PersistedFile<KeptByExtension>;

  constructor(directory: string) {
    this.file = new PersistedFile('extension-rules.json', () => ({}), revive, { directory });
  }

  get(extensionId: string): KeptNetRules | null {
    return this.file.get()[extensionId] ?? null;
  }

  put(extensionId: string, kept: KeptNetRules): void {
    this.file.update((all) => ({ ...all, [extensionId]: kept }));
  }

  remove(extensionId: string): void {
    this.file.update((all) => Object.fromEntries(Object.entries(all).filter(([id]) => id !== extensionId)));
  }

  flush(): void {
    this.file.flush();
  }
}

function revive(raw: unknown): KeptByExtension | null {
  if (!isRecord(raw)) {
    return null;
  }
  return Object.fromEntries(
    Object.entries(raw).flatMap(([id, value]): [string, KeptNetRules][] => {
      if (!isExtensionId(id) || !isRecord(value)) {
        return [];
      }
      const enabled = Array.isArray(value.enabledRulesets)
        ? value.enabledRulesets.filter((item): item is string => typeof item === 'string')
        : null;
      return [
        [
          id,
          {
            // Each rule is read again on load, so only the list itself is checked here.
            dynamicRules: Array.isArray(value.dynamicRules) ? value.dynamicRules : [],
            enabledRulesets: enabled,
            disabledStaticRules: isRecord(value.disabledStaticRules)
              ? Object.fromEntries(
                  Object.entries(value.disabledStaticRules).map(([rulesetId, ruleIds]) => [
                    rulesetId,
                    Array.isArray(ruleIds)
                      ? ruleIds.filter((ruleId): ruleId is number => typeof ruleId === 'number')
                      : [],
                  ]),
                )
              : {},
            displaysActionCount: value.displaysActionCount === true,
          },
        ],
      ];
    }),
  );
}
