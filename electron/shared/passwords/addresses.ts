/** The parts of an address a form asks for, in the order a person would write them. */
export const ADDRESS_FIELDS = [
  'name',
  'organisation',
  'street',
  'city',
  'region',
  'postcode',
  'country',
  'phone',
  'email',
] as const;

export type AddressField = (typeof ADDRESS_FIELDS)[number];

export type AddressFields = Record<AddressField, string>;

/** An address as a list shows it: what it is called, never the whole of it. */
export interface AddressEntry {
  id: string;
  label: string;
  createdAt: number;
  updatedAt: number;
  /** False where this machine cannot open it, which keeps it in the list rather than losing it. */
  isReadable: boolean;
}

// Longer than any real address line, so a renderer or a file cannot make one enormous.
const LONGEST_FIELD = 500;

export const EMPTY_ADDRESS: AddressFields = {
  name: '',
  organisation: '',
  street: '',
  city: '',
  region: '',
  postcode: '',
  country: '',
  phone: '',
  email: '',
};

/** An address from the renderer or a file, trusted only as these strings, trimmed and bounded. */
export function readAddressFields(value: unknown): AddressFields {
  const record = typeof value === 'object' && value !== null ? value : {};
  const fields = { ...EMPTY_ADDRESS };
  ADDRESS_FIELDS.forEach((field) => {
    const raw: unknown = Reflect.get(record, field);
    fields[field] = typeof raw === 'string' ? raw.trim().slice(0, LONGEST_FIELD) : '';
  });
  return fields;
}

export function isEmptyAddress(fields: AddressFields): boolean {
  return ADDRESS_FIELDS.every((field) => fields[field] === '');
}

/** "Riley Jordan, 1 High Street": enough to tell two apart in a menu. */
export function addressLabel(fields: AddressFields): string {
  const firstLine = fields.street.split('\n')[0]?.trim() ?? '';
  const parts = [fields.name || fields.organisation, firstLine || fields.city || fields.postcode].filter(Boolean);
  return parts.join(', ') || fields.email || fields.phone;
}
