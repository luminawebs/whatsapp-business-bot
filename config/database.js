const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'bot_user',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'whatsapp_learning',
  password: process.env.DB_PASSWORD || 's3cure_eduwpp%%21@u',
  port: process.env.DB_PORT || 5432,
});

module.exports = pool;