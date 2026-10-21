/** Calls from an extension's worker or page into the main process, scoped to that worker or page. */
export const EXTENSION_CHANNEL = 'copacetic:extension';
/** Events the main process sends to an extension's worker or page. */
export const EXTENSION_EVENT_CHANNEL = 'copacetic:extension-event';
/** Marks the answer to a call Chrome would reject, so the extension's promise rejects with its message. */
export const CALL_REFUSED = '__copaceticCallRefused';
