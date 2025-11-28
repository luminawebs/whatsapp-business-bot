const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'bot_user',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'whatsapp_learning',
  password: process.env.DB_PASSWORD || 's3cure_eduwpp%%21@u',
  port: process.env.DB_PORT || 5432,
});

const db = {
  query: (text, params) => pool.query(text, params),
  any: async (text, params) => {
    const res = await pool.query(text, params);
    return res.rows;
  },
  one: async (text, params) => {
    const res = await pool.query(text, params);
    if (res.rows.length !== 1) {
      throw new Error(`Expected one row, got ${res.rows.length}`);
    }
    return res.rows[0];
  },
  oneOrNone: async (text, params) => {
    const res = await pool.query(text, params);
    if (res.rows.length > 1) {
      throw new Error(`Expected at most one row, got ${res.rows.length}`);
    }
    return res.rows[0] || null;
  },
  none: async (text, params) => {
    await pool.query(text, params);
  },
};

module.exports = db;
