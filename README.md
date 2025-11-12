# WhatsApp Business API Bot

Bot de WhatsApp para envío automatizado de cursos y seguimiento de usuarios.

## Características
- Webhook para recibir mensajes de WhatsApp
- API de Meta WhatsApp Business
- Servidor Node.js + Express
- Gestión de procesos con PM2

## Configuración
- Puerto: 3001
- Webhook: /webhook
- Health check: /health

## Instalación
1. Clonar repositorio
2. `npm install`
3. Configurar variables de entorno
4. `pm2 start server.js`

## Variables de Entorno
- VERIFY_TOKEN: Token para verificación webhook
- PORT: Puerto del servidor (default: 3001)
