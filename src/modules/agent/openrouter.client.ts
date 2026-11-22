import { env } from '../../shared/config/env.js';

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const APP_TITLE = 'Agente WhatsApp';
const TEMPERATURE = 0.3;

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolDefinition {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface AssistantMessage {
  content?: string | null;
  tool_calls?: ToolCall[];
}

interface ChatCompletionResponse {
  choices?: { message: AssistantMessage }[];
  error?: unknown;
}

export function isApiKeyConfigured(): boolean {
  return env.openRouter.apiKey.startsWith('sk-or-');
}

export async function requestChatCompletion(
  messages: ChatMessage[],
  tools: ToolDefinition[],
): Promise<AssistantMessage> {
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.openRouter.apiKey}`,
      'Content-Type': 'application/json',
      'X-OpenRouter-Title': APP_TITLE,
    },
    body: JSON.stringify({
      model: env.openRouter.model,
      messages,
      tools,
      temperature: TEMPERATURE,
    }),
  });
  const data = (await response.json()) as ChatCompletionResponse;
  if (!response.ok) {
    throw new Error(`OpenRouter ${String(response.status)}: ${JSON.stringify(data.error ?? data)}`);
  }
  const message = data.choices?.[0]?.message;
  if (!message) throw new Error('OpenRouter returned no choices');
  return message;
}
