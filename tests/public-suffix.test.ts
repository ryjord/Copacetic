import { describe, expect, it } from 'vitest';
import { registrableDomainOf } from '../electron/shared/url';

/**
 * The conformance suite published alongside the Public Suffix List itself,
 * converted from tests/test_psl.txt.
 *
 * Both sides are punycoded, because that is the only form the browser ever
 * works in: `new URL(...).hostname` encodes an internationalised host before
 * anything here sees it. The algorithm is unchanged either way.
 *
 * This is the address bar's anti-spoofing surface. Which part of a host is
 * rendered at full contrast comes straight out of this function, so being
 * wrong here means showing someone the wrong owner for the page they are on.
 */
const CASES: [string | null, string | null][] = [
  [null, null],
  ['com', null],
  ['example.com', 'example.com'],
  ['www.example.com', 'example.com'],
  ['.com', null],
  ['.example', null],
  ['.example.com', null],
  ['.example.example', null],
  ['example', null],
  ['example.example', 'example.example'],
  ['b.example.example', 'example.example'],
  ['a.b.example.example', 'example.example'],
  ['biz', null],
  ['domain.biz', 'domain.biz'],
  ['b.domain.biz', 'domain.biz'],
  ['a.b.domain.biz', 'domain.biz'],
  ['com', null],
  ['example.com', 'example.com'],
  ['b.example.com', 'example.com'],
  ['a.b.example.com', 'example.com'],
  ['uk.com', null],
  ['example.uk.com', 'example.uk.com'],
  ['b.example.uk.com', 'example.uk.com'],
  ['a.b.example.uk.com', 'example.uk.com'],
  ['test.ac', 'test.ac'],
  ['mm', null],
  ['c.mm', null],
  ['b.c.mm', 'b.c.mm'],
  ['a.b.c.mm', 'b.c.mm'],
  ['jp', null],
  ['test.jp', 'test.jp'],
  ['www.test.jp', 'test.jp'],
  ['ac.jp', null],
  ['test.ac.jp', 'test.ac.jp'],
  ['www.test.ac.jp', 'test.ac.jp'],
  ['kyoto.jp', null],
  ['test.kyoto.jp', 'test.kyoto.jp'],
  ['ide.kyoto.jp', null],
  ['b.ide.kyoto.jp', 'b.ide.kyoto.jp'],
  ['a.b.ide.kyoto.jp', 'b.ide.kyoto.jp'],
  ['c.kobe.jp', null],
  ['b.c.kobe.jp', 'b.c.kobe.jp'],
  ['a.b.c.kobe.jp', 'b.c.kobe.jp'],
  ['city.kobe.jp', 'city.kobe.jp'],
  ['www.city.kobe.jp', 'city.kobe.jp'],
  ['ck', null],
  ['test.ck', null],
  ['b.test.ck', 'b.test.ck'],
  ['a.b.test.ck', 'b.test.ck'],
  ['www.ck', 'www.ck'],
  ['www.www.ck', 'www.ck'],
  ['us', null],
  ['test.us', 'test.us'],
  ['www.test.us', 'test.us'],
  ['ak.us', null],
  ['test.ak.us', 'test.ak.us'],
  ['www.test.ak.us', 'test.ak.us'],
  ['k12.ak.us', null],
  ['test.k12.ak.us', 'test.k12.ak.us'],
  ['www.test.k12.ak.us', 'test.k12.ak.us'],
  ['xn--85x722f.com.cn', 'xn--85x722f.com.cn'],
  ['xn--85x722f.xn--55qx5d.cn', 'xn--85x722f.xn--55qx5d.cn'],
  ['www.xn--85x722f.xn--55qx5d.cn', 'xn--85x722f.xn--55qx5d.cn'],
  ['shishi.xn--55qx5d.cn', 'shishi.xn--55qx5d.cn'],
  ['xn--55qx5d.cn', null],
  ['xn--85x722f.xn--fiqs8s', 'xn--85x722f.xn--fiqs8s'],
  ['www.xn--85x722f.xn--fiqs8s', 'xn--85x722f.xn--fiqs8s'],
  ['shishi.xn--fiqs8s', 'shishi.xn--fiqs8s'],
  ['xn--fiqs8s', null],
  ['xn--85x722f.com.cn', 'xn--85x722f.com.cn'],
  ['xn--85x722f.xn--55qx5d.cn', 'xn--85x722f.xn--55qx5d.cn'],
  ['www.xn--85x722f.xn--55qx5d.cn', 'xn--85x722f.xn--55qx5d.cn'],
  ['shishi.xn--55qx5d.cn', 'shishi.xn--55qx5d.cn'],
  ['xn--55qx5d.cn', null],
  ['xn--85x722f.xn--fiqs8s', 'xn--85x722f.xn--fiqs8s'],
  ['www.xn--85x722f.xn--fiqs8s', 'xn--85x722f.xn--fiqs8s'],
  ['shishi.xn--fiqs8s', 'shishi.xn--fiqs8s'],
  ['xn--fiqs8s', null],
];

describe('registrableDomainOf, against the official Public Suffix List suite', () => {
  it.each(CASES)('%s -> %s', (host, expected) => {
    expect(registrableDomainOf(host ?? '')).toBe(expected);
  });
});
