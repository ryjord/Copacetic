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
  const kindOf = (element) => {
    const tokens = (element.getAttribute('autocomplete') || '').toLowerCase().split(/\\s+/);
    const named = tokens.find((token) => token in values);
    if (named) {
      return named;
    }
    if (tokens.includes('off') && tokens.length === 1 && !describe(element)) {
      return null;
    }
    const text = describe(element);
    return guesses.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
  };
  const isFillable = (element) => {
    const rect = element.getBoundingClientRect();
    const type = (element.type || '').toLowerCase();
    return rect.width > 0 && rect.height > 0 && !element.disabled && !element.readOnly &&
      !['hidden', 'password', 'checkbox', 'radio', 'submit', 'button', 'file', 'search'].includes(type);
  };
  const setValue = (element, value) => {
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype
      : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };
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
    if (!isFillable(element) || (element.value && !(element instanceof HTMLSelectElement))) {
      continue;
    }
    const kind = kindOf(element);
    const value = kind ? values[kind] : '';
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
