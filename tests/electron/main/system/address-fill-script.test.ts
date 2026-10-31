// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addressFillScriptFor } from '../../../../electron/main/system/address-fill-script';
import { EMPTY_ADDRESS, type AddressFields } from '../../../../electron/shared/passwords/addresses';

const RILEY: AddressFields = {
  ...EMPTY_ADDRESS,
  name: 'Riley Jordan',
  organisation: 'Copacetic',
  street: '1 High Street\nFlat 2',
  city: 'Bournemouth',
  postcode: 'BH1 1AA',
  country: 'United Kingdom',
  phone: '01202 000000',
  email: 'riley@example.com',
};

// jsdom lays nothing out, and the script fills only what is on screen.
beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 120, 24));
});

const fill = (html: string, fields: AddressFields = RILEY) => {
  document.body.innerHTML = html;
  // The page's own world is the one it runs in, so it is run here as the page would run it.
  const result: { filled: number } = (0, eval)(addressFillScriptFor(fields, null));
  const valueOf = (selector: string) => document.querySelector<HTMLInputElement>(selector)?.value;
  return { filled: result.filled, valueOf };
};

describe('filling a saved address into a form', () => {
  it('fills each field by its autocomplete name', () => {
    const { filled, valueOf } = fill(`<form>
      <input autocomplete="name" id="name"><input autocomplete="organization" id="org">
      <input autocomplete="address-line1" id="line1"><input autocomplete="address-line2" id="line2">
      <input autocomplete="address-level2" id="city"><input autocomplete="postal-code" id="postcode">
      <input autocomplete="tel" id="tel"><input autocomplete="email" id="email"></form>`);
    expect(filled).toBe(8);
    expect([valueOf('#name'), valueOf('#line1'), valueOf('#line2'), valueOf('#postcode')]).toEqual([
      'Riley Jordan',
      '1 High Street',
      'Flat 2',
      'BH1 1AA',
    ]);
  });

  it('falls back to the names forms usually give their fields', () => {
    const { valueOf } = fill(`<form><input name="first_name" id="first"><input name="last_name" id="last">
      <input name="zip" id="zip"><input name="town" id="town"></form>`);
    expect([valueOf('#first'), valueOf('#last'), valueOf('#zip'), valueOf('#town')]).toEqual([
      'Riley',
      'Jordan',
      'BH1 1AA',
      'Bournemouth',
    ]);
  });

  it('chooses the country from a list by its name', () => {
    const { valueOf } = fill(`<form><select autocomplete="country" id="country">
      <option value="">Choose</option><option value="GB">United Kingdom</option><option value="FR">France</option>
    </select></form>`);
    expect(valueOf('#country')).toBe('GB');
  });

  // Something already typed is the person's, and a password box is never an address.
  it('leaves filled fields, password boxes and hidden fields alone', () => {
    const { filled, valueOf } = fill(`<form><input name="email" id="typed" value="mine@example.com">
      <input type="password" name="email" id="secret"><input type="hidden" name="email" id="hidden"></form>`);
    expect(filled).toBe(0);
    expect([valueOf('#typed'), valueOf('#secret'), valueOf('#hidden')]).toEqual(['mine@example.com', '', '']);
  });

  it('tells the page each value changed, as typing would', () => {
    document.body.innerHTML = '<form><input autocomplete="email" id="email"></form>';
    const heard: string[] = [];
    document.querySelector('#email')?.addEventListener('input', () => heard.push('input'));
    document.querySelector('#email')?.addEventListener('change', () => heard.push('change'));
    (0, eval)(addressFillScriptFor(RILEY, null));
    expect(heard).toEqual(['input', 'change']);
  });

  // Serialised as data, so nothing in an address can become code in the page.
  it('treats an address full of quotes and script as text', () => {
    const hostile = { ...RILEY, name: '"); globalThis.hacked = true; ("', street: '`${globalThis.hacked = true}`' };
    const { valueOf } = fill('<form><input autocomplete="name" id="name"></form>', hostile);
    expect(valueOf('#name')).toBe(hostile.name);
    expect(Reflect.get(globalThis, 'hacked')).toBeUndefined();
  });
});

describe('what an address is never put into', () => {
  // The classic way to collect an address unseen: fields kept off screen or made invisible.
  it('skips a field kept off screen or made invisible', () => {
    document.body.innerHTML = `<form><input autocomplete="name" id="name">
      <input autocomplete="email" id="offscreen"><input autocomplete="tel" id="invisible" style="opacity: 0"></form>`;
    const offscreen = document.querySelector<HTMLInputElement>('#offscreen');
    // On the element itself: a spy here would change the prototype's mock, and with it every field.
    if (offscreen) {
      offscreen.getBoundingClientRect = () => new DOMRect(-9999, 0, 120, 24);
    }
    const result: { filled: number } = (0, eval)(addressFillScriptFor(RILEY, null));
    expect(result.filled).toBe(1);
    expect(document.querySelector<HTMLInputElement>('#name')?.value).toBe('Riley Jordan');
    expect(offscreen?.value).toBe('');
    expect(document.querySelector<HTMLInputElement>('#invisible')?.value).toBe('');
  });

  it('leaves a list someone has already chosen from', () => {
    document.body.innerHTML = `<form><select autocomplete="country" id="country">
      <option value="">Choose</option><option value="IE">Ireland</option><option value="GB">United Kingdom</option>
    </select></form>`;
    const select = document.querySelector<HTMLSelectElement>('#country');
    if (select) {
      select.value = 'IE';
    }
    (0, eval)(addressFillScriptFor(RILEY, null));
    expect(select?.value).toBe('IE');
  });

  // The page said what the box is, and it is not part of an address.
  it('does not guess at a field whose autocomplete names something else, such as a username', () => {
    const { valueOf } = fill('<form><input autocomplete="username" id="username" name="username"></form>');
    expect(valueOf('#username')).toBe('');
  });

  it('joins the street lines for a one-line box, and keeps them apart in a text area', () => {
    const { valueOf } = fill(
      '<form><input autocomplete="street-address" id="line"><textarea autocomplete="street-address" id="area"></textarea></form>',
    );
    expect(valueOf('#line')).toBe('1 High Street, Flat 2');
    expect(document.querySelector<HTMLTextAreaElement>('#area')?.value).toBe('1 High Street\nFlat 2');
  });
});
