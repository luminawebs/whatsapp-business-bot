const express = require('express');
const db = require('./config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendWhatsAppMessage } = require('./services/whatsappService');
const app = express();
app.use(express.json());

// Import the new routes
const enrollmentRoutes = require('./routes/enrollments');
const dashboardRoutes = require('./routes/dashboard');

// Register routes
app.use('/api', enrollmentRoutes);
app.use('/api', dashboardRoutes);

// ===== YOUR EXISTING CONFIG (KEEP THIS) =====
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "whatsapp_bot_token_fijo_123";
const _isDefaultVerifyToken = VERIFY_TOKEN === "whatsapp_bot_token_fijo_123";

console.log('🔧 ===== WHATSAPP BOT INSTALADO =====');
if (_isDefaultVerifyToken) {
  console.log('⚠️  WARNING: Using default built-in verification token. Set VERIFY_TOKEN env var for production.');
} else {
  console.log('🔑 Token de verificación: [PROVIDED]');
}
console.log('🌐 Webhook endpoint: /webhook (port ' + (process.env.PORT || 3001) + ')');
console.log('💻 RAM: OPTIMIZADA para 512MB');
console.log('=====================================');



// ===== NEW: NEXT COMMAND HANDLER =====
async function handleNextCommand(phoneNumber) {
  try {
    console.log(`🔄 Processing "next" command from ${phoneNumber}`);

    // Find participant's active enrollment
    const enrollment = await db.oneOrNone(`
      SELECT e.*, p.tenant_id 
      FROM enrollments e
      JOIN participants p ON e.participant_id = p.id
      WHERE p.phone_number = $1 AND e.status = 'active'
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

    const nextItemIndex = (currentProgress?.current_index || -1) + 1;

    // Get next item
    const nextItem = await db.oneOrNone(`
      SELECT * FROM course_items 
      WHERE course_id = $1 
      ORDER BY item_order ASC 
      LIMIT 1 OFFSET $2
    `, [enrollment.course_id, nextItemIndex]);

    if (nextItem) {
      // Send next item
      await sendWhatsAppMessage(phoneNumber, formatCourseItem(nextItem));

      // Log delivery (mark previous response and new delivery)
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

      // Mark final response
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
      return item.content;
    case 'image':
      return `${item.content}\n\n[Image]`;
    case 'audio':
      return `${item.content}\n\n[Audio]`;
    case 'video':
      return `${item.content}\n\n[Video]`;
    default:
      return item.content;
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

// ===== ENHANCED WEBHOOK (PROCESSES NEXT COMMANDS) =====
// ===== ENHANCED WEBHOOK (WITH TENANT DETECTION) =====
app.post('/webhook', async (req, res) => {
  console.log('📨 Mensaje recibido de WhatsApp');
  
  if (req.body.entry && req.body.entry[0].changes && req.body.entry[0].changes[0].value.messages) {
    const message = req.body.entry[0].changes[0].value.messages[0];
    const from = message.from;
    const text = message.text?.body || '';

    console.log(`💬 Message from ${from}: "${text}"`);

    // Detect or use default tenant
    const tenantId = await detectTenantFromPhone(from);

    // Process "next" command
    if (text && text.toLowerCase().trim() === 'next') {
      await handleNextCommand(from);
    }

    // Store message with proper tenant
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

// ===== WEEK 2: COURSE MANAGEMENT API =====

// Get all courses for a tenant
app.get('/api/tenant/:tenantId/courses', async (req, res) => {
  try {
    const { tenantId } = req.params;
    const result = await db.query(
      'SELECT * FROM courses WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
});

// Create a new course
app.post('/api/tenant/:tenantId/courses', async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { title, description, passing_score } = req.body;

    const result = await db.query(
      `INSERT INTO courses (tenant_id, title, description, passing_score) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [tenantId, title, description, passing_score || 70]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create course error:', error);
    res.status(500).json({ error: 'Failed to create course' });
  }
});

// Add content item to course
app.post('/api/courses/:courseId/items', async (req, res) => {
  try {
    const { courseId } = req.params;
    const { type, title, content_url, metadata, required, idx } = req.body;

    // Get tenant_id from course for security
    const courseCheck = await db.query(
      'SELECT tenant_id FROM courses WHERE id = $1',
      [courseId]
    );

    if (courseCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const tenantId = courseCheck.rows[0].tenant_id;

    const result = await db.query(
      `INSERT INTO course_items (course_id, tenant_id, idx, type, title, content_url, metadata, required) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [courseId, tenantId, idx, type, title, content_url, metadata, required !== false]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Add course item error:', error);
    res.status(500).json({ error: 'Failed to add course item' });
  }
});

// Get course with items
app.get('/api/courses/:courseId', async (req, res) => {
  try {
    const { courseId } = req.params;

    const courseResult = await db.query(
      'SELECT * FROM courses WHERE id = $1',
      [courseId]
    );

    if (courseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const itemsResult = await db.query(
      'SELECT * FROM course_items WHERE course_id = $1 ORDER BY idx',
      [courseId]
    );

    res.json({
      ...courseResult.rows[0],
      items: itemsResult.rows
    });
  } catch (error) {
    console.error('Get course error:', error);
    res.status(500).json({ error: 'Failed to fetch course' });
  }
});

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
