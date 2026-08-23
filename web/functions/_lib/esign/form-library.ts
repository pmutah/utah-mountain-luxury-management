import type { FormTemplate, PropertyScope } from './types';
import { JM_LT_LIEN_RELEASE } from './lien-release';

export const UML_SITES: Record<
  PropertyScope,
  { id: PropertyScope; name: string; address: string; owners: string }
> = {
  ranch: {
    id: 'ranch',
    name: 'The Ranch House',
    address: '270 East Center Street, Lindon, Utah 84042',
    owners: 'Todd Wilhite and Brandon Pierce',
  },
  lindon: {
    id: 'lindon',
    name: 'The Lindon House',
    address: '143 Harcliff Circle, Lindon, Utah 84042',
    owners: 'Brandon Pierce / Utah Mountain Luxury Management',
  },
  river: {
    id: 'river',
    name: 'The River House',
    address: '6800 Fairfax Drive and 6802 Fairfax Drive, Provo, Utah 84604',
    owners: 'Todd Wilhite or Brandon Pierce',
  },
  construction: {
    id: 'construction',
    name: 'The River House (construction)',
    address: '6800 Fairfax Drive and 6802 Fairfax Drive, Provo, Utah 84604',
    owners: 'Todd Wilhite or Brandon Pierce',
  },
  all: {
    id: 'all',
    name: 'Utah Mountain Luxury portfolio',
    address: 'Ranch House · Lindon House · River House',
    owners: 'Utah Mountain Luxury Management',
  },
};

const CONTACT = [
  { key: 'phone', label: 'Phone', type: 'tel' as const, placeholder: '435-720-6914' },
  { key: 'email', label: 'Email', type: 'email' as const, placeholder: 'contractor@email.com' },
];

const PROPERTY_FIELD = {
  key: 'propertyId',
  label: 'Property',
  type: 'property' as const,
  required: true,
};

