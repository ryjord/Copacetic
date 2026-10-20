// Utils
import { provideChromeApi } from './bridge';

const location: unknown = Reflect.get(globalThis, 'location');

// Given only to the popups and pages Copacetic opens for an extension; tabs have no preload.
provideChromeApi(typeof location === 'object' && location !== null ? Reflect.get(location, 'protocol') : null);
