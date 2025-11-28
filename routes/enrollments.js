const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { sendWhatsAppMessage } = require('../services/whatsappService');

// Manual enrollment endpoint
router.post('/tenants/:tenantId/enroll-user', async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { phoneNumber, courseId, userName } = req.body;

    // 1. Find or create participant
    let participant = await db.oneOrNone(
      'SELECT id FROM participants WHERE phone_number = $1 AND tenant_id = $2',
      [phoneNumber, tenantId]
    );

    if (!participant) {
      participant = await db.one(
        `INSERT INTO participants (phone_number, tenant_id, name, created_at) 
         VALUES ($1, $2, $3, NOW()) RETURNING id`,
        [phoneNumber, tenantId, userName || null]
      );
    }

    // 2. Create enrollment (using your existing schema)
    const enrollment = await db.one(
      `INSERT INTO enrollments (participant_id, course_id, tenant_id, status, created_at) 
       VALUES ($1, $2, $3, 'active', NOW()) RETURNING id`,
      [participant.id, courseId, tenantId]
    );

    // 3. Send first course item
    await sendFirstCourseItem(enrollment.id, courseId, phoneNumber);

    res.json({
      success: true,
      message: 'User enrolled successfully',
      enrollmentId: enrollment.id
    });

  } catch (error) {
    console.error('Enrollment error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

async function sendFirstCourseItem(enrollmentId, courseId, phoneNumber) {
  // Get first course item
  const firstItem = await db.oneOrNone(
    `SELECT * FROM course_items 
     WHERE course_id = $1 
     ORDER BY item_order ASC 
     LIMIT 1`,
    [courseId]
  );

  if (!firstItem) {
    throw new Error('No items found in course');
  }

  // Send via WhatsApp
  await sendWhatsAppMessage(phoneNumber, formatCourseItem(firstItem));

  // Log delivery
  await db.none(
    `INSERT INTO delivery_log (enrollment_id, item_index, delivered_at) 
     VALUES ($1, $2, NOW())`,
    [enrollmentId, 0]
  );

  console.log(`First item sent to ${phoneNumber}`);
}

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

module.exports = router;