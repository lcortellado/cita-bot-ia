// Chat with the agent in the terminal, WITHOUT WhatsApp. Same agent as the webhook server.
// Run with: npm run simulate (only needs OPENROUTER_API_KEY; without Cal.com it uses the demo calendar).
import { createInterface } from 'node:readline/promises';
import { generateReply } from '../modules/agent/agent.service.js';
import { isApiKeyConfigured } from '../modules/agent/openrouter.client.js';
import { calendarName } from '../modules/bookings/booking.service.js';

const SIMULATOR_PHONE = '595981000000'; // fake number, only used as the memory key
const EXIT_COMMAND = 'exit';

if (!isApiKeyConfigured()) {
  console.error('Set OPENROUTER_API_KEY in the .env file.');
  process.exit(1);
}

const readline = createInterface({ input: process.stdin, output: process.stdout });
console.log(`Simulator · calendar: ${calendarName} · type "${EXIT_COMMAND}" to quit\n`);

for (;;) {
  let text: string;
  try {
    text = (await readline.question('you › ')).trim();
  } catch {
    break; // input ended (Ctrl+C or piped file)
  }
  if (!text) continue;
  if (text.toLowerCase() === EXIT_COMMAND) break;
  try {
    const { reply } = await generateReply(SIMULATOR_PHONE, text);
    console.log(`agent › ${reply}\n`);
  } catch (error) {
    console.error(`⚠ ${error instanceof Error ? error.message : String(error)}\n`);
  }
}
readline.close();
