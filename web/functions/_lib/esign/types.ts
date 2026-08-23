export const VAULT_FOLDERS = ['esign', 'contractor', 'important'] as const;
export type VaultFolder = (typeof VAULT_FOLDERS)[number];

export const ESIGN_STATUSES = ['stored', 'pending', 'completed', 'cancelled'] as const;
export type EsignStatus = (typeof ESIGN_STATUSES)[number];

export const SIGNER_ROLES = ['contractor', 'owner', 'staff', 'vendor', 'other'] as const;
export type SignerRole = (typeof SIGNER_ROLES)[number];

export const PROPERTY_SCOPES = ['all', 'ranch', 'lindon', 'river', 'construction'] as const;
export type PropertyScope = (typeof PROPERTY_SCOPES)[number];

export type VaultDocKind = 'upload' | 'lien-release' | 'form';

export const FORM_CATEGORIES = ['lien', 'contractor', 'vendor', 'guest', 'owner'] as const;
export type FormCategory = (typeof FORM_CATEGORIES)[number];

export const FORM_FIELD_TYPES = [
  'text',
  'textarea',
  'email',
  'tel',
  'number',
  'date',
  'select',
  'property',
] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export interface FormFieldDef {
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  span?: 1 | 2;
}

export interface FormPreset {
  id: string;
  label: string;
  values: Record<string, string | number>;
}

export interface FormTemplate {
  id: string;
  title: string;
  category: FormCategory;
  description: string;
  folder: VaultFolder;
  defaultSignerRole: SignerRole;
  defaultPropertyId: PropertyScope;
  lockProperty?: boolean;
  signerField: string;
  fields: FormFieldDef[];
  presets?: FormPreset[];
}

export interface LienReleaseFields {
  contractorName: string;
  contractorAddress?: string;
  phone?: string;
  email?: string;
  invoiceNo?: string;
  invoiceDate?: string;
  description: string;
  amountUsd: number;
}

export interface VaultDocument {
  id: string;
  title: string;
  folder: VaultFolder;
  status: EsignStatus;
  sourceFileName: string;
  contentType: string;
  storagePath: string | null;
  signedStoragePath?: string | null;
  uploadedAt: string;
  notes?: string;
  propertyId?: PropertyScope;
  signerName?: string;
  signerEmail?: string;
  signerPhone?: string;
  signerRole?: SignerRole;
  sentChannel?: 'email' | 'sms';
  kind?: VaultDocKind;
  lienRelease?: LienReleaseFields;
  formTemplateId?: string;
  formValues?: Record<string, string | number>;
  sessionId?: string;
  viewerToken?: string;
  sentAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  signerIp?: string;
  signerUserAgent?: string;
  consentAcceptedAt?: string;
}

export interface EsignSession {
  id: string;
  documentId: string;
  viewerToken: string;
  signerName: string;
  signerEmail?: string;
  signerPhone?: string;
  createdAt: string;
  expiresAt: string;
  completedAt?: string;
  cancelledAt?: string;
}

export function isVaultFolder(value: unknown): value is VaultFolder {
  return typeof value === 'string' && (VAULT_FOLDERS as readonly string[]).includes(value);
}

export function isSignerRole(value: unknown): value is SignerRole {
  return typeof value === 'string' && (SIGNER_ROLES as readonly string[]).includes(value);
}

export function isPropertyScope(value: unknown): value is PropertyScope {
  return typeof value === 'string' && (PROPERTY_SCOPES as readonly string[]).includes(value);
}

export const FOLDER_LABELS: Record<VaultFolder, string> = {
  esign: 'E-sign',
  contractor: 'Contractor releases',
  important: 'Important documents',
};

export const FORM_CATEGORY_LABELS: Record<FormCategory, string> = {
  lien: 'Lien waivers',
  contractor: 'Contractors',
  vendor: 'Vendors',
  guest: 'Guests',
  owner: 'Owners',
};
