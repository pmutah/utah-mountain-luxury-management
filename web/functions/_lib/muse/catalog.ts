import { AGENT_TOOLS } from '../agent/tool-registry';
import { CONSTRUCTION_TOOLS } from '../agent/construction/tool-registry';
import { executeAgentTool } from '../agent/execute-tool';
import { executeConstructionTool } from '../agent/construction/execute-tool';
import type { AgentEnv } from '../agent/types';
import type { ConstructionEnv } from '../construction/types';

export type MuseTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export function listMuseTools(): MuseTool[] {
  return [...AGENT_TOOLS, ...CONSTRUCTION_TOOLS].map((t) => ({
    name: t.name,
    description: String(t.description ?? ''),
    parameters: JSON.parse(JSON.stringify(t.parameters ?? { type: 'object', properties: {} })) as Record<
      string,
      unknown
    >,
  }));
}

const COHOST_NAMES = new Set(AGENT_TOOLS.map((t) => t.name));
const BUILD_NAMES = new Set(CONSTRUCTION_TOOLS.map((t) => t.name));

export function isKnownMuseTool(name: string): boolean {
  return COHOST_NAMES.has(name) || BUILD_NAMES.has(name);
}

export async function runMuseTool(
  env: AgentEnv & ConstructionEnv,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ ok: true; tool: string; summary: string; data: Record<string, unknown> }> {
  const toolName = name.trim();
  if (!toolName) throw new Error('tool name is required.');
  if (!isKnownMuseTool(toolName)) throw new Error(`Unknown tool: ${toolName}`);

  if (COHOST_NAMES.has(toolName)) {
    const { result, step } = await executeAgentTool(env, toolName, args);
    if (result.error) throw new Error(String(result.error));
    return { ok: true, tool: toolName, summary: step.summary, data: result };
  }

  const { result, step } = await executeConstructionTool(env, toolName, args);
  if (result.error) throw new Error(String(result.error));
  return { ok: true, tool: toolName, summary: step.summary, data: result };
}
