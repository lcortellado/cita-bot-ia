# Agente de IA en WhatsApp

Guía completa, paso a paso: https://www.tiktok.com/@anderbriz

## Archivos
- `agente.js`: el servidor del webhook (recibe desde WhatsApp y responde)
- `cerebro.js`: memoria, ficha del negocio, modelo y herramientas
- `agenda.js`: Cal.com (o agenda de demostración, sin cuenta)
- `negocio.md`: la ficha de TU negocio. Es el archivo que más vas a editar
- `simular.js`: conversa con el agente en la terminal, sin WhatsApp
- `probar.js`: la batería de pruebas que intenta romper el agente

## Ejecutar (Node 22 o 24)
1. Copia `.env.example` a `.env` y complétalo (para el simulador solo necesitas la OPENROUTER_API_KEY)
2. `npm run simular`   conversa en la terminal
3. `npm run probar`    corre la batería de pruebas
4. `npm start`         enciende el servidor del webhook (puerto 3000)

No necesitas `npm install`: el proyecto no tiene dependencias.
