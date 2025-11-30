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


async function sendWhatsAppMessage(phoneNumber, message) {
  try {
    // Remove any formatting and keep only digits
    const formattedPhone = phoneNumber.replace(/\D/g, '');
    
    console.log(`📤 [REAL WHATSAPP] Attempting to send to: ${formattedPhone}`);
    console.log(`📤 Message: ${message}`);
    
    // REAL WhatsApp API call (uncommented)
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
    throw error;
  }
}