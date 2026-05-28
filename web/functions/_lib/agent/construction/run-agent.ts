import {
  generateConstructionTurn,
  userMessage,
  modelText,
  modelFunctionCalls,
  toolResults,
} from './gemini-construction';
import { CONSTRUCTION_TOOLS } from './tool-registry';
import { CONSTRUCTION_PERSONA, buildConstructionContext } from './system-prompt';
import { executeConstructionTool } from './execute-tool';
import {
  loadConstructionSession,
  saveConstructionSession,
  newConstructionSessionId,
} from '../../construction/construction-store';
import type {
  ConstructionEnv,
  ConstructionAgentMessage,
  ConstructionChatResponse,
  ConstructionToolStep,
} from '../../construction/types';
import type { GeminiContent } from '../gemini-agent';

const MAX_TURNS = 12;

export async function runConstructionAgentChat(
  env: ConstructionEnv,
  userText: string,
  sessionId?: string,
): Promise<ConstructionChatResponse> {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const sid = sessionId ?? newConstructionSessionId();
  const history = await loadConstructionSession(env, sid);
  const { context, briefing } = await buildConstructionContext(env, userText);
  const systemPrompt = `${CONSTRUCTION_PERSONA}\n\n--- Project context ---\n${context}`;

  const geminiContents: GeminiContent[] = [];
  for (const msg of history) {
    if (msg.role === 'user') geminiContents.push(userMessage(msg.content));
    else if (msg.role === 'assistant') geminiContents.push(modelText(msg.content));
  }
  geminiContents.push(userMessage(userText));

  const messages: ConstructionAgentMessage[] = [
    ...history,
    { role: 'user', content: userText, timestamp: new Date().toISOString() },
  ];
  const toolSteps: ConstructionToolStep[] = [];
  let reply = '';

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const result = await generateConstructionTurn(apiKey, systemPrompt, geminiContents, CONSTRUCTION_TOOLS);

    if (result.functionCalls?.length) {
      geminiContents.push(modelFunctionCalls(result.functionCalls));
      const toolResultParts: Array<{ name: string; response: Record<string, unknown> }> = [];

      for (const call of result.functionCalls) {
        const { result: toolOut, step } = await executeConstructionTool(
          env,
          call.name,
          call.args,
          userText,
        );
        toolSteps.push(step);
        toolResultParts.push({ name: call.name, response: toolOut });
        messages.push({
          role: 'tool',
          content: JSON.stringify(toolOut).slice(0, 3000),
          toolName: call.name,
          timestamp: new Date().toISOString(),
        });
      }
      geminiContents.push(toolResults(toolResultParts));
      continue;
    }

    reply = result.text?.trim() ?? 'Done.';
    geminiContents.push(modelText(reply));
    messages.push({
      role: 'assistant',
      content: reply,
      timestamp: new Date().toISOString(),
    });
    break;
  }

  if (!reply) {
    reply = 'I completed the requested actions. Ask me anything about methods, codes, bids, or your next steps.';
    messages.push({
      role: 'assistant',
      content: reply,
      timestamp: new Date().toISOString(),
    });
  }

  await saveConstructionSession(env, sid, messages);

  return { sessionId: sid, reply, messages, toolSteps, briefing };
}
