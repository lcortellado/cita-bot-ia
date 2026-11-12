// simular.js: conversa con el agente en la terminal, SIN WhatsApp. Es el mismo cerebro del agente.js.
// Ejecutar con:  npm run simular      (solo necesita OPENROUTER_API_KEY en el .env; sin Cal.com usa la agenda de demostración)
import { createInterface } from 'node:readline/promises';
import { responder, claveOk } from './cerebro.js';
import { modoAgenda } from './agenda.js';

if (!claveOk()) {
  console.error('Completa la OPENROUTER_API_KEY en el archivo .env (paso 3).');
  process.exit(1);
}
const tel = '595981000000'; // un número inventado solo para la memoria del simulador
const rl = createInterface({ input: process.stdin, output: process.stdout });
console.log(`Simulador · agenda: ${modoAgenda} · escribe "salir" para cerrar\n`);
for (;;) {
  let texto;
  try { texto = (await rl.question('tú › ')).trim(); } catch { break; } // la entrada terminó (Ctrl+C o archivo)
  if (!texto) continue;
  if (texto.toLowerCase() === 'salir') break;
  try {
    console.log(`agente › ${await responder(tel, texto)}\n`);
  } catch (e) {
    console.error(`⚠ ${e.message}\n`);
  }
}
rl.close();
