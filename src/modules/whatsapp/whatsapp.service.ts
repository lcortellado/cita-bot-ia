import { env } from '../../shared/config/env.js';
import { generateReply } from '../agent/agent.service.js';
import { runInConversationQueue } from '../conversations/conversation.service.js';

const NON_TEXT_REPLY = 'Por ahora solo puedo leer mensajes de texto. ¿Me escribes? 🙂';
const MAX_TRACKED_MESSAGE_IDS = 5000;

export interface WhatsAppMessage {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
}

// ---------------------------------------------------------------- WhatsApp Cloud API (Graph)
async function sendGraphRequest(payload: Record<string, unknown>): Promise<void> {
  const url = `https://graph.facebook.com/${env.whatsapp.graphVersion}/${env.whatsapp.phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.whatsapp.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  });
  if (!response.ok) console.error('WhatsApp', response.status, await response.text());
}

function sendTextMessage(to: string, body: string): Promise<void> {
  return sendGraphRequest({ recipient_type: 'individual', to, type: 'text', text: { body } });
}

// Marks the message as read and shows "typing…" until the reply is sent (WhatsApp hides it after 25 s).
function markAsReadWithTypingIndicator(messageId: string): Promise<void> {
  return sendGraphRequest({
    status: 'read',
    message_id: messageId,
    typing_indicator: { type: 'text' },
  });
}

// ---------------------------------------------------------------- incoming messages, without duplicates
// Meta may deliver the same message more than once: remember the ids already handled.
const handledMessageIds = new Set<string>();

function isAlreadyHandled(messageId: string): boolean {
  if (handledMessageIds.has(messageId)) return true;
  handledMessageIds.add(messageId);
  if (handledMessageIds.size > MAX_TRACKED_MESSAGE_IDS) {
    const oldestId = handledMessageIds.values().next().value;
    if (oldestId !== undefined) handledMessageIds.delete(oldestId);
  }
  return false;
}

export async function handleIncomingMessage(message: WhatsAppMessage): Promise<void> {
  if (isAlreadyHandled(message.id)) return;
  const phone = message.from;
  try {
    await markAsReadWithTypingIndicator(message.id);
    if (message.type !== 'text' || !message.text) {
      await sendTextMessage(phone, NON_TEXT_REPLY);
      return;
    }
    const text = message.text.body;
    const { reply } = await runInConversationQueue(phone, () => generateReply(phone, text));
    await sendTextMessage(phone, reply);
    console.log(`💬 ${phone}: ${text}\n🤖 ${reply}\n`);
  } catch (error) {
    console.error('Failed to reply to', phone, error);
  }
}
