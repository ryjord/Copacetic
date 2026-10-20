'use client';

// Components
import { BrowserLook } from '@/components/views/settings/appearance/BrowserLook';
import { StartPageLook } from '@/components/views/settings/appearance/StartPageLook';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

/** Two things to make your own: the browser, then the start page. */
export function AppearancePane() {
  const settings = useBrowserStore((state) => state.settings);
  return (
    <>
      <BrowserLook settings={settings} />
      <StartPageLook settings={settings} />
    </>
  );
}
