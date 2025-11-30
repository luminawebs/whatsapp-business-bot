// async function sendWhatsAppMessage(phoneNumber, message) {
//   try {
//     const formattedPhone = phoneNumber.replace(/\D/g, '');
//     console.log(`📤 [WHATSAPP SIMULATION] To: ${formattedPhone}`);
//     console.log(`📤 Message: ${message}`);
//     console.log('---');
//     return { success: true, simulated: true };
//   } catch (error) {
//     console.error('WhatsApp API error:', error.message);
//     throw error;
//   }
// }

// module.exports = { sendWhatsAppMessage };


const axios = require('axios');

async function sendWhatsAppMessage(phoneNumber, message) {
  try {
    // Remove any formatting and keep only digits
    const formattedPhone = phoneNumber.replace(/\D/g, '');
    
    console.log(`📤 [REAL WHATSAPP] Attempting to send to: ${formattedPhone}`);
    console.log(`📤 Message: ${message}`);
    
    // Check if we have the required environment variables
    if (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_ID) {
      console.log('⚠️  WhatsApp credentials missing, using simulation');
      console.log('---');
      return { success: true, simulated: true };
    }
    
    // REAL WhatsApp API call
    const response = await axios.post(
      `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: formattedPhone,
        type: "text",
        text: { body: message }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ WhatsApp message sent successfully:', response.data);
    return response.data;
    
  } catch (error) {
    console.error('❌ WhatsApp API error:', error.response?.data || error.message);
    
    // Fallback to simulation if API fails
    console.log('🔄 Falling back to simulation');
    console.log('---');
    return { success: false, error: error.message, simulated: true };
  }
}

module.exports = { sendWhatsAppMessage };