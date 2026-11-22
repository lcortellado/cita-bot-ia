import { createBooking, getAvailableSlots } from '../bookings/booking.service.js';
import type { ToolDefinition } from './openrouter.client.js';

// Tool names, argument names, descriptions and result keys are the model contract.
// They stay in Spanish, like the prompt, and are mapped to the English domain API here.

export type ToolArguments = Record<string, unknown>;
export type ToolOutput = Record<string, unknown>;

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'ver_horarios',
      description: 'Lista los horarios libres de un día en la agenda.',
      parameters: {
        type: 'object',
        properties: {
          fecha: {
            type: 'string',
            description: 'Día en formato AAAA-MM-DD, tomado de la tabla de fechas.',
          },
        },
        required: ['fecha'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_agendamiento',
      description:
        'Aganda un horario. Solo usar después de que el cliente confirmó por escrito el servicio, el día y la hora.',
      parameters: {
        type: 'object',
        properties: {
          fecha: { type: 'string', description: 'AAAA-MM-DD' },
          hora: { type: 'string', description: 'HH:MM, exactamente como vino de ver_horarios' },
          nombre: { type: 'string', description: 'Nombre del cliente' },
          servicio: { type: 'string', description: 'Servicio de la ficha' },
        },
        required: ['fecha', 'hora', 'nombre', 'servicio'],
      },
    },
  },
];

const readString = (value: unknown): string => (typeof value === 'string' ? value : '');

export async function executeTool(
  customerPhone: string,
  toolName: string,
  args: ToolArguments,
): Promise<ToolOutput> {
  if (toolName === 'ver_horarios') {
    const result = await getAvailableSlots(customerPhone, readString(args.fecha));
    if ('error' in result) return result;
    return result.slots.length
      ? { fecha: result.date, libres: result.slots }
      : { fecha: result.date, libres: [], aviso: 'No hay horarios libres en este día.' };
  }

  if (toolName === 'crear_agendamiento') {
    const result = await createBooking(customerPhone, {
      date: readString(args.fecha),
      time: readString(args.hora),
      customerName: readString(args.nombre),
      service: readString(args.servicio),
    });
    if ('error' in result) return result;
    const confirmation = { ok: true, fecha: result.date, hora: result.time, id: result.id };
    return result.isDuplicate
      ? {
          ...confirmation,
          aviso: 'Este horario ya estaba agendado para esta persona. Nada fue duplicado.',
        }
      : confirmation;
  }

  return { error: `Herramienta desconocida: ${toolName}` };
}
