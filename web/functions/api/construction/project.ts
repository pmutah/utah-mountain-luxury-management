import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { readJsonBody } from '../../_lib/json-body';
import { loadConstructionProject, saveConstructionProject } from '../../_lib/construction/construction-store';
import { readOrRefuse } from '../../_lib/read-guard';
import type { ConstructionEnv } from '../../_lib/construction/types';

export const onRequestGet: PagesFunction<ConstructionEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const read = await readOrRefuse(request, () => loadConstructionProject(env), 'The construction project');
  if (!read.ok) return read.response;
  return corsJson(request, read.value);
};

export const onRequestPut: PagesFunction<ConstructionEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  // The save spreads the current project, so a default here would blank every field the caller omitted.
  const read = await readOrRefuse(request, () => loadConstructionProject(env), 'The construction project');
  if (!read.ok) return read.response;
  const current = read.value;
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
