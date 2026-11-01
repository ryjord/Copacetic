// Libs
import {
  type Certificate,
  type ClearDataOptions,
  type Cookie,
  type Cookies,
  type DownloadItem,
  type Extensions,
  type ServiceWorkerMain,
  type ServiceWorkers,
  type Session,
  session,
} from 'electron';

// Types
import type { EngineWebRequest } from './requests';

export type SessionClearOptions = ClearDataOptions;
export type EngineCookie = Cookie;
export type EngineCertificate = Certificate;

export type EngineCookies = Pick<Cookies, 'get' | 'remove'>;
export type EngineExtensions = Pick<Extensions, 'getExtension' | 'loadExtension' | 'removeExtension'>;
export type EngineServiceWorker = Pick<ServiceWorkerMain, 'ipc' | 'isDestroyed' | 'scope' | 'send'>;

export interface EngineServiceWorkers extends Pick<ServiceWorkers, 'on' | 'startWorkerForScope'> {
  getWorkerFromVersionID(versionId: number): EngineServiceWorker | undefined;
}

export type EngineDownload = Pick<
  DownloadItem,
  | 'canResume'
  | 'cancel'
  | 'getFilename'
  | 'getReceivedBytes'
  | 'getSavePath'
  | 'getTotalBytes'
  | 'getURL'
  | 'getURLChain'
  | 'isPaused'
  | 'on'
  | 'once'
  | 'pause'
  | 'resume'
  | 'setSaveDialogOptions'
  | 'setSavePath'
>;

type SessionMember =
  | 'addWordToSpellCheckerDictionary'
  | 'availableSpellCheckerLanguages'
  | 'clearCache'
  | 'clearData'
  | 'clearStorageData'
  | 'downloadURL'
  | 'fetch'
  | 'getSpellCheckerLanguages'
  | 'getUserAgent'
  | 'isPersistent'
  | 'on'
  | 'registerPreloadScript'
  | 'setBluetoothPairingHandler'
  | 'setCertificateVerifyProc'
  | 'setDevicePermissionHandler'
  | 'setDisplayMediaRequestHandler'
  | 'setPermissionCheckHandler'
  | 'setPermissionRequestHandler'
  | 'setSpellCheckerEnabled'
  | 'setSpellCheckerLanguages'
  | 'setUserAgent';

/** Everything Copacetic does with a browsing session, its storage, permissions and requests; a port implements this and no more. */
export interface EngineSession extends Pick<Session, SessionMember> {
  readonly cookies: EngineCookies;
  readonly extensions: EngineExtensions;
  readonly serviceWorkers: EngineServiceWorkers;
  readonly webRequest: EngineWebRequest;
}

/** The session for a partition: `persist:` keeps it on disk, anything else in memory. */
export function sessionFor(partition: string): EngineSession {
  return session.fromPartition(partition);
}

/** The session the chrome itself runs in. */
export function defaultSession(): EngineSession {
  return session.defaultSession;
}