export const FORM_TEMPLATES: FormTemplate[] = [
  {
    id: 'river-final-release',
    title: 'River House final-payment release',
    category: 'lien',
    description:
      'The River House packet you already use — Utah § 38-1a-802 final payment with the broader lower-tier release. Job site and owners stay locked to Fairfax Drive.',
    folder: 'contractor',
    defaultSignerRole: 'contractor',
    defaultPropertyId: 'river',
    lockProperty: true,
    signerField: 'contractorName',
    fields: [
      { key: 'contractorName', label: 'Contractor / claimant', type: 'text', required: true, span: 2 },
      { key: 'contractorAddress', label: 'Address', type: 'text', span: 2 },
      ...CONTACT,
      { key: 'invoiceNo', label: 'Invoice no.', type: 'text' },
      { key: 'invoiceDate', label: 'Invoice date', type: 'text', placeholder: 'August 21, 2026' },
      { key: 'amountUsd', label: 'Final payment', type: 'number', required: true },
      {
        key: 'description',
        label: 'Work description',
        type: 'textarea',
        required: true,
        span: 2,
      },
    ],
    presets: [
      {
        id: 'jm-lt',
        label: 'Load JM & LT example',
        values: { ...JM_LT_LIEN_RELEASE, propertyId: 'river' },
      },
    ],
  },
  {
    id: 'utah-progress-waiver',
    title: 'Utah progress-payment waiver',
    category: 'lien',
    description:
      'Statutory Utah Conditional Waiver and Release Upon Progress Payment (§ 38-1a-802(4)(b)). Use while work is still going. Does not cover retention, pending changes, or disputes.',
    folder: 'contractor',
    defaultSignerRole: 'contractor',
    defaultPropertyId: 'river',
    signerField: 'contractorName',
    fields: [
      PROPERTY_FIELD,
      { key: 'contractorName', label: 'Claimant / company', type: 'text', required: true, span: 2 },
      {
        key: 'customer',
        label: "Undersigned's customer",
        type: 'text',
        required: true,
        placeholder: 'Utah Mountain Luxury Management',
        span: 2,
      },
      ...CONTACT,
      { key: 'invoiceNo', label: 'Invoice / pay app no.', type: 'text', required: true },
      { key: 'paymentPeriod', label: 'Payment period', type: 'text', required: true, placeholder: 'July 1–31, 2026' },
      { key: 'amountUsd', label: 'Payment amount', type: 'number', required: true },
    ],
  },
  {
    id: 'utah-final-waiver',
    title: 'Utah final-payment waiver',
    category: 'lien',
    description:
      'Statutory Utah Waiver and Release Upon Final Payment (§ 38-1a-802(4)(c)). Use only when this is the last payment, including retention.',
    folder: 'contractor',
    defaultSignerRole: 'contractor',
    defaultPropertyId: 'river',
    signerField: 'contractorName',
    fields: [
      PROPERTY_FIELD,
      { key: 'contractorName', label: 'Claimant / company', type: 'text', required: true, span: 2 },
      {
        key: 'customer',
        label: "Undersigned's customer",
        type: 'text',
        required: true,
        placeholder: 'Utah Mountain Luxury Management',
        span: 2,
      },
      ...CONTACT,
      { key: 'invoiceNo', label: 'Invoice / pay app no.', type: 'text', required: true },
      { key: 'amountUsd', label: 'Final payment amount', type: 'number', required: true },
    ],
  },
  {
    id: 'work-authorization',
    title: 'Contractor work authorization',
    category: 'contractor',
    description: 'Authorize a contractor to do a defined job at a set price before work starts.',
    folder: 'contractor',
    defaultSignerRole: 'contractor',
    defaultPropertyId: 'river',
    signerField: 'contractorName',
    fields: [
      PROPERTY_FIELD,
      { key: 'contractorName', label: 'Contractor', type: 'text', required: true, span: 2 },
      ...CONTACT,
      { key: 'scope', label: 'Scope of work', type: 'textarea', required: true, span: 2 },
      { key: 'startDate', label: 'Start date', type: 'text' },
      { key: 'amountUsd', label: 'Authorized amount', type: 'number', required: true },
    ],
  },
  {
    id: 'change-order',
    title: 'Change order',
    category: 'contractor',
    description: 'Add, remove, or change work and price after a job is already authorized.',
    folder: 'contractor',
    defaultSignerRole: 'contractor',
    defaultPropertyId: 'river',
    signerField: 'contractorName',
    fields: [
      PROPERTY_FIELD,
      { key: 'contractorName', label: 'Contractor', type: 'text', required: true, span: 2 },
      ...CONTACT,
      { key: 'originalRef', label: 'Original job / invoice', type: 'text' },
      { key: 'amountUsd', label: 'Change amount (+/−)', type: 'number', required: true },
      { key: 'scope', label: 'Change description', type: 'textarea', required: true, span: 2 },
    ],
  },
  {
    id: 'notice-to-proceed',
    title: 'Notice to proceed',
    category: 'contractor',
    description: 'Tell a contractor they may start work on a stated date.',
    folder: 'contractor',
    defaultSignerRole: 'contractor',
    defaultPropertyId: 'construction',
    signerField: 'contractorName',
    fields: [
      PROPERTY_FIELD,
      { key: 'contractorName', label: 'Contractor', type: 'text', required: true, span: 2 },
      ...CONTACT,
      { key: 'startDate', label: 'Start date', type: 'text', required: true },
      { key: 'scope', label: 'Work to begin', type: 'textarea', required: true, span: 2 },
    ],
  },
  {
    id: 'punch-list',
    title: 'Punch-list completion',
    category: 'contractor',
    description: 'List remaining items and have the contractor confirm they will finish them.',
    folder: 'contractor',
    defaultSignerRole: 'contractor',
    defaultPropertyId: 'construction',
    signerField: 'contractorName',
    fields: [
      PROPERTY_FIELD,
      { key: 'contractorName', label: 'Contractor', type: 'text', required: true, span: 2 },
      ...CONTACT,
      { key: 'dueDate', label: 'Complete by', type: 'text' },
      { key: 'scope', label: 'Remaining items', type: 'textarea', required: true, span: 2 },
    ],
  },
  {
    id: 'payment-receipt',
    title: 'Payment receipt',
    category: 'contractor',
    description:
      'Contractor acknowledges they received a payment. This is not a statutory lien waiver — send a Utah waiver when you need lien rights released.',
    folder: 'contractor',
    defaultSignerRole: 'contractor',
    defaultPropertyId: 'river',
    signerField: 'contractorName',
    fields: [
      PROPERTY_FIELD,
      { key: 'contractorName', label: 'Payee', type: 'text', required: true, span: 2 },
      ...CONTACT,
      { key: 'invoiceNo', label: 'Invoice / reference', type: 'text' },
      { key: 'amountUsd', label: 'Amount received', type: 'number', required: true },
      { key: 'scope', label: 'What the payment covers', type: 'textarea', required: true, span: 2 },
    ],
  },
  {
    id: 'cleaning-agreement',
    title: 'Cleaning / turnover agreement',
    category: 'vendor',
    description: 'Turnover cleaner scope, fee, and access for a house.',
    folder: 'esign',
    defaultSignerRole: 'vendor',
    defaultPropertyId: 'ranch',
    signerField: 'contractorName',
    fields: [
      PROPERTY_FIELD,
      { key: 'contractorName', label: 'Cleaner / company', type: 'text', required: true, span: 2 },
      ...CONTACT,
      { key: 'amountUsd', label: 'Fee per turnover', type: 'number', required: true },
      { key: 'scope', label: 'Scope and checklist', type: 'textarea', required: true, span: 2 },
    ],
  },
  {
    id: 'maintenance-work-order',
    title: 'Maintenance work order',
    category: 'vendor',
    description: 'Send a vendor a one-off repair or maintenance job.',
    folder: 'esign',
    defaultSignerRole: 'vendor',
    defaultPropertyId: 'ranch',
    signerField: 'contractorName',
    fields: [
      PROPERTY_FIELD,
      { key: 'contractorName', label: 'Vendor', type: 'text', required: true, span: 2 },
      ...CONTACT,
      { key: 'amountUsd', label: 'Not-to-exceed / quoted', type: 'number' },
      { key: 'scope', label: 'Work requested', type: 'textarea', required: true, span: 2 },
    ],
  },
  {
    id: 'property-access',
    title: 'Property access acknowledgment',
    category: 'vendor',
    description: 'Vendor or contractor acknowledges codes, keys, alarm, and how they must treat the house.',
    folder: 'esign',
    defaultSignerRole: 'vendor',
    defaultPropertyId: 'ranch',
    signerField: 'contractorName',
    fields: [
      PROPERTY_FIELD,
      { key: 'contractorName', label: 'Person / company', type: 'text', required: true, span: 2 },
      ...CONTACT,
      {
        key: 'scope',
        label: 'Access granted (doors, lockbox, codes — do not put live codes here)',
        type: 'textarea',
        required: true,
        span: 2,
        placeholder: 'Front lockbox, garage keypad, and alarm stay. No codes on this form.',
      },
    ],
  },
  {
    id: 'coi-acknowledgment',
    title: 'Insurance on file',
    category: 'vendor',
    description: 'Contractor confirms current liability (and workers’ comp if required) is on file with UML.',
    folder: 'important',
    defaultSignerRole: 'contractor',
    defaultPropertyId: 'all',
    signerField: 'contractorName',
    fields: [
      PROPERTY_FIELD,
      { key: 'contractorName', label: 'Contractor / vendor', type: 'text', required: true, span: 2 },
      ...CONTACT,
      { key: 'policyNo', label: 'Policy / certificate no.', type: 'text' },
      { key: 'expires', label: 'Expires', type: 'text' },
    ],
  },
  {
    id: 'w9-on-file',
    title: 'W-9 on file',
    category: 'vendor',
    description:
      'Vendor confirms a current IRS W-9 was given to Utah Mountain Luxury. This is not a substitute for the IRS form.',
    folder: 'important',
    defaultSignerRole: 'vendor',
    defaultPropertyId: 'all',
    signerField: 'contractorName',
    fields: [
      { key: 'contractorName', label: 'Payee / company', type: 'text', required: true, span: 2 },
      ...CONTACT,
      { key: 'taxYear', label: 'Tax year', type: 'text', placeholder: '2026' },
    ],
  },
  {
    id: 'guest-liability-waiver',
    title: 'Guest liability waiver (short)',
    category: 'guest',
    description:
      'One-page assumption of risk and release for the booking lead and their whole party. Use this on every stay. Covers slips, stairs, hot tub, river/canyon, and ordinary negligence — not gross negligence.',
    folder: 'esign',
    defaultSignerRole: 'other',
    defaultPropertyId: 'ranch',
    signerField: 'contractorName',
    fields: [
      PROPERTY_FIELD,
      { key: 'contractorName', label: 'Guest name (booking lead)', type: 'text', required: true, span: 2 },
      ...CONTACT,
      { key: 'stayDates', label: 'Stay dates', type: 'text', required: true, placeholder: 'Aug 12-16, 2026' },
      { key: 'occupancy', label: 'Overnight guests', type: 'text', placeholder: '4' },
      {
        key: 'bookingSource',
        label: 'Booked on',
        type: 'select',
        options: [
          { value: 'Airbnb', label: 'Airbnb' },
          { value: 'VRBO', label: 'VRBO' },
          { value: 'Direct', label: 'Direct' },
          { value: 'Other', label: 'Other' },
        ],
      },
    ],
  },
  {
    id: 'guest-stay-agreement',
    title: 'Guest stay agreement (full)',
    category: 'guest',
    description:
      'Full stay contract plus liability waiver: occupancy, house rules, damage, hot tub, river/canyon, release, and indemnity. Send with the short waiver or instead of it when you want the longer packet.',
    folder: 'esign',
    defaultSignerRole: 'other',
    defaultPropertyId: 'ranch',
    signerField: 'contractorName',
    fields: [
      PROPERTY_FIELD,
      { key: 'contractorName', label: 'Guest name (booking lead)', type: 'text', required: true, span: 2 },
      ...CONTACT,
      { key: 'stayDates', label: 'Stay dates', type: 'text', required: true, placeholder: 'Aug 12-16, 2026' },
      { key: 'occupancy', label: 'Overnight guests', type: 'text', required: true, placeholder: '4' },
      {
        key: 'bookingSource',
        label: 'Booked on',
        type: 'select',
        options: [
          { value: 'Airbnb', label: 'Airbnb' },
          { value: 'VRBO', label: 'VRBO' },
          { value: 'Direct', label: 'Direct' },
          { value: 'Other', label: 'Other' },
        ],
      },
    ],
  },
  {
    id: 'guest-damage-charge',
    title: 'Guest damage charge',
    category: 'guest',
    description: 'Guest agrees a specific damage amount may be charged after a stay.',
    folder: 'esign',
    defaultSignerRole: 'other',
    defaultPropertyId: 'ranch',
    signerField: 'contractorName',
    fields: [
      PROPERTY_FIELD,
      { key: 'contractorName', label: 'Guest name', type: 'text', required: true, span: 2 },
      ...CONTACT,
      { key: 'stayDates', label: 'Stay dates', type: 'text', placeholder: 'Aug 12–16, 2026' },
      { key: 'amountUsd', label: 'Charge amount', type: 'number', required: true },
      { key: 'scope', label: 'Damage and repair', type: 'textarea', required: true, span: 2 },
    ],
  },
  {
    id: 'guest-extra-cleaning',
    title: 'Guest extra-cleaning charge',
    category: 'guest',
    description: 'Guest agrees to an extra cleaning charge beyond the standard turnover.',
    folder: 'esign',
    defaultSignerRole: 'other',
    defaultPropertyId: 'ranch',
    signerField: 'contractorName',
    fields: [
      PROPERTY_FIELD,
      { key: 'contractorName', label: 'Guest name', type: 'text', required: true, span: 2 },
      ...CONTACT,
      { key: 'stayDates', label: 'Stay dates', type: 'text' },
      { key: 'amountUsd', label: 'Extra cleaning amount', type: 'number', required: true },
      { key: 'scope', label: 'Why the extra clean is needed', type: 'textarea', required: true, span: 2 },
    ],
  },
  {
    id: 'guest-incident',
    title: 'Guest incident acknowledgment',
    category: 'guest',
    description: 'Guest confirms the facts of an incident during a stay.',
    folder: 'esign',
    defaultSignerRole: 'other',
    defaultPropertyId: 'ranch',
    signerField: 'contractorName',
    fields: [
      PROPERTY_FIELD,
      { key: 'contractorName', label: 'Guest name', type: 'text', required: true, span: 2 },
      ...CONTACT,
      { key: 'stayDates', label: 'Stay dates', type: 'text' },
      { key: 'incidentDate', label: 'Incident date', type: 'text' },
      { key: 'scope', label: 'What happened', type: 'textarea', required: true, span: 2 },
    ],
  },
  {
    id: 'owner-expense-approval',
    title: 'Owner expense approval',
    category: 'owner',
    description: 'Owner approves a repair, capex, or other spend before you book it.',
    folder: 'important',
    defaultSignerRole: 'owner',
    defaultPropertyId: 'river',
    signerField: 'contractorName',
    fields: [
      PROPERTY_FIELD,
      { key: 'contractorName', label: 'Approving owner', type: 'text', required: true, span: 2 },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'phone', label: 'Phone', type: 'tel' },
      { key: 'amountUsd', label: 'Amount', type: 'number', required: true },
      { key: 'scope', label: 'What this spend covers', type: 'textarea', required: true, span: 2 },
    ],
  },
  {
    id: 'owner-decision-ack',
    title: 'Owner decision acknowledgment',
    category: 'owner',
    description: 'Owner confirms a management decision (pricing, vendor, construction, etc.).',
    folder: 'important',
    defaultSignerRole: 'owner',
    defaultPropertyId: 'all',
    signerField: 'contractorName',
    fields: [
      PROPERTY_FIELD,
      { key: 'contractorName', label: 'Owner', type: 'text', required: true, span: 2 },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'phone', label: 'Phone', type: 'tel' },
      { key: 'scope', label: 'Decision being acknowledged', type: 'textarea', required: true, span: 2 },
    ],
  },
];

