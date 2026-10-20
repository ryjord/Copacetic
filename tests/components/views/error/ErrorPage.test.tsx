// Libs
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// Components
import { ErrorPage } from '@/components/views/error/ErrorPage';

// Types
import type { PageError } from '@shared/types';

const send = vi.fn();
const navigated: string[] = [];
const reloaded: string[] = [];
const toggledSiteInfo = vi.fn();
vi.mock('@/lib/bridge/bridge', () => ({
  send: (call: (api: unknown) => unknown) => {
    send(call);
    call({
      tabs: {
        navigate: (_id: string, url: string) => navigated.push(url),
        reload: (id: string) => reloaded.push(id),
        continueOverHttp: () => {},
        acceptCertificate: () => {},
      },
      chrome: { toggleSiteInfo: toggledSiteInfo },
    });
  },
}));
vi.mock('@/store/useBrowserStore', () => ({
  useBrowserStore: (select: (state: unknown) => unknown) =>
    select({ settings: { searchEngine: 'duckduckgo', customSearchEngines: [] } }),
}));

afterEach(() => {
  cleanup();
  send.mockClear();
  navigated.length = 0;
  reloaded.length = 0;
});

const NOT_RESOLVED: PageError = {
  code: -105,
  name: 'ERR_NAME_NOT_RESOLVED',
  description: 'The address could not be found.',
  url: 'https://nowhere.example/',
};

const BAD_CERTIFICATE: PageError = {
  code: -202,
  name: 'ERR_CERT_AUTHORITY_INVALID',
  description: 'The certificate is not from an authority this computer trusts.',
  url: 'https://self-signed.example/',
  canAcceptCertificate: true,
};

describe('a page that did not load', () => {
  it('says so, and offers to try again', () => {
    render(<ErrorPage tabId="t1" error={NOT_RESOLVED} />);

    expect(screen.getByRole('heading', { name: 'This page did not load' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  // The symbolic code is for searching, not for reading first.
  it('keeps the error code behind Technical details', () => {
    render(<ErrorPage tabId="t1" error={NOT_RESOLVED} />);
    expect(screen.queryByText('ERR_NAME_NOT_RESOLVED')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Technical details' }));

    expect(screen.getByText('ERR_NAME_NOT_RESOLVED')).toBeTruthy();
    expect(screen.getByText('https://nowhere.example/')).toBeTruthy();
  });

  it('offers plain HTTP only when HTTPS was what failed, and says what that costs', () => {
    render(<ErrorPage tabId="t1" error={{ ...NOT_RESOLVED, plainUrl: 'http://nowhere.example/' }} />);

    expect(screen.getByText(/not encrypted/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue over HTTP' }));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not offer plain HTTP otherwise', () => {
    render(<ErrorPage tabId="t1" error={NOT_RESOLVED} />);
    expect(screen.queryByRole('button', { name: 'Continue over HTTP' })).toBeNull();
  });
});

describe('a certificate Copacetic refused', () => {
  // Reloading would only meet the same certificate again.
  it('does not offer to try again', () => {
    render(<ErrorPage tabId="t1" error={BAD_CERTIFICATE} />);
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('takes a deliberate step to continue past', () => {
    render(<ErrorPage tabId="t1" error={BAD_CERTIFICATE} />);
    expect(screen.queryByRole('button', { name: /Continue to/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Technical details' }));

    expect(screen.getByText(/until Copacetic closes/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue to self-signed.example' })).toBeTruthy();
  });

  it('offers no way past one that cannot be accepted', () => {
    render(<ErrorPage tabId="t1" error={{ ...BAD_CERTIFICATE, canAcceptCertificate: false }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Technical details' }));

    expect(screen.getByText(/will not open this site/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Continue to/ })).toBeNull();
  });
});

describe('a way forward that fits what went wrong', () => {
  // An address nobody could find is often words that were meant as a search.
  it('offers to search for an address that could not be found', () => {
    render(<ErrorPage tabId="t1" error={NOT_RESOLVED} />);
    fireEvent.click(screen.getByRole('button', { name: 'Search for “nowhere.example” instead' }));
    expect(navigated).toEqual(['https://duckduckgo.com/?q=nowhere.example']);
  });

  it('says to check the connection when offline, and tries again once it is back', () => {
    render(<ErrorPage tabId="t1" error={{ ...NOT_RESOLVED, name: 'ERR_INTERNET_DISCONNECTED', code: -106 }} />);
    expect(screen.getByText(/Check that Wi-Fi or a cable is connected/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Search for/ })).toBeNull();
    window.dispatchEvent(new Event('online'));
    expect(reloaded).toEqual(['t1']);
  });

  it('opens the connection details for a certificate', () => {
    render(<ErrorPage tabId="t1" error={BAD_CERTIFICATE} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connection details' }));
    expect(toggledSiteInfo).toHaveBeenCalledTimes(1);
  });
});
