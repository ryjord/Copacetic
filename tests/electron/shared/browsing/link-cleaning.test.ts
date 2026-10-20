import { describe, expect, it } from 'vitest';

import { cleanUrl } from '../../../../electron/shared/browsing/link-cleaning';

describe('cleaning a link', () => {
  it('removes the parameters that only say where a click came from', () => {
    expect(cleanUrl('https://shop.example/item?id=7&utm_source=mail&utm_campaign=autumn&fbclid=abc')).toBe(
      'https://shop.example/item?id=7',
    );
  });

  it('keeps every parameter that changes the page', () => {
    expect(cleanUrl('https://search.example/?q=boots&page=2&sort=price')).toBeNull();
  });

  it('matches names whatever their case, and the numbered families by prefix', () => {
    expect(cleanUrl('https://a.example/?UTM_Medium=x&hsa_cam=1&pk_kwd=y&keep=1')).toBe('https://a.example/?keep=1');
  });

  it('keeps the fragment, and drops the question mark when nothing is left', () => {
    expect(cleanUrl('https://a.example/page?gclid=1#section')).toBe('https://a.example/page#section');
  });

  it('leaves anything that is not a web address alone', () => {
    expect(cleanUrl('mailto:a@b.example?utm_source=x')).toBeNull();
    expect(cleanUrl('not an address')).toBeNull();
  });
});
