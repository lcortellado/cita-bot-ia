import {
  appendMessage,
  getHistory,
  logConversation,
} from '../conversations/conversation.service.js';
import { buildSystemPrompt } from './agent.prompt.js';
import { executeTool, TOOL_DEFINITIONS } from './agent.tools.js';
import type { ToolArguments, ToolOutput } from './agent.tools.js';
import { requestChatCompletion } from './openrouter.client.js';
import type { ChatMessage } from './openrouter.client.js';

const MAX_MODEL_ROUNDS = 6;
const FALLBACK_REPLY =
  'Disculpa, tuve un problema aquí. Voy a pedirle a alguien del equipo que te responda.';

export interface ToolStep {
  tool: string;
  args: ToolArguments;
  output: ToolOutput;
}

export interface AgentReply {
  reply: string;
  steps: ToolStep[];
}

function parseToolArguments(rawArguments: string): ToolArguments {
  try {
    const parsed: unknown = JSON.parse(rawArguments || '{}');
    return typeof parsed === 'object' && parsed !== null ? (parsed as ToolArguments) : {};
  } catch {
    // Broken arguments become a tool error further down (missing fields).
    return {};
  }
}

/** History + business profile + tools, in a loop until the model answers with text. */
export async function generateReply(customerPhone: string, text: string): Promise<AgentReply> {
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt() },
    ...getHistory(customerPhone),
    { role: 'user', content: text },
  ];
  const steps: ToolStep[] = [];
  let reply = FALLBACK_REPLY;

  for (let round = 0; round < MAX_MODEL_ROUNDS; round++) {
    const message = await requestChatCompletion(messages, TOOL_DEFINITIONS);
    if (!message.tool_calls?.length) {
      reply = message.content?.trim() || reply;
      break;
    }

    messages.push({
      role: 'assistant',
      content: message.content ?? '',
      tool_calls: message.tool_calls,
    });
    for (const toolCall of message.tool_calls) {
      const args = parseToolArguments(toolCall.function.arguments);
      let output: ToolOutput;
      try {
        output = await executeTool(customerPhone, toolCall.function.name, args);
      } catch (error) {
        output = { error: error instanceof Error ? error.message : String(error) };
      }
      steps.push({ tool: toolCall.function.name, args, output });
      messages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(output) });
    }
  }

  appendMessage(customerPhone, 'user', text);
  appendMessage(customerPhone, 'assistant', reply);
  // Every turn is logged so a wrong answer can be explained later.
  logConversation({ phone: customerPhone, text, steps, reply });
  return { reply, steps };
}
