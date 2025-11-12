const express = require('express');
const app = express();
app.use(express.json());

// Token de verificación (seguro y único)
//const VERIFY_TOKEN = "whatsapp_bot_" + require('crypto').randomBytes(8).toString('hex');
const VERIFY_TOKEN = "whatsapp_bot_token_fijo_123";


console.log('🔧 ===== WHATSAPP BOT INSTALADO =====');
console.log('🔑 Token de verificación:', VERIFY_TOKEN);
//console.log('🌐 Webhook URL: http://' + require('os').hostname() + ':3001/webhook');
console.log('🌐 Webhook URL: http://138.68.47.117:3001/webhook');

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

const PORT = 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 WhatsApp Bot ejecutándose en puerto ${PORT}`);
  console.log(`🛡️  Health check: http://localhost:${PORT}/health`);
});
