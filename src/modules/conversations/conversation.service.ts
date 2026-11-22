import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

// Files are relative to the working directory (the project root when using npm scripts).
const MEMORY_FILE = 'memory.json';
const CONVERSATION_LOG_FILE = 'conversations.log';
const MAX_HISTORY_MESSAGES = 20; // messages sent back to the model
const CONVERSATION_TTL_MS = 24 * 3_600_000; // conversations idle longer than this start fresh
const SAVE_DEBOUNCE_MS = 300;

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Conversation {
  messages: ConversationMessage[];
  updatedAt: number;
}

export interface ConversationLogEntry {
  phone: string;
  text: string;
  steps: unknown[];
  reply: string;
}

// ---------------------------------------------------------------- memory (by phone number)
const conversations: Record<string, Conversation> = existsSync(MEMORY_FILE)
  ? (JSON.parse(readFileSync(MEMORY_FILE, 'utf8')) as Record<string, Conversation>)
  : {};
let saveTimer: NodeJS.Timeout | undefined;

function scheduleSave(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    writeFileSync(MEMORY_FILE, JSON.stringify(conversations));
  }, SAVE_DEBOUNCE_MS);
}

export function getHistory(phone: string): ConversationMessage[] {
  const conversation = conversations[phone];
  if (!conversation || Date.now() - conversation.updatedAt > CONVERSATION_TTL_MS) return [];
  return conversation.messages;
}

export function appendMessage(
  phone: string,
  role: ConversationMessage['role'],
  content: string,
): void {
  const messages = [...getHistory(phone), { role, content }].slice(-MAX_HISTORY_MESSAGES);
  conversations[phone] = { messages, updatedAt: Date.now() };
  scheduleSave();
}

export function logConversation(entry: ConversationLogEntry): void {
  appendFileSync(
    CONVERSATION_LOG_FILE,
    JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + '\n',
  );
}

// ---------------------------------------------------------------- one message at a time per phone
// Two messages in the same second? The second waits for the first (otherwise both read stale memory).
const queues = new Map<string, Promise<unknown>>();

export function runInConversationQueue<T>(phone: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(phone) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  queues.set(phone, current);
  current
    .finally(() => {
      if (queues.get(phone) === current) queues.delete(phone);
    })
    .catch(() => undefined);
  return current;
}