export function getFormTemplate(id: string): FormTemplate | undefined {
  return FORM_TEMPLATES.find((t) => t.id === id);
}

export function listFormTemplates(): FormTemplate[] {
  return FORM_TEMPLATES;
}

export function resolveSite(propertyId: unknown) {
  if (typeof propertyId === 'string' && propertyId in UML_SITES) {
    return UML_SITES[propertyId as PropertyScope];
  }
  return UML_SITES.all;
}

export function emptyFormValues(template: FormTemplate): Record<string, string | number> {
  const values: Record<string, string | number> = {
    propertyId: template.defaultPropertyId,
  };
  if (template.id === 'utah-progress-waiver' || template.id === 'utah-final-waiver') {
    values.customer = 'Utah Mountain Luxury Management';
  }
  return values;
}

export function validateFormValues(
  template: FormTemplate,
  raw: Record<string, unknown>,
): { values: Record<string, string | number>; error?: string } {
  const values: Record<string, string | number> = { ...emptyFormValues(template) };
  for (const field of template.fields) {
    const incoming = raw[field.key];
    if (field.type === 'number') {
      const n = Number(incoming ?? 0);
      if (field.required && (!Number.isFinite(n) || n === 0) && incoming !== 0) {
        return { values, error: `${field.label} is required.` };
      }
      if (Number.isFinite(n)) values[field.key] = n;
      continue;
    }
    const text = typeof incoming === 'string' ? incoming.trim() : incoming == null ? '' : String(incoming).trim();
    if (field.required && !text) return { values, error: `${field.label} is required.` };
    if (text) values[field.key] = text;
  }
  if (template.lockProperty) values.propertyId = template.defaultPropertyId;
  return { values };
}
