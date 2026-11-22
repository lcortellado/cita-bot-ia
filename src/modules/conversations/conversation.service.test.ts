import { appendFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  appendMessage,
  getHistory,
  logConversation,
  runInConversationQueue,
} from './conversation.service.js';

// No real files: memory.json is "missing" at startup and writes go to mocks.
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

const HOUR_MS = 3_600_000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-24T15:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('conversation memory', () => {
  it('returns the messages of each phone separately', () => {
    appendMessage('595900000001', 'user', 'hola');
    appendMessage('595900000001', 'assistant', '¡Hola!');
    appendMessage('595900000002', 'user', 'otro cliente');

    expect(getHistory('595900000001')).toEqual([
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: '¡Hola!' },
    ]);
    expect(getHistory('595900000002')).toEqual([{ role: 'user', content: 'otro cliente' }]);
    expect(getHistory('595900000003')).toEqual([]);
  });

  it('keeps only the last 20 messages', () => {
    for (let index = 1; index <= 25; index++)
      appendMessage('595900000004', 'user', `m${String(index)}`);

    const history = getHistory('595900000004');
    expect(history).toHaveLength(20);
    expect(history[0]?.content).toBe('m6');
    expect(history.at(-1)?.content).toBe('m25');
  });

  it('starts fresh after 24 hours without activity', () => {
    appendMessage('595900000005', 'user', 'hola');

    vi.setSystemTime(Date.now() + 24 * HOUR_MS);
    expect(getHistory('595900000005')).toHaveLength(1);

    vi.setSystemTime(Date.now() + 1);
    expect(getHistory('595900000005')).toEqual([]);
  });
});

describe('logConversation', () => {
  it('appends one JSON line with a timestamp', () => {
    logConversation({ phone: '595900000006', text: 'hola', steps: [], reply: '¡Hola!' });

    expect(appendFileSync).toHaveBeenCalledWith(
      'conversations.log',
      JSON.stringify({
        timestamp: '2026-11-24T15:00:00.000Z',
        phone: '595900000006',
        text: 'hola',
        steps: [],
        reply: '¡Hola!',
      }) + '\n',
    );
  });
});

describe('runInConversationQueue', () => {
  // Timers are real here (only Date is faked), so this lets every pending promise settle.
  const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

  const deferred = () => {
    let resolve = (): void => undefined;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  };

  it('runs messages of the same phone one at a time, in arrival order', async () => {
    const events: string[] = [];
    const firstTask = deferred();

    const first = runInConversationQueue('595900000010', async () => {
      events.push('first:start');
      await firstTask.promise;
      events.push('first:end');
      return 'first';
    });
    const second = runInConversationQueue('595900000010', () => {
      events.push('second:start');
      return Promise.resolve('second');
    });

    await flushPromises();
    expect(events).toEqual(['first:start']);

    firstTask.resolve();
    expect(await Promise.all([first, second])).toEqual(['first', 'second']);
    expect(events).toEqual(['first:start', 'first:end', 'second:start']);
  });

  it('keeps processing the queue after a failed message', async () => {
    const failed = runInConversationQueue('595900000011', () => Promise.reject(new Error('boom')));
    const next = runInConversationQueue('595900000011', () => Promise.resolve('ok'));

    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });

  it('does not make different phones wait for each other', async () => {
    const blocked = deferred();
    void runInConversationQueue('595900000012', () => blocked.promise);

    await expect(
      runInConversationQueue('595900000013', () => Promise.resolve('not blocked')),
    ).resolves.toBe('not blocked');
    blocked.resolve();
  });
});
