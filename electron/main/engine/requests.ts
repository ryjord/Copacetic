// Libs
import {
  type CallbackResponse,
  type CustomScheme,
  type OnBeforeRequestListenerDetails,
  type WebRequest,
  net as electronNet,
  protocol as electronProtocol,
} from 'electron';

export type BeforeRequestDetails = OnBeforeRequestListenerDetails;
export type RequestVerdict = CallbackResponse;
export type PrivilegedScheme = CustomScheme;

/** The hooks every request in a session passes through: blocking, headers and the request log. */
export type EngineWebRequest = Pick<
  WebRequest,
  'onBeforeRequest' | 'onBeforeSendHeaders' | 'onCompleted' | 'onErrorOccurred' | 'onHeadersReceived'
>;

/** Copacetic's own scheme: registered before the app is ready, then served from its files. */
export const protocol = {
  registerPrivilegedSchemes: (schemes: PrivilegedScheme[]): void =>
    electronProtocol.registerSchemesAsPrivileged(schemes),
  handle: (scheme: string, handler: (request: Request) => Response | Promise<Response>): void =>
    electronProtocol.handle(scheme, handler),
};

/** Fetch through the engine's network stack, so the system proxy and certificates apply. */
export const net = {
  fetch: (input: string, init?: RequestInit): Promise<Response> => electronNet.fetch(input, init),
};
