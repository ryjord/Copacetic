// Utils
import { isRecord } from '../../data/persistence';

/** Chrome's declarativeNetRequest rules, read as untrusted: a rule Chrome would refuse is refused, never half-applied. */

export const RESOURCE_TYPES = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'webtransport',
  'webbundle',
  'other',
] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const REQUEST_METHODS = [
  'connect',
  'delete',
  'get',
  'head',
  'options',
  'patch',
  'post',
  'put',
  'other',
] as const;
export type RequestMethod = (typeof REQUEST_METHODS)[number];

export const ACTION_TYPES = [
  'block',
  'redirect',
  'allow',
  'upgradeScheme',
  'modifyHeaders',
  'allowAllRequests',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export type HeaderOperation = 'append' | 'set' | 'remove';

export interface HeaderChange {
  header: string;
  operation: HeaderOperation;
  value?: string;
}

export interface Redirect {
  url?: string;
  /** A path inside the extension, served as one of its own pages. */
  extensionPath?: string;
  /** Applied to the request's own URL, with \1 to \9 standing for what regexFilter captured. */
  regexSubstitution?: string;
  transform?: UrlTransform;
}

export interface QueryTransform {
  removeParams?: string[];
  addOrReplaceParams?: { key: string; value: string }[];
}

export interface UrlTransform {
  scheme?: string;
  host?: string;
  port?: string;
  path?: string;
  query?: string;
  queryTransform?: QueryTransform;
  fragment?: string;
  username?: string;
  password?: string;
}

export interface RuleAction {
  type: ActionType;
  redirect?: Redirect;
  requestHeaders?: HeaderChange[];
  responseHeaders?: HeaderChange[];
}

export interface RuleCondition {
  urlFilter?: string;
  regexFilter?: string;
  isUrlFilterCaseSensitive?: boolean;
  initiatorDomains?: string[];
  excludedInitiatorDomains?: string[];
  requestDomains?: string[];
  excludedRequestDomains?: string[];
  resourceTypes?: ResourceType[];
  excludedResourceTypes?: ResourceType[];
  requestMethods?: RequestMethod[];
  excludedRequestMethods?: RequestMethod[];
  domainType?: 'firstParty' | 'thirdParty';
  tabIds?: number[];
  excludedTabIds?: number[];
}

export interface Rule {
  id: number;
  priority: number;
  action: RuleAction;
  condition: RuleCondition;
}

export type RuleReading = { rule: Rule } | { problem: string };

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;

function listOf<Item extends string>(value: unknown, allowed: readonly Item[]): Item[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const items = value.filter((item): item is Item => allowed.some((candidate) => candidate === item));
  return items.length === value.length ? items : null;
}

function domainsOf(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  // Chrome takes them lowercase and without a scheme or port; anything else is a different rule than intended.
  const domains = value.filter(
    (item): item is string =>
      typeof item === 'string' && item !== '' && item === item.toLowerCase() && !/[/:*]/.test(item),
  );
  return domains.length === value.length ? domains : null;
}

function headerChangesOf(value: unknown): HeaderChange[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const changes = value.flatMap((item): HeaderChange[] => {
    if (!isRecord(item) || typeof item.header !== 'string' || item.header === '') {
      return [];
    }
    const { operation } = item;
    if (operation === 'remove') {
      return [{ header: item.header, operation }];
    }
    if ((operation === 'set' || operation === 'append') && typeof item.value === 'string') {
      return [{ header: item.header, operation, value: item.value }];
    }
    return [];
  });
  return changes.length === value.length ? changes : null;
}

function redirectOf(value: unknown): Redirect | null {
  if (!isRecord(value)) {
    return null;
  }
  const redirect: Redirect = {};
  if (typeof value.url === 'string') {
    redirect.url = value.url;
  }
  if (typeof value.extensionPath === 'string' && value.extensionPath.startsWith('/')) {
    redirect.extensionPath = value.extensionPath;
  }
  if (typeof value.regexSubstitution === 'string') {
    redirect.regexSubstitution = value.regexSubstitution;
  }
  if (isRecord(value.transform)) {
    const transform: UrlTransform = {};
    for (const key of ['scheme', 'host', 'port', 'path', 'query', 'fragment', 'username', 'password'] as const) {
      const part = value.transform[key];
      if (typeof part === 'string') {
        transform[key] = part;
      }
    }
    const { queryTransform } = value.transform;
    if (isRecord(queryTransform)) {
      transform.queryTransform = {
        removeParams: Array.isArray(queryTransform.removeParams)
          ? queryTransform.removeParams.filter((item): item is string => typeof item === 'string')
          : undefined,
        addOrReplaceParams: Array.isArray(queryTransform.addOrReplaceParams)
          ? queryTransform.addOrReplaceParams.flatMap((item) =>
              isRecord(item) && typeof item.key === 'string' && typeof item.value === 'string'
                ? [{ key: item.key, value: item.value }]
                : [],
            )
          : undefined,
      };
    }
    redirect.transform = transform;
  }
  const isSomewhere = Object.keys(redirect).length > 0;
  return isSomewhere ? redirect : null;
}

/** Reads one rule as Chrome would, or says why it cannot be used. */
export function readRule(value: unknown): RuleReading {
  if (!isRecord(value) || !isPositiveInteger(value.id)) {
    return { problem: 'Rule with a missing or non-positive id' };
  }
  const priority = value.priority === undefined ? 1 : value.priority;
  if (!isPositiveInteger(priority)) {
    return { problem: `Rule ${value.id} has a priority below 1` };
  }
  const rawAction = value.action;
  const type = isRecord(rawAction) ? ACTION_TYPES.find((candidate) => candidate === rawAction.type) : undefined;
  if (!isRecord(rawAction) || type === undefined) {
    return { problem: `Rule ${value.id} has no action Chrome knows` };
  }
  const action: RuleAction = { type };
  if (type === 'redirect') {
    const redirect = redirectOf(rawAction.redirect);
    if (!redirect) {
      return { problem: `Rule ${value.id} redirects nowhere` };
    }
    action.redirect = redirect;
  }
  if (type === 'modifyHeaders') {
    const requestHeaders =
      rawAction.requestHeaders === undefined ? undefined : headerChangesOf(rawAction.requestHeaders);
    const responseHeaders =
      rawAction.responseHeaders === undefined ? undefined : headerChangesOf(rawAction.responseHeaders);
    if (requestHeaders === null || responseHeaders === null || (!requestHeaders && !responseHeaders)) {
      return { problem: `Rule ${value.id} changes no header it can read` };
    }
    if (requestHeaders) {
      action.requestHeaders = requestHeaders;
    }
    if (responseHeaders) {
      action.responseHeaders = responseHeaders;
    }
  }

  const raw = isRecord(value.condition) ? value.condition : {};
  const condition: RuleCondition = {};
  if (typeof raw.urlFilter === 'string') {
    condition.urlFilter = raw.urlFilter;
  }
  if (typeof raw.regexFilter === 'string') {
    condition.regexFilter = raw.regexFilter;
  }
  if (condition.urlFilter !== undefined && condition.regexFilter !== undefined) {
    return { problem: `Rule ${value.id} has both a urlFilter and a regexFilter` };
  }
  if (raw.isUrlFilterCaseSensitive === true) {
    condition.isUrlFilterCaseSensitive = true;
  }
  for (const key of [
    'initiatorDomains',
    'excludedInitiatorDomains',
    'requestDomains',
    'excludedRequestDomains',
  ] as const) {
    if (raw[key] !== undefined) {
      const domains = domainsOf(raw[key]);
      if (!domains) {
        return { problem: `Rule ${value.id} has a ${key} Chrome would not accept` };
      }
      condition[key] = domains;
    }
  }
  for (const key of ['resourceTypes', 'excludedResourceTypes'] as const) {
    if (raw[key] !== undefined) {
      const types = listOf(raw[key], RESOURCE_TYPES);
      if (!types) {
        return { problem: `Rule ${value.id} names a resource type Chrome does not have` };
      }
      condition[key] = types;
    }
  }
  for (const key of ['requestMethods', 'excludedRequestMethods'] as const) {
    if (raw[key] !== undefined) {
      const methods = listOf(raw[key], REQUEST_METHODS);
      if (!methods) {
        return { problem: `Rule ${value.id} names a request method Chrome does not have` };
      }
      condition[key] = methods;
    }
  }
  if (raw.domainType === 'firstParty' || raw.domainType === 'thirdParty') {
    condition.domainType = raw.domainType;
  }
  for (const key of ['tabIds', 'excludedTabIds'] as const) {
    if (Array.isArray(raw[key])) {
      condition[key] = raw[key].filter((item): item is number => typeof item === 'number' && Number.isInteger(item));
    }
  }
  // Chrome refuses an allow-everything rule that is not about a page or a frame: it would mean nothing.
  if (
    type === 'allowAllRequests' &&
    !(
      condition.resourceTypes?.length &&
      condition.resourceTypes.every((resource) => resource === 'main_frame' || resource === 'sub_frame')
    )
  ) {
    return { problem: `Rule ${value.id} allows all requests without naming a page or frame` };
  }
  return { rule: { id: value.id, priority, action, condition } };
}
