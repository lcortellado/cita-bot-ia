// agenda.js: paso 6. Sin CAL_API_KEY en el .env, corre una agenda de DEMOSTRACIÓN en memoria (para probar en terminal).
// Con CAL_API_KEY y CAL_EVENT_TYPE_ID, usa la API v2 de Cal.com de verdad.
const CAL = 'https://api.cal.com/v2';

// ---------------------------------------------------------------- agenda de demostración
const demoAgendados = new Set();
const demo = {
  async horariosLibres(fecha) {
    const [a, m, d] = fecha.split('-').map(Number);
    const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay(); // 0 = domingo
    if (dia === 0 || dia === 1) return [];                   // cerrado domingo y lunes (igual que la ficha de ejemplo)
    const todos = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:30', '18:00'];
    return todos.filter((h, i) => (d + i) % 3 !== 0 && !demoAgendados.has(`${fecha} ${h}`));
  },
  async agendar({ fecha, hora }) {
    demoAgendados.add(`${fecha} ${hora}`);
    return { id: `demo-${fecha}-${hora}` };
  },
};

// ---------------------------------------------------------------- Cal.com (API v2)
const cabecera = (version) => ({
  Authorization: `Bearer ${process.env.CAL_API_KEY}`,
  'cal-api-version': version,
  'Content-Type': 'application/json',
});
const horaLocal = (iso, fuso) =>
  new Intl.DateTimeFormat('es-PY', { timeZone: fuso, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

// desplazamiento de zona horaria ese día, ej.: "-04:00" (sin librería de fechas)
function offset(fecha, fuso) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: fuso, timeZoneName: 'longOffset' }).formatToParts(new Date(`${fecha}T12:00:00Z`));
  const o = p.find((x) => x.type === 'timeZoneName').value.replace('GMT', '');
  return o === '' ? '+00:00' : o;
}

const calcom = {
  async horariosLibres(fecha, fuso) {
    const o = offset(fecha, fuso);
    const q = new URLSearchParams({
      eventTypeId: process.env.CAL_EVENT_TYPE_ID,
      start: new Date(`${fecha}T00:00:00${o}`).toISOString(), // Cal.com pide inicio y fin en UTC
      end: new Date(`${fecha}T23:59:59${o}`).toISOString(),
      timeZone: fuso,
    });
    const r = await fetch(`${CAL}/slots?${q}`, { headers: cabecera('2024-09-04') });
    const j = await r.json();
    if (!r.ok) throw new Error(`Cal.com slots ${r.status}: ${JSON.stringify(j.error ?? j)}`);
    return Object.values(j.data ?? {}).flat().map((s) => horaLocal(s.start, fuso));
  },
  async agendar({ fecha, hora, nombre, servicio, telefono, fuso }) {
    const inicio = new Date(`${fecha}T${hora}:00${offset(fecha, fuso)}`).toISOString(); // Cal.com pide el inicio en UTC
    const cuerpo = {
      start: inicio,
      eventTypeId: Number(process.env.CAL_EVENT_TYPE_ID),
      attendee: {
        name: nombre,
        // WhatsApp no trae email: en Cal.com deja el teléfono obligatorio y el email opcional en el tipo de evento
        ...(process.env.CAL_EMAIL_PREDETERMINADO ? { email: process.env.CAL_EMAIL_PREDETERMINADO } : {}),
        timeZone: fuso,
        phoneNumber: `+${telefono.replace(/\D/g, '')}`,
        language: 'es',
      },
      bookingFieldsResponses: { notes: `${servicio} · agendado por WhatsApp` },
    };
    const r = await fetch(`${CAL}/bookings`, { method: 'POST', headers: cabecera('2026-02-25'), body: JSON.stringify(cuerpo) });
    const j = await r.json();
    if (!r.ok) throw new Error(`Cal.com booking ${r.status}: ${JSON.stringify(j.error ?? j)}`);
    return { id: j.data?.uid ?? j.data?.id };
  },
};

export const agenda = process.env.CAL_API_KEY ? calcom : demo;
export const modoAgenda = process.env.CAL_API_KEY ? 'Cal.com' : 'demostración (sin Cal.com)';
