const path = require('path');
// Try to load .env from current dir, then from root project dir
require('dotenv').config();
if (!process.env.WHATSAPP_ACCESS_TOKEN) {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
}
const express = require('express');
const db = require('./config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendWhatsAppMessage, sendWhatsAppButtonMessage } = require('./services/whatsappService');
const app = express();
app.use(express.json());
// Serve static files from 'public' directory
app.use(express.static('public'));

// Import the new routes
const enrollmentRoutes = require('./routes/enrollments');
const dashboardRoutes = require('./routes/dashboard');
const courseRoutes = require('./routes/courses');

// Register routes
app.use('/api', enrollmentRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', courseRoutes);

// ===== YOUR EXISTING CONFIG (KEEP THIS) =====
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "whatsapp_bot_token_fijo_123";
const _isDefaultVerifyToken = VERIFY_TOKEN === "whatsapp_bot_token_fijo_123";

console.log('🌐 Webhook endpoint: /webhook (port ' + (process.env.PORT || 3001) + ')');
console.log('💻 RAM: OPTIMIZADA para 512MB');
console.log('=====================================');

// ===== CREDENTIAL CHECK =====
if (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_ID) {
  console.log('\n⚠️  MISSING WHATSAPP CREDENTIALS ⚠️');
  console.log('   The bot is running in SIMULATION mode.');
  console.log('   To enable real messaging, set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_ID in your .env file.');
  console.log('   (See .env.example for details)\n');
} else {
  console.log('\n✅ WhatsApp Credentials found. Running in REAL mode.');
}

// ===== NEW: NEXT COMMAND HANDLER =====
async function handleNextCommand(phoneNumber) {
  try {
    console.log(`🔄 Processing "next" command from ${phoneNumber}`);

    // Find participant's active enrollment
    const enrollment = await db.oneOrNone(`
      SELECT e.*, p.tenant_id 
      FROM enrollments e
      JOIN participants p ON e.participant_id = p.id
      WHERE p.phone_e164 = $1 AND e.status = 'active'
      LIMIT 1
    `, [phoneNumber]);

    if (!enrollment) {
      await sendWhatsAppMessage(phoneNumber, "You don't have an active course. Contact admin.");
      return;
    }

    // Get current progress from delivery_log
    const currentProgress = await db.oneOrNone(`
      SELECT MAX(item_index) as current_index 
      FROM delivery_log 
      WHERE enrollment_id = $1 AND user_responded_at IS NOT NULL
    `, [enrollment.id]);

    const nextItemIndex = (currentProgress?.current_index || 0) + 1;

    // Get next item
    const nextItem = await db.oneOrNone(`
      SELECT * FROM course_items 
      WHERE course_id = $1 
      ORDER BY item_order ASC 
      LIMIT 1 OFFSET $2
    `, [enrollment.course_id, nextItemIndex]);

    if (nextItem) {
      const bodyText = formatCourseItem(nextItem);
      const useAcceptButton = process.env.SEND_ACCEPT_BUTTON === 'true' || process.env.SEND_ACCEPT_BUTTON === '1';
      if (useAcceptButton) {
        await sendWhatsAppButtonMessage(phoneNumber, bodyText, [{ id: 'next', title: 'Next' }], { footer: 'Or reply NEXT to continue' });
      } else {
        await sendWhatsAppMessage(phoneNumber, bodyText);
      }

      // Log delivery: mark previous item as responded
      if (nextItemIndex > 0) {
        await db.none(
          `UPDATE delivery_log 
           SET user_responded_at = NOW() 
           WHERE enrollment_id = $1 AND item_index = $2`,
          [enrollment.id, nextItemIndex - 1]
        );
      }

      await db.none(
        `INSERT INTO delivery_log (enrollment_id, item_index, delivered_at) 
         VALUES ($1, $2, NOW())`,
        [enrollment.id, nextItemIndex]
      );

      console.log(`📚 Sent item ${nextItemIndex} to ${phoneNumber}`);

    } else {
      // Course completed!
      await sendWhatsAppMessage(phoneNumber, "🎉 Congratulations! You've completed the course!");

      await db.none(
        `UPDATE enrollments 
         SET status = 'completed', completed_at = NOW() 
         WHERE id = $1`,
        [enrollment.id]
      );

      // Mark last item as responded
      await db.none(
        `UPDATE delivery_log 
         SET user_responded_at = NOW() 
         WHERE enrollment_id = $1 AND item_index = $2`,
        [enrollment.id, nextItemIndex - 1]
      );

      console.log(`✅ Course completed by ${phoneNumber}`);
    }

  } catch (error) {
    console.error('Next command error:', error);
    await sendWhatsAppMessage(phoneNumber, "Sorry, there was an error. Please try again.");
  }
}

// Helper function to format course items
function formatCourseItem(item) {
  switch (item.type) {
    case 'text':
      return item.content_url;
    case 'image':
      return `${item.content_url}\n\n[Image]`;
    case 'audio':
      return `${item.content_url}\n\n[Audio]`;
    case 'video':
      return `${item.content_url}\n\n[Video]`;
    default:
      return item.content_url;
  }
}


// ===== AUTO-CREATE DEFAULT TENANT =====
async function ensureDefaultTenant() {
  try {
    let defaultTenant = await db.oneOrNone(
      'SELECT id FROM tenants WHERE name = $1 LIMIT 1',
      ['Default System Tenant']
    );

    if (!defaultTenant) {
      defaultTenant = await db.one(
        `INSERT INTO tenants (name, contact_email, created_at) 
         VALUES ($1, $2, NOW()) RETURNING id`,
        ['Default System Tenant', 'system@whatsapp-learning.com']
      );
      console.log('✅ Created default system tenant:', defaultTenant.id);
    } else {
      console.log('✅ Default tenant already exists:', defaultTenant.id);
    }

    return defaultTenant.id;
  } catch (error) {
    console.log('⚠️ Could not ensure default tenant:', error.message);
    return null;
  }
}

// ===== TENANT DETECTION FOR WEBHOOK =====
async function detectTenantFromPhone(phoneNumber) {
  try {
    // Look for participant with this phone number
    const participant = await db.oneOrNone(
      'SELECT tenant_id FROM participants WHERE phone_e164 = $1 LIMIT 1',
      [phoneNumber]
    );

    if (participant) {
      return participant.tenant_id;
    }

    // Fallback to default tenant
    return await ensureDefaultTenant();
  } catch (error) {
    console.log('Tenant detection failed, using default');
    return await ensureDefaultTenant();
  }
}


// ===== YOUR EXISTING WEBHOOK (KEEP THIS) =====
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

// ----- Accept / Next: support both keyword and button (common in course bots) -----
const NEXT_KEYWORD = 'next';
const ACCEPT_KEYWORDS = ['accept', 'yes', 'sí', 'si', 'start', 'ok', 'oke', '1', 'continue', 'siguiente'];
const ACCEPT_BUTTON_IDS = ['accept', 'yes', 'next', 'continue', 'si', 'siguiente'];

function normalizeInput(textOrId) {
  return (textOrId || '').toLowerCase().trim();
}
function isNextCommand(text, buttonId) {
  if (normalizeInput(text) === NEXT_KEYWORD) return true;
  if (buttonId && ACCEPT_BUTTON_IDS.includes(normalizeInput(buttonId))) return true;
  return false;
}
function isAcceptCommand(text, buttonId) {
  if (isNextCommand(text, buttonId)) return true;
  if (text && ACCEPT_KEYWORDS.includes(normalizeInput(text))) return true;
  if (buttonId && ACCEPT_BUTTON_IDS.includes(normalizeInput(buttonId))) return true;
  return false;
}

// ===== ENHANCED WEBHOOK (PROCESSES MESSAGES + MESSAGE STATUS) =====
app.post('/webhook', async (req, res) => {
  const value = req.body.entry?.[0]?.changes?.[0]?.value;
  const field = req.body.entry?.[0]?.changes?.[0]?.field;

  // Message status updates (delivered, read, failed) – log to see why a message might not arrive
  if (field === 'message_status' && value?.statuses) {
    value.statuses.forEach((s) => {
      console.log(`📬 [STATUS] message_id=${s.id} to ${s.recipient_id} status=${s.status}${s.errors ? ' errors=' + JSON.stringify(s.errors) : ''}`);
    });
    return res.sendStatus(200);
  }

  if (!value?.messages) {
    return res.sendStatus(200);
  }

  console.log('📨 Mensaje recibido de WhatsApp');
  const message = value.messages[0];
  const from = message.from;
  let text = message.text?.body || '';
  let buttonId = null;
  let buttonTitle = null;

  if (message.type === 'interactive' && message.interactive?.type === 'button_reply') {
    const br = message.interactive.button_reply;
    buttonId = br?.id || '';
    buttonTitle = br?.title || '';
    if (!text) text = buttonId || buttonTitle;
    console.log(`🔘 Button from ${from}: id="${buttonId}" title="${buttonTitle}"`);
  } else {
    console.log(`💬 Message from ${from}: "${text}"`);
  }

  const tenantId = await detectTenantFromPhone(from);

  // Process "next" or "accept" (keyword or button)
  if (isAcceptCommand(text, buttonId)) {
    await handleNextCommand(from);
  }

  try {
    if (tenantId) {
      await db.query(
        `INSERT INTO messages_log (tenant_id, phone_message_id, direction, payload) 
         VALUES ($1, $2, $3, $4)`,
        [tenantId, message.id, 'in', req.body]
      );
      console.log(`💾 Message saved for tenant: ${tenantId}`);
    }
  } catch (dbError) {
    console.log('⚠️ Could not save message to DB:', dbError.message);
  }

  res.sendStatus(200);
});

// ===== YOUR EXISTING HEALTH CHECK (ENHANCED) =====
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  };

  // NEW: Add database status
  try {
    await db.query('SELECT 1');
    health.database = 'connected';
  } catch (error) {
    health.database = 'disconnected';
    health.db_error = error.message;
  }

  res.json(health);
});

