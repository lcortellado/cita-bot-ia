import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateReply } from '../agent/agent.service.js';
import { handleIncomingMessage } from './whatsapp.service.js';
import type { WhatsAppMessage } from './whatsapp.service.js';

vi.mock('../agent/agent.service.js', () => ({ generateReply: vi.fn() }));
// Run the task right away: the queue itself is tested in conversation.service.test.ts.
vi.mock('../conversations/conversation.service.js', () => ({
  runInConversationQueue: (_phone: string, task: () => Promise<unknown>) => task(),
}));

interface GraphRequest {
  url: string;
  authorization: string;
  payload: Record<string, unknown>;
}

let graphRequests: GraphRequest[];

beforeEach(() => {
  graphRequests = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((url, init) => {
      const headers = new Headers(init?.headers);
      graphRequests.push({
        url: url as string,
        authorization: headers.get('Authorization') ?? '',
        payload: JSON.parse(init?.body as string) as Record<string, unknown>,
      });
      return Promise.resolve(new Response('{}', { status: 200 }));
    }),
  );
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

let messageCounter = 0;
const message = (overrides: Partial<WhatsAppMessage> = {}): WhatsAppMessage => ({
  id: `wamid-${String(messageCounter++)}`,
  from: '595981000001',
  type: 'text',
  text: { body: '¿cuánto cuesta el corte?' },
  ...overrides,
});

describe('handleIncomingMessage', () => {
  it('marks the message as read, asks the agent and sends the reply', async () => {
    vi.mocked(generateReply).mockResolvedValue({ reply: 'Cuesta Gs. 120.000.', steps: [] });
    const incoming = message();

    await handleIncomingMessage(incoming);

    expect(generateReply).toHaveBeenCalledWith('595981000001', '¿cuánto cuesta el corte?');
    expect(graphRequests.map((request) => request.payload)).toEqual([
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: incoming.id,
        typing_indicator: { type: 'text' },
      },
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: '595981000001',
        type: 'text',
        text: { body: 'Cuesta Gs. 120.000.' },
      },
    ]);
    // Values set in vitest.config.ts.
    expect(graphRequests[1]?.url).toBe(
      'https://graph.facebook.com/v25.0/test-phone-number-id/messages',
    );
    expect(graphRequests[1]?.authorization).toBe('Bearer test-whatsapp-token');
  });

  it('handles a message delivered twice only once', async () => {
    vi.mocked(generateReply).mockResolvedValue({ reply: 'Hola', steps: [] });
    const incoming = message();

    await handleIncomingMessage(incoming);
    await handleIncomingMessage(incoming);

    expect(generateReply).toHaveBeenCalledTimes(1);
  });

  it('answers non-text messages without calling the agent', async () => {
    await handleIncomingMessage(message({ type: 'image', text: undefined }));

    expect(generateReply).not.toHaveBeenCalled();
    expect(graphRequests.at(-1)?.payload.text).toEqual({
      body: 'Por ahora solo puedo leer mensajes de texto. ¿Me escribes? 🙂',
    });
  });

  it('logs agent errors instead of crashing the webhook', async () => {
    vi.mocked(generateReply).mockRejectedValue(new Error('OpenRouter 500'));

    await expect(handleIncomingMessage(message())).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
    // Only the "read" receipt was sent: no reply on failure (current behavior).
    expect(graphRequests).toHaveLength(1);
  });
});
