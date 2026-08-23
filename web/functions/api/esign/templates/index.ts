import { corsJson } from '../../../_lib/data';
import { FORM_CATEGORY_LABELS, type FormTemplate } from '../../../_lib/esign/types';
import { listFormTemplates } from '../../../_lib/esign/form-library';

function publicTemplate(template: FormTemplate) {
  return {
    id: template.id,
    title: template.title,
    category: template.category,
    categoryLabel: FORM_CATEGORY_LABELS[template.category],
    description: template.description,
    folder: template.folder,
    defaultSignerRole: template.defaultSignerRole,
    defaultPropertyId: template.defaultPropertyId,
    lockProperty: Boolean(template.lockProperty),
    signerField: template.signerField,
    fields: template.fields,
    presets: template.presets ?? [],
  };
}

export const onRequestGet: PagesFunction = async ({ request }) => {
  const templates = listFormTemplates().map(publicTemplate);
  return corsJson(request, {
    templates,
    categories: Object.entries(FORM_CATEGORY_LABELS).map(([id, label]) => ({ id, label })),
  });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
