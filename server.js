const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = express();
app.use(express.json());

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

// ===== NEW: DATABASE CONNECTION =====
let pool;
try {
  pool = new Pool({
    user: process.env.DB_USER || 'bot_user',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'whatsapp_learning',
    password: process.env.DB_PASSWORD || 's3cure_eduwpp%%21@u',
    port: process.env.DB_PORT || 5432,
  });
  console.log('✅ PostgreSQL connection configured');
} catch (error) {
  console.log('⚠️  Database connection failed, running in fallback mode');
  console.log('💡 Run: npm install pg bcryptjs jsonwebtoken');
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

// ===== ENHANCED WEBHOOK (STORES MESSAGES IN DB) =====
app.post('/webhook', async (req, res) => {
  console.log('📨 Mensaje recibido de WhatsApp');
  console.log(JSON.stringify(req.body, null, 2));
  
  // NEW: Store message in database if available
  if (pool) {
    try {
      const body = req.body;
      if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
        const message = body.entry[0].changes[0].value.messages[0];
        const from = message.from;
        
        await pool.query(
          `INSERT INTO messages_log (tenant_id, phone_message_id, direction, payload) 
           VALUES ($1, $2, $3, $4)`,
          ['default-tenant', message.id, 'in', body]
        );
        
        console.log(`💾 Mensaje guardado en base de datos de: ${from}`);
      }
    } catch (dbError) {
      console.log('⚠️  No se pudo guardar en BD, pero el webhook funciona:', dbError.message);
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
  if (pool) {
    try {
      await pool.query('SELECT 1');
      health.database = 'connected';
    } catch (error) {
      health.database = 'disconnected';
      health.db_error = error.message;
    }
  } else {
    health.database = 'not_configured';
  }
  
  res.json(health);
});

// ===== NEW: ADMIN AUTH ENDPOINTS =====
app.post('/api/admin/login', async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: 'Database not available' });
  }
  
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


// ===== WEEK 2: COURSE MANAGEMENT API =====

// Get all courses for a tenant
app.get('/api/tenant/:tenantId/courses', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not available' });
  
  try {
    const { tenantId } = req.params;
    const result = await pool.query(
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
  if (!pool) return res.status(503).json({ error: 'Database not available' });
  
  try {
    const { tenantId } = req.params;
    const { title, description, passing_score } = req.body;
    
    const result = await pool.query(
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
  if (!pool) return res.status(503).json({ error: 'Database not available' });
  
  try {
    const { courseId } = req.params;
    const { type, title, content_url, metadata, required, idx } = req.body;
    
    // Get tenant_id from course for security
    const courseCheck = await pool.query(
      'SELECT tenant_id FROM courses WHERE id = $1',
      [courseId]
    );
    
    if (courseCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }
    
    const tenantId = courseCheck.rows[0].tenant_id;
    
    const result = await pool.query(
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
  if (!pool) return res.status(503).json({ error: 'Database not available' });
  
  try {
    const { courseId } = req.params;
    
    const courseResult = await pool.query(
      'SELECT * FROM courses WHERE id = $1',
      [courseId]
    );
    
    if (courseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }
    
    const itemsResult = await pool.query(
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


// ===== INITIALIZE DEFAULT DATA =====
async function initializeDefaultData() {
  if (!pool) return;
  
  try {
    // Check if we have any tenants
    const tenantResult = await pool.query('SELECT * FROM tenants LIMIT 1');
    
    if (tenantResult.rows.length === 0) {
      console.log('🔧 Initializing default tenant and admin...');
      
      // Create default tenant
      const newTenant = await pool.query(
        'INSERT INTO tenants (name, contact_email) VALUES ($1, $2) RETURNING *',
        ['Default Tenant', 'admin@example.com']
      );
      
      const tenantId = newTenant.rows[0].id;
      
      // Create default admin user (with proper password hash)
      const passwordHash = await bcrypt.hash('admin123', 10);
      await pool.query(
        'INSERT INTO users (tenant_id, email, password_hash, role) VALUES ($1, $2, $3, $4)',
        [tenantId, 'admin@example.com', passwordHash, 'admin']
      );
      
      console.log('✅ Default tenant and admin user created');
      console.log(`📧 Admin login: admin@example.com / admin123`);
      console.log(`🔑 Tenant ID: ${tenantId}`);
    } else {
      console.log('✅ Default data already initialized');
    }
  } catch (error) {
    console.log('⚠️ Could not initialize default data:', error.message);
  }
}

// ===== YOUR EXISTING SERVER STARTUP =====
const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 WhatsApp Bot ejecutándose en puerto ${PORT}`);
    console.log(`🛡️  Health check: http://localhost:${PORT}/health`);
    
    // NEW: Initialize data on startup
    // await initializeDefaultData();
  });
}

module.exports = app;