const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Simple active users endpoint
router.get('/tenants/:tenantId/active-users', async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    const activeUsers = await db.any(`
      SELECT 
        p.phone_e164 as phone_number,
        p.name,
        c.title as course_title,
        e.status,
        e.approved_at as completed_at,
        (SELECT COUNT(*) FROM course_items WHERE course_id = c.id) as total_items,
        (SELECT COUNT(DISTINCT item_index) FROM delivery_log dl WHERE dl.enrollment_id = e.id AND dl.user_responded_at IS NOT NULL) as completed_items
      FROM enrollments e
      JOIN participants p ON e.participant_id = p.id
      JOIN courses c ON e.course_id = c.id
      WHERE p.tenant_id = $1
      ORDER BY e.created_at DESC
    `, [tenantId]);

    res.json({ success: true, users: activeUsers });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;