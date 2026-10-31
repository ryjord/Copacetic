// Utils
import { SET_VALUE_SOURCE } from './fill-script';

// Types
import type { AddressFields } from '../../shared/passwords/addresses';

/**
 * Fills a saved address into the form at the point right-clicked, injected
 * once when you choose it and never otherwise, like Fill password. It fills
 * only empty, visible fields, by their autocomplete names first and their
 * names, ids and labels after, and returns only how many it filled.
 *
 * It runs in the page's own world, so the page's framework sees each value as
 * typed; the page is the one you are giving the address to.
 */
export function addressFillScriptFor(fields: AddressFields, point: { x: number; y: number } | null): string {
  const [line1 = '', line2 = '', ...rest] = fields.street.split('\n').map((line) => line.trim());
  const [givenName = '', ...familyNames] = fields.name.split(/\s+/).filter(Boolean);
  // Serialised as JSON so nothing in an address can end a string and become code.
  const values = JSON.stringify({
    name: fields.name,
    'given-name': givenName,
    'family-name': familyNames.join(' '),
    organization: fields.organisation,
    'street-address': fields.street,
    // A one-line box drops line breaks without a space, so it is given the lines joined.
    'street-address-on-one-line': [line1, line2, ...rest].filter(Boolean).join(', '),
    'address-line1': line1,
    'address-line2': [line2, ...rest].filter(Boolean).join(', '),
    'address-level2': fields.city,
    'address-level1': fields.region,
    'postal-code': fields.postcode,
    country: fields.country,
    'country-name': fields.country,
    tel: fields.phone,
    email: fields.email,
  });
  const at = point ? `document.elementFromPoint(${Math.round(point.x)}, ${Math.round(point.y)})` : 'null';
  return `(() => {
  const values = ${values};
  // What each field is, when it does not say so in autocomplete: the usual names forms give them.
  const guesses = [
    ['email', /e-?mail/i],
    ['tel', /phone|mobile|tel/i],
    ['postal-code', /post.?code|zip/i],
    ['address-level2', /city|town|locality/i],
    ['address-level1', /region|state|county|province/i],
    ['country', /country/i],
    ['organization', /company|organi[sz]ation/i],
    ['address-line2', /address.?(line)?.?2|apartment|suite/i],
    ['address-line1', /address.?(line)?.?1|street|address/i],
    ['given-name', /first.?name|given.?name|forename/i],
    ['family-name', /last.?name|surname|family.?name/i],
    ['name', /name/i],
  ];
  const describe = (element) =>
    [element.name, element.id, element.getAttribute('aria-label'), element.placeholder, element.labels?.[0]?.textContent]
      .filter(Boolean)
      .join(' ');
  // Words autocomplete can carry beside the field's own name, which say nothing about what it is.
  const qualifiers = new Set(['', 'on', 'off', 'shipping', 'billing', 'home', 'work', 'mobile', 'fax', 'pager']);
  const kindOf = (element) => {
    const tokens = (element.getAttribute('autocomplete') || '')
      .toLowerCase()
      .split(/\\s+/)
      .filter((token) => !token.startsWith('section-'));
    const named = tokens.find((token) => token in values);
    if (named) {
      return named;
    }
    // The page said what the field is, and it is not part of an address, such as a username or a card.
    if (tokens.some((token) => !qualifiers.has(token))) {
      return null;
    }
    const text = describe(element);
    return guesses.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
  };
  // Only what someone can see: an address put into a field kept off screen or invisible is handed over unseen.
  const isFillable = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const type = (element.type || '').toLowerCase();
    const pageWidth = Math.max(document.documentElement.scrollWidth, window.innerWidth);
    const isOnPage = rect.right > 0 && rect.bottom > 0 && rect.left < pageWidth;
    return rect.width > 1 && rect.height > 1 && isOnPage && style.visibility !== 'hidden' &&
      Number(style.opacity || 1) > 0.1 && !element.disabled && !element.readOnly &&
      !['hidden', 'password', 'checkbox', 'radio', 'submit', 'button', 'file', 'search'].includes(type);
  };
  // A list someone has already chosen from is theirs, as typed text is.
  const isChosen = (element) => {
    if (!(element instanceof HTMLSelectElement)) {
      return Boolean(element.value);
    }
    // Chosen when it no longer shows what it started on: the option marked selected, or the first.
    const started = Array.from(element.options).findIndex((option) => option.defaultSelected);
    return element.selectedIndex !== Math.max(started, 0);
  };
  ${SET_VALUE_SOURCE}
  const chooseOption = (select, wanted) => {
    const target = wanted.toLowerCase();
    const option = Array.from(select.options).find(
      (candidate) => candidate.value.toLowerCase() === target || candidate.text.trim().toLowerCase() === target,
    );
    return option ? option.value : null;
  };
  const clicked = ${at};
  const scope = clicked?.closest?.('form') ?? document.activeElement?.closest?.('form') ?? document;
  let filled = 0;
  for (const element of scope.querySelectorAll('input, select, textarea')) {
    if (!isFillable(element) || isChosen(element)) {
      continue;
    }
    const kind = kindOf(element);
    const isOneLineStreet = kind === 'street-address' && !(element instanceof HTMLTextAreaElement);
    const value = kind ? values[isOneLineStreet ? 'street-address-on-one-line' : kind] : '';
    if (!value) {
      continue;
    }
    const chosen = element instanceof HTMLSelectElement ? chooseOption(element, value) : value;
    if (chosen === null) {
      continue;
    }
    setValue(element, chosen);
    filled += 1;
  }
  return { filled };
})()`;
}
