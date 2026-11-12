// agente.js: paso 2 y paso 8. El servidor que Meta llama (webhook) y que responde por WhatsApp.
// Ejecutar con:  npm start   (lee el .env con --env-file de Node 20.6+)
import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { responderEnCola } from './cerebro.js';
import { modoAgenda } from './agenda.js';

const PUERTO = Number(process.env.PUERTO || 3000);
const GRAPH = `https://graph.facebook.com/${process.env.GRAPH_VERSION || 'v25.0'}`;
const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET } = process.env;

for (const k of ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_VERIFY_TOKEN']) {
  if (!process.env[k]) console.warn(`⚠ falta ${k} en el .env`);
}
if (!WHATSAPP_APP_SECRET) console.warn('⚠ sin WHATSAPP_APP_SECRET: la firma del webhook NO está siendo verificada (obligatorio en producción)');

// ---------------------------------------------------------------- enviar por WhatsApp
async function graph(cuerpo) {
  const r = await fetch(`${GRAPH}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...cuerpo }),
  });
  if (!r.ok) console.error('WhatsApp', r.status, await r.text());
}
const enviarTexto = (para, texto) => graph({ recipient_type: 'individual', to: para, type: 'text', text: { body: texto } });
// marca como leído y muestra "escribiendo…" hasta que salga la respuesta (desaparece solo en 25 s)
const marcarComoLeido = (id) => graph({ status: 'read', message_id: id, typing_indicator: { type: 'text' } });

// ---------------------------------------------------------------- seguridad: la URL es pública, así que verifica quién envió
function firmaValida(bruto, cabecera) {
  if (!WHATSAPP_APP_SECRET) return true;
  const esperado = 'sha256=' + createHmac('sha256', WHATSAPP_APP_SECRET).update(bruto).digest('hex');
  const a = Buffer.from(esperado), b = Buffer.from(cabecera || '');
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------------------------------------------------------------- mensajes: sin duplicar
const vistos = new Set(); // Meta puede reenviar el mismo mensaje: guarda los ids ya tratados

async function tratar(msg) {
  if (vistos.has(msg.id)) return;
  vistos.add(msg.id);
  if (vistos.size > 5000) vistos.delete(vistos.values().next().value);
  const tel = msg.from;
  try {
    await marcarComoLeido(msg.id);
    if (msg.type !== 'text') return await enviarTexto(tel, 'Por ahora solo puedo leer mensajes de texto. ¿Me escribes? 🙂');
    const respuesta = await responderEnCola(tel, msg.text.body); // de a uno por persona
    await enviarTexto(tel, respuesta);
    console.log(`💬 ${tel}: ${msg.text.body}\n🤖 ${respuesta}\n`);
  } catch (e) {
    console.error('error al responder', tel, e);
  }
}

// ---------------------------------------------------------------- el servidor
createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Meta verifica tu webhook una vez, con un GET
  if (req.method === 'GET' && url.pathname === '/webhook') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === WHATSAPP_VERIFY_TOKEN;
    res.writeHead(ok ? 200 : 403).end(ok ? url.searchParams.get('hub.challenge') : 'token incorrecto');
    return;
  }

  // cada mensaje nuevo llega en un POST
  if (req.method === 'POST' && url.pathname === '/webhook') {
    const partes = [];
    req.on('data', (p) => partes.push(p));
    req.on('end', () => {
      const bruto = Buffer.concat(partes);
      if (!firmaValida(bruto, req.headers['x-hub-signature-256'])) {
        res.writeHead(401).end();
        return;
      }
      res.writeHead(200).end(); // responde ya: Meta reenvía si tardas
      let cuerpo;
      try { cuerpo = JSON.parse(bruto); } catch { return; }
      for (const e of cuerpo.entry ?? []) for (const c of e.changes ?? []) for (const m of c.value?.messages ?? []) tratar(m);
      // c.value.statuses (enviado, entregado, leído) llega aquí también y se ignora a propósito
    });
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('agente funcionando');
}).listen(PUERTO, () => console.log(`✅ agente escuchando en el puerto ${PUERTO} · agenda: ${modoAgenda}`));
