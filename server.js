const express = require('express');
const app = express();
app.use(express.json());

// Token de verificación (preferir variable de entorno en producción)
// You can set VERIFY_TOKEN in environment (recommended). If not set, a fixed token is used for local/dev convenience.
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "whatsapp_bot_token_fijo_123";
const _isDefaultVerifyToken = VERIFY_TOKEN === "whatsapp_bot_token_fijo_123";


console.log('🔧 ===== WHATSAPP BOT INSTALADO =====');
if (_isDefaultVerifyToken) {
  console.log('⚠️  WARNING: Using default built-in verification token. Set VERIFY_TOKEN env var for production.');
} else {
  console.log('🔑 Token de verificación: [PROVIDED]');
}
//console.log('🌐 Webhook URL: http://' + require('os').hostname() + ':3001/webhook');
console.log('🌐 Webhook endpoint: /webhook (port ' + (process.env.PORT || 3001) + ')');

console.log('💻 RAM: OPTIMIZADA para 512MB');
console.log('=====================================');

// Verificación webhook (GET)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('🔍 Intento de verificación webhook');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verificado exitosamente');
    res.send(challenge);
  } else {
    console.log('❌ Verificación fallida');
    res.sendStatus(403);
  }
});

// Recibir mensajes (POST)
app.post('/webhook', (req, res) => {
  console.log('📨 Mensaje recibido de WhatsApp');
  console.log(JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Export app for testing. When run directly, start the server.
const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 WhatsApp Bot ejecutándose en puerto ${PORT}`);
    console.log(`🛡️  Health check: http://localhost:${PORT}/health`);
  });
}

module.exports = app;