// ===== NEW: ADMIN AUTH ENDPOINTS =====
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // For now, simple auth - we'll enhance this later
    if (email === 'admin@example.com' && password === 'admin123') {
      const token = jwt.sign(
        { email: 'admin@example.com' },
        process.env.JWT_SECRET || 'default_jwt_secret',
        { expiresIn: '24h' }
      );

      res.json({
        token,
        user: { email: 'admin@example.com', role: 'admin' }
      });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== TEMPORARY: TEST ENDPOINTS (bypass permissions) =====

// Test tenant setup
app.post('/api/test/setup', async (req, res) => {
  try {
    // Check if we have any tenants
    const tenantResult = await db.query('SELECT id, name FROM tenants LIMIT 1');

    if (tenantResult.rows.length > 0) {
      return res.json({
        message: 'Tenant already exists',
        tenant: tenantResult.rows[0]
      });
    }

    // Try to create a tenant with proper UUID generation
    const newTenant = await db.query(
      'INSERT INTO tenants (name, contact_email) VALUES ($1, $2) RETURNING *',
      ['Test Business', 'admin@example.com']
    );

    res.json({
      message: 'Test tenant created',
      tenant: newTenant.rows[0]
    });

  } catch (error) {
    res.status(500).json({
      error: 'Cannot create tenant',
      details: error.message,
      workaround: 'Database permissions issue - using fallback'
    });
  }
});

// Test course creation with UUID-compatible tenant ID
app.post('/api/test/courses', async (req, res) => {
  try {
    const { title, description, passing_score } = req.body;

    // Use a UUID-compatible test ID
    const tenantId = '12345678-1234-1234-1234-123456789012';

    const result = await db.query(
      `INSERT INTO courses (tenant_id, title, description, passing_score) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [tenantId, title, description, passing_score || 70]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Test course creation error:', error);
    res.status(500).json({ error: 'Failed to create test course', details: error.message });
  }
});

// Add this test endpoint to your server.js (after the other test endpoints)
app.post('/api/test/simple', async (req, res) => {
  try {
    // Just test a simple SELECT query
    const testResult = await db.query('SELECT COUNT(*) as count FROM courses');

    res.json({
      message: 'Database query successful',
      courseCount: parseInt(testResult.rows[0].count),
      canRead: true
    });

  } catch (error) {
    res.status(500).json({
      error: 'Database query failed',
      details: error.message,
      canRead: false
    });
  }
});

// Test: Get all courses (no tenant filter)
app.get('/api/test/courses', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM courses ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Get test courses error:', error);
    res.status(500).json({ error: 'Failed to fetch courses', details: error.message });
  }
});

// (Course routes moved to routes/courses.js)

// ===== YOUR EXISTING SERVER STARTUP =====
const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 WhatsApp Bot ejecutándose en puerto ${PORT}`);
    console.log(`🛡️  Health check: http://localhost:${PORT}/health`);

    // NEW: Ensure default tenant exists on startup
    await ensureDefaultTenant();
  });
}

module.exports = app;
