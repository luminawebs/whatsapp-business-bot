const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Try to load whatsappService, but provide fallback if missing
let sendWhatsAppMessage, sendWhatsAppButtonMessage;
try {
  const whatsappService = require('../services/whatsappService');
  sendWhatsAppMessage = whatsappService.sendWhatsAppMessage;
  sendWhatsAppButtonMessage = whatsappService.sendWhatsAppButtonMessage;
} catch (error) {
  console.log('⚠️  whatsappService not available, using fallback');
  sendWhatsAppMessage = async (phoneNumber, message) => {
    console.log(`📤 [FALLBACK] To: ${phoneNumber}`);
    console.log(`📤 Message: ${message}`);
    return { success: true, simulated: true };
  };
  sendWhatsAppButtonMessage = async () => ({ success: true, simulated: true });
}

// Manual enrollment endpoint
router.post('/tenants/:tenantId/enroll-user', async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { phoneNumber, courseId, userName, sendWithStartButton } = req.body;

    // 1. Find or create participant (using phone_e164 column)
    let participant = await db.oneOrNone(
      'SELECT id FROM participants WHERE phone_e164 = $1 AND tenant_id = $2',
      [phoneNumber, tenantId]
    );

    if (!participant) {
      participant = await db.one(
        `INSERT INTO participants (phone_e164, tenant_id, name, created_at) 
         VALUES ($1, $2, $3, NOW()) RETURNING id`,
        [phoneNumber, tenantId, userName || null]
      );
    }

    // 2. Create enrollment (using your existing schema)
    const enrollment = await db.one(
      `INSERT INTO enrollments (participant_id, course_id, tenant_id, status, enrolled_at) 
       VALUES ($1, $2, $3, 'active', NOW()) RETURNING id`,
      [participant.id, courseId, tenantId]
    );

    // 3. Send first course item (optionally with Start button)
    const sendResult = await sendFirstCourseItem(enrollment.id, courseId, phoneNumber, !!sendWithStartButton);

    res.json({
      success: true,
      message: 'User enrolled successfully',
      enrollmentId: enrollment.id,
      whatsappSent: sendResult.sent,
      whatsappError: sendResult.error || null
    });

  } catch (error) {
    console.error('Enrollment error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

async function sendFirstCourseItem(enrollmentId, courseId, phoneNumber, withStartButton = false) {
  const firstItem = await db.oneOrNone(
    `SELECT * FROM course_items 
     WHERE course_id = $1 
     ORDER BY item_order ASC 
     LIMIT 1`,
    [courseId]
  );

  if (!firstItem) {
    console.error('[ENROLL] No course items found for courseId=', courseId);
    throw new Error('No items found in course. Add at least one item in the course editor.');
  }

  const bodyText = formatCourseItem(firstItem);
  console.log('[ENROLL] Sending first item to', phoneNumber, '| title=', firstItem.title, '| withStartButton=', withStartButton);

  let result;
  if (withStartButton && sendWhatsAppButtonMessage) {
    result = await sendWhatsAppButtonMessage(phoneNumber, bodyText, [{ id: 'accept', title: 'Start' }], { footer: 'Or reply START to begin' });
  } else {
    result = await sendWhatsAppMessage(phoneNumber, bodyText);
  }

  if (result && result.simulated) {
    console.warn('[ENROLL] SIMULATION MODE – no real message sent. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_ID in .env');
  } else if (result && (result.error || !result.messages)) {
    const errMsg = result.error?.error?.message || result.error?.message || JSON.stringify(result.error);
    console.error('[ENROLL] WhatsApp API FAILED:', errMsg);
    if (result.error?.error?.code) console.error('[ENROLL] Error code:', result.error.error.code);
    throw new Error('WhatsApp send failed: ' + errMsg);
  } else if (result && result.messages) {
    console.log('[ENROLL] WhatsApp API OK. Message id:', result.messages[0]?.id || 'n/a');
  }

  await db.none(
    `INSERT INTO delivery_log (enrollment_id, item_index, delivered_at) 
     VALUES ($1, $2, NOW())`,
    [enrollmentId, 0]
  );

  return { sent: !!(result && (result.simulated || result.messages)), error: result?.error || null };
}

function formatCourseItem(item) {
  // Since we only have titles, create messages based on titles
  const messages = {
    'Welcome': 'Welcome to the test course! 📚 Reply NEXT to continue.',
    'Lesson 1': 'Great! This is item 2. Learning via WhatsApp is fun! Reply NEXT.',
    'Final Lesson': '🎉 Final item! You made it! This completes your test course.'
  };
  
  return messages[item.title] || item.title || 'Course content';
}

module.exports = router;