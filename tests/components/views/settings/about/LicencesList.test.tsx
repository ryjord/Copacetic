import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LicencesList, readLicenceFile } from '@/components/views/settings/about/LicencesList';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FILE = {
  own: 'MIT License',
  notice: 'Copacetic - third-party notices',
  packages: [
    { name: 'react', version: '19.0.0', licence: 'MIT', text: 'MIT License, Meta' },
    { name: 'client-only', version: '0.0.1', licence: 'MIT', text: '' },
  ],
};

describe('the licences list', () => {
  it('lists every package with its version and licence', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(FILE)));
    render(<LicencesList />);
    expect(await screen.findByText('Open-source packages (2)')).toBeTruthy();
    expect(screen.getByText('react')).toBeTruthy();
    expect(screen.getByText('19.0.0 · MIT')).toBeTruthy();
    expect(screen.getByText('This package ships no licence file; it declares itself MIT.')).toBeTruthy();
  });

  it('says so when this copy was built without the list', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }));
    render(<LicencesList />);
    expect(await screen.findByText(/this copy does not have it/)).toBeTruthy();
  });
});

describe('readLicenceFile', () => {
  it('refuses a file of the wrong shape', () => {
    expect(readLicenceFile({ packages: 'many' })).toBeNull();
    expect(readLicenceFile(null)).toBeNull();
  });

  it('drops entries with no name', () => {
    expect(readLicenceFile({ ...FILE, packages: [{ version: '1' }, ...FILE.packages] })?.packages).toHaveLength(2);
  });
});
