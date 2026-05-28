import { corsJson } from '../../_lib/data';
import { loadConstructionProject, saveConstructionProject } from '../../_lib/construction/construction-store';
import type { ConstructionEnv } from '../../_lib/construction/types';

export const onRequestGet: PagesFunction<ConstructionEnv> = async ({ request, env }) => {
  const project = await loadConstructionProject(env);
  return corsJson(request, project);
};

export const onRequestPut: PagesFunction<ConstructionEnv> = async ({ request, env }) => {
  const body = (await request.json()) as Record<string, unknown>;
  const current = await loadConstructionProject(env);
  const project = await saveConstructionProject(env, {
    ...current,
    name: body.name !== undefined ? String(body.name) : current.name,
    address: body.address !== undefined ? String(body.address) : current.address,
    jurisdiction:
      body.jurisdiction !== undefined ? String(body.jurisdiction) : current.jurisdiction,
    currentStage:
      body.currentStage !== undefined ? String(body.currentStage) : current.currentStage,
    stages: Array.isArray(body.stages) ? (body.stages as string[]) : current.stages,
    budgetTarget:
      body.budgetTarget !== undefined ? Number(body.budgetTarget) : current.budgetTarget,
    scopeNotes: body.scopeNotes !== undefined ? String(body.scopeNotes) : current.scopeNotes,
    projectType: body.projectType !== undefined ? String(body.projectType) : current.projectType,
    contacts: Array.isArray(body.contacts)
      ? (body.contacts as typeof current.contacts)
      : current.contacts,
  });
  return corsJson(request, project);
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
