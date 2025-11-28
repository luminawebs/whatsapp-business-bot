async function sendWhatsAppMessage(phoneNumber, message) {
  try {
    const formattedPhone = phoneNumber.replace(/\D/g, '');
    console.log(`📤 [WHATSAPP SIMULATION] To: ${formattedPhone}`);
    console.log(`📤 Message: ${message}`);
    console.log('---');
    return { success: true, simulated: true };
  } catch (error) {
    console.error('WhatsApp API error:', error.message);
    throw error;
  }
}

module.exports = { sendWhatsAppMessage };
