// Libs
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// Components
import { ErrorPage } from '@/components/views/error/ErrorPage';

// Types
import type { PageError } from '@shared/types';

const send = vi.fn();
vi.mock('@/lib/bridge/bridge', () => ({
  send: (call: unknown) => send(call),
}));

afterEach(() => {
  cleanup();
  send.mockClear();
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
