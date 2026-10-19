import { about } from './about';
import { main } from './main';
import { settings } from './settings';
import { shell } from './shell';
import { views } from './views';

/** Every word Copacetic shows, in English: the first language, and the shape every other one follows. */
export const en = { about, main, settings, shell, views } as const;
