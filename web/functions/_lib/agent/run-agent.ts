import {
  generateAgentTurn,
  userMessage,
  modelText,
  modelFunctionCalls,
  toolResults,
  type GeminiContent,
} from './gemini-agent';
import { AGENT_TOOLS } from './tool-registry';
import { AGENT_PERSONA, buildAgentContext } from './system-prompt';
import { executeAgentTool } from './execute-tool';
import { loadSession, saveSession, newSessionId } from './sessions';
import type {
  AgentChatContext,
  AgentEnv,
  AgentMessage,
  AgentChatResponse,
  ToolStep,
} from './types';

/**
 * A reminder appended after a tool result.
 *
 * The loop used to `continue` straight back to the model with no instruction. A model that believed the
 * tool output spoke for itself then returned empty text, and the host got no answer — which happened on
 * three runs out of three in testing. The tool result is data; the person still needs it in words.
 */
const ANSWER_NOW =
  'Now answer the question in plain language using the tool result above. State the figures you found ' +
  'and do not reply with a single word. If the tool returned nothing useful, say what was missing.';

const MAX_TOOL_CHARS = 12000;

/**
 * A tool result as the model sees it.
 *
 * Sized rather than sliced: a result at or under the budget is sent whole, so the model always reads a complete
 * answer. A larger one is sent with its counts and a plain statement that it was shortened — never silently cut,
 * because a model handed half an array cannot tell the difference and will fill the gap from the doctrine.
 */
export function toolResultForModel(out: Record<string, unknown>): string {
  const json = JSON.stringify(out);
  if (json.length <= MAX_TOOL_CHARS) return json;
  const shape: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(out)) {
    shape[key] = Array.isArray(value)
      ? `[${value.length} items, omitted for length]`
      : typeof value === 'object' && value !== null
        ? '[object, omitted for length]'
        : value;
  }
  return `${JSON.stringify(shape)}\n\nThis result was too large to send in full (${json.length} characters). The counts above are accurate; the item lists were omitted. Ask for a narrower date range to see the details.`;
}

const MAX_TURNS = 8;

export async function runAgentChat(
  env: AgentEnv,
  userText: string,
  sessionId?: string,
  uiContext: AgentChatContext = {},
): Promise<AgentChatResponse> {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const sid = sessionId ?? newSessionId();
  const history = await loadSession(env, sid);
  const contextBlock = await buildAgentContext(env, uiContext);
  const systemPrompt = `${AGENT_PERSONA}\n\n--- Current context ---\n${contextBlock}`;

  const geminiContents: GeminiContent[] = [];
  for (const msg of history) {
    if (msg.role === 'user') geminiContents.push(userMessage(msg.content));
    else if (msg.role === 'assistant') geminiContents.push(modelText(msg.content));
  }
  geminiContents.push(userMessage(userText));

  const messages: AgentMessage[] = [
    ...history,
    { role: 'user', content: userText, timestamp: new Date().toISOString() },
  ];
  const toolSteps: ToolStep[] = [];
  let reply = '';

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const result = await generateAgentTurn(apiKey, systemPrompt, geminiContents, AGENT_TOOLS);

    if (result.functionCalls?.length) {
      geminiContents.push(modelFunctionCalls(result.functionCalls));
      const toolResultParts: Array<{ name: string; response: Record<string, unknown> }> = [];

      for (const call of result.functionCalls) {
        const { result: toolOut, step } = await executeAgentTool(env, call.name, call.args);
        toolSteps.push(step);
        toolResultParts.push({ name: call.name, response: toolOut });
        /*
         * The whole result, not the first 2000 characters.
         *
         * A hard slice cut a pricing answer off mid-array, so the model answered from the doctrine formula using a
         * result that had been silently truncated — and a host was told $527 for a night they had approved at $193.
         * Truncation is the same defect as a label with nothing behind it: the model cannot tell a short answer
         * from a cut one. If a result is genuinely too large to send, it is summarised with a note saying so rather
         * than cut at an arbitrary boundary.
         */
        messages.push({
          role: 'tool',
          content: toolResultForModel(toolOut),
          toolName: call.name,
          timestamp: new Date().toISOString(),
        });
      }
      geminiContents.push(toolResults(toolResultParts));
      // Tell the model to answer, rather than letting it assume the tool output was enough.
      geminiContents.push(userMessage(ANSWER_NOW));
      continue;
    }

    reply = result.text?.trim() ?? '';
    /*
     * The model sometimes returns empty text after a tool call - often when it believes the tool result
     * speaks for itself. Substituting "Done." here was a non-answer dressed as an answer: a host asks a
     * question, gets "Done.", and has no idea what happened or whether anything was read. When the model
     * says nothing, the reply says what the tools actually did instead.
     */
    if (!reply) {
      const used = toolSteps.map((step) => step.tool).filter(Boolean);
      reply =
        used.length > 0
          ? `I ran ${used.length === 1 ? `the ${used[0]} tool` : `${used.length} tools (${used.join(', ')})`} but the model returned no summary. The results are in the steps above.`
          : 'The model returned no answer. Nothing was changed.';
    }
    geminiContents.push(modelText(reply));
    messages.push({
      role: 'assistant',
      content: reply,
      timestamp: new Date().toISOString(),
    });
    break;
  }

  if (!reply) {
    reply = 'I completed the requested actions. Let me know if you need anything else.';
    messages.push({
      role: 'assistant',
      content: reply,
      timestamp: new Date().toISOString(),
    });
  }

  await saveSession(env, sid, messages);

  return { sessionId: sid, reply, messages, toolSteps };
}

