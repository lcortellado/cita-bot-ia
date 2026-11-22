import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  appendMessage,
  getHistory,
  logConversation,
} from '../conversations/conversation.service.js';
import { generateReply } from './agent.service.js';

// Memory and log write files: replace them so tests stay deterministic and side-effect free.
vi.mock('../conversations/conversation.service.js', () => ({
  getHistory: vi.fn(() => []),
  appendMessage: vi.fn(),
  logConversation: vi.fn(),
}));

interface SentRequest {
  model: string;
  temperature: number;
  messages: { role: string; content: string; tool_call_id?: string }[];
  tools: { function: { name: string } }[];
}

const toolCall = (id: string, name: string, args: unknown) => ({
  id,
  type: 'function',
  function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) },
});

const modelResponse = (message: object, status = 200) =>
  new Response(JSON.stringify(status === 200 ? { choices: [{ message }] } : message), { status });

/** Stubs fetch so each OpenRouter call returns the next scripted assistant message. */
function scriptModel(...messages: object[]) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const message of messages) fetchMock.mockResolvedValueOnce(modelResponse(message));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function sentRequest(fetchMock: ReturnType<typeof scriptModel>, call = 0): SentRequest {
  const init = fetchMock.mock.calls[call]?.[1];
  return JSON.parse(init?.body as string) as SentRequest;
}

const PHONE = '595981000001';
const WEDNESDAY = '2026-11-25';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-24T15:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('generateReply', () => {
  it('returns the model text when no tool is needed', async () => {
    const fetchMock = scriptModel({ content: '  El brushing cuesta Gs. 80.000.  ' });

    const result = await generateReply(PHONE, '¿cuánto cuesta el brushing?');

    expect(result).toEqual({ reply: 'El brushing cuesta Gs. 80.000.', steps: [] });
    const request = sentRequest(fetchMock);
    expect(request.model).toBe('google/gemini-3.8-flash');
    expect(request.temperature).toBe(0.3);
    expect(request.tools.map((tool) => tool.function.name)).toEqual([
      'ver_horarios',
      'crear_agendamiento',
    ]);
    expect(request.messages[0]?.role).toBe('system');
    expect(request.messages[0]?.content).toContain('FICHA DEL NEGOCIO');
    expect(request.messages.at(-1)).toEqual({
      role: 'user',
      content: '¿cuánto cuesta el brushing?',
    });
  });

  it('sends the conversation history between the system prompt and the new message', async () => {
    vi.mocked(getHistory).mockReturnValue([
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: '¡Hola! ¿En qué te ayudo?' },
    ]);
    const fetchMock = scriptModel({ content: 'Claro.' });

    await generateReply(PHONE, 'quiero un turno');

    expect(
      sentRequest(fetchMock)
        .messages.map((message) => message.content)
        .slice(1),
    ).toEqual(['hola', '¡Hola! ¿En qué te ayudo?', 'quiero un turno']);
  });

  it('runs the booking tools in order and feeds their results back to the model', async () => {
    const fetchMock = scriptModel(
      { content: null, tool_calls: [toolCall('call-1', 'ver_horarios', { fecha: WEDNESDAY })] },
      {
        content: '',
        tool_calls: [
          toolCall('call-2', 'crear_agendamiento', {
            fecha: WEDNESDAY,
            hora: '09:00',
            nombre: 'Ana',
            servicio: 'Brushing',
          }),
        ],
      },
      { content: 'Listo, te espero el miércoles a las 09:00.' },
    );

    const result = await generateReply(PHONE, 'sí, confirmo');

    expect(result.reply).toBe('Listo, te espero el miércoles a las 09:00.');
    expect(result.steps.map((step) => step.tool)).toEqual(['ver_horarios', 'crear_agendamiento']);
    expect(result.steps[1]?.output).toEqual({
      ok: true,
      fecha: WEDNESDAY,
      hora: '09:00',
      id: 'demo-2026-11-25-09:00',
    });
    const toolMessage = sentRequest(fetchMock, 1).messages.at(-1);
    expect(toolMessage?.role).toBe('tool');
    expect(toolMessage?.tool_call_id).toBe('call-1');
    expect(JSON.parse(toolMessage?.content ?? '{}')).toMatchObject({ fecha: WEDNESDAY });
  });

  it('does not book a slot that was not shown to the customer first', async () => {
    scriptModel(
      {
        content: null,
        tool_calls: [
          toolCall('call-1', 'crear_agendamiento', {
            fecha: WEDNESDAY,
            hora: '10:00',
            nombre: 'Ana',
            servicio: 'Brushing',
          }),
        ],
      },
      { content: 'Primero veamos los horarios libres.' },
    );

    const result = await generateReply('595981000099', 'agéndame a las 10');

    expect(result.steps[0]?.output).toEqual({
      error: 'El horario 2026-11-25 10:00 no fue mostrado como libre. Llama a ver_horarios antes.',
    });
  });

  it('returns an error to the model for unknown tools and broken arguments', async () => {
    scriptModel(
      {
        content: null,
        tool_calls: [
          toolCall('call-1', 'borrar_todo', {}),
          toolCall('call-2', 'ver_horarios', '{not json'),
        ],
      },
      { content: 'No pude completar eso.' },
    );

    const result = await generateReply(PHONE, 'hola');

    expect(result.steps.map((step) => step.output)).toEqual([
      { error: 'Herramienta desconocida: borrar_todo' },
      { error: 'Fecha en formato inválido. Usa AAAA-MM-DD de la tabla de fechas.' },
    ]);
  });

  it('falls back to a safe reply when the model keeps calling tools', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        modelResponse({
          content: null,
          tool_calls: [toolCall('call', 'ver_horarios', { fecha: WEDNESDAY })],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateReply(PHONE, 'hola');

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(result.reply).toBe(
      'Disculpa, tuve un problema aquí. Voy a pedirle a alguien del equipo que te responda.',
    );
  });

  it('stores the turn in memory and in the conversation log', async () => {
    scriptModel({ content: 'Abrimos de martes a sábado.' });

    await generateReply(PHONE, '¿qué días abren?');

    expect(vi.mocked(appendMessage).mock.calls).toEqual([
      [PHONE, 'user', '¿qué días abren?'],
      [PHONE, 'assistant', 'Abrimos de martes a sábado.'],
    ]);
    expect(logConversation).toHaveBeenCalledWith({
      phone: PHONE,
      text: '¿qué días abren?',
      steps: [],
      reply: 'Abrimos de martes a sábado.',
    });
  });

  it('throws on OpenRouter errors without storing the turn', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(modelResponse({ error: { message: 'No credits' } }, 402)),
    );

    await expect(generateReply(PHONE, 'hola')).rejects.toThrow(/OpenRouter 402.*No credits/);
    expect(appendMessage).not.toHaveBeenCalled();
  });
});
