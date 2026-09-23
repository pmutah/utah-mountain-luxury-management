import { AGENT_TOOLS } from '../agent/tool-registry';
import { CONSTRUCTION_TOOLS } from '../agent/construction/tool-registry';
import { executeAgentTool } from '../agent/execute-tool';
import { callingAgent } from './auth';
import { executeConstructionTool } from '../agent/construction/execute-tool';
import type { AgentEnv } from '../agent/types';
import type { ConstructionEnv } from '../construction/types';

export type MuseTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

const DASHBOARD_REQUEST: MuseTool = {
  name: 'dashboard_request',
  description:
    'Call any Utah Mountain Luxury /api route. Use this for surveys, e-sign, documents, automation, briefing, receipts, and anything the named tools do not cover. Brandon granted standing authority.',
  parameters: {
    type: 'object',
    properties: {
      method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
      path: { type: 'string', description: 'Path beginning with /api/, for example /api/portfolio/metrics' },
      query: { type: 'object', additionalProperties: true, description: 'Query string fields' },
      body: { type: 'object', additionalProperties: true, description: 'JSON body for write methods' },
    },
    required: ['method', 'path'],
  },
};

export function listMuseTools(): MuseTool[] {
  return [
    ...[...AGENT_TOOLS, ...CONSTRUCTION_TOOLS].map((t) => ({
      name: t.name,
      description: String(t.description ?? ''),
      parameters: JSON.parse(JSON.stringify(t.parameters ?? { type: 'object', properties: {} })) as Record<
        string,
        unknown
      >,
    })),
    DASHBOARD_REQUEST,
  ];
}

const COHOST_NAMES = new Set(AGENT_TOOLS.map((t) => t.name));
const BUILD_NAMES = new Set(CONSTRUCTION_TOOLS.map((t) => t.name));

export function isKnownMuseTool(name: string): boolean {
  return COHOST_NAMES.has(name) || BUILD_NAMES.has(name) || name === 'dashboard_request';
}

export async function runDashboardRequest(
  request: Request,
  args: Record<string, unknown>,
): Promise<{ ok: true; tool: string; summary: string; data: Record<string, unknown> }> {
  const method = String(args.method ?? 'GET').toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    throw new Error('method must be GET, POST, PUT, PATCH, or DELETE.');
  }
  const path = String(args.path ?? '').trim();
  if (!path.startsWith('/api/') || path.includes('..') || path.startsWith('//')) {
    throw new Error('path must be an /api/ route on this site.');
  }
  if (path === '/api/muse/tools' || path === '/api/amanda/tools') {
    throw new Error('Call tools by name. dashboard_request is for the rest of /api.');
  }

  const url = new URL(path, request.url);
  if (args.query && typeof args.query === 'object' && !Array.isArray(args.query)) {
    for (const [key, value] of Object.entries(args.query as Record<string, unknown>)) {
      if (value != null) url.searchParams.set(key, String(value));
    }
  }

  const headers = new Headers();
  const authorization = request.headers.get('authorization');
  const museHeader = request.headers.get('x-muse-bot-secret');
  const amandaHeader = request.headers.get('x-amanda-bot-secret');
  if (authorization) headers.set('authorization', authorization);
  if (museHeader) headers.set('x-muse-bot-secret', museHeader);
  if (amandaHeader) headers.set('x-amanda-bot-secret', amandaHeader);

  let body: string | undefined;
  if (method !== 'GET' && method !== 'DELETE' && args.body !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(args.body);
  }

  const response = await fetch(url, { method, headers, body });
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!response.ok) {
    const message =
      parsed && typeof parsed === 'object' && parsed !== null && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : `${method} ${path} returned ${response.status}`;
    throw new Error(message);
  }
  const data =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { result: parsed };
  return { ok: true, tool: 'dashboard_request', summary: `${method} ${path}`, data };
}

export async function runMuseTool(
  env: AgentEnv & ConstructionEnv,
  name: string,
  args: Record<string, unknown> = {},
  request?: Request,
): Promise<{ ok: true; tool: string; summary: string; data: Record<string, unknown> }> {
  const toolName = name.trim();
  if (!toolName) throw new Error('tool name is required.');
  if (!isKnownMuseTool(toolName)) throw new Error(`Unknown tool: ${toolName}`);

  if (toolName === 'dashboard_request') {
    if (!request) throw new Error('dashboard_request needs the incoming request.');
    return runDashboardRequest(request, args);
  }

  if (COHOST_NAMES.has(toolName)) {
    const { result, step } = await executeAgentTool(env, toolName, args, callingAgent(request, env));
    if (result.error) throw new Error(String(result.error));
    return { ok: true, tool: toolName, summary: step.summary, data: result };
  }

  const { result, step } = await executeConstructionTool(env, toolName, args);
  if (result.error) throw new Error(String(result.error));
  return { ok: true, tool: toolName, summary: step.summary, data: result };
}
