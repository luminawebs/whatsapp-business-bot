async function sendWhatsAppMessage(phoneNumber, message) {
  try {
    // Remove any formatting and keep only digits
    const formattedPhone = phoneNumber.replace(/\D/g, '');
    
    console.log(`📤 [WHATSAPP] To: ${formattedPhone}`);
    console.log(`📤 Message: ${message}`);
    
    // Check if we have the required environment variables for real API
    if (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_ID) {
      console.log('⚠️  WhatsApp credentials missing, using simulation');
      console.log('---');
      return { success: true, simulated: true };
    }
    
    console.log('🚀 Attempting REAL WhatsApp API call...');
    
    // REAL WhatsApp API call using native fetch
    const response = await fetch(
      `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: formattedPhone,
          type: "text",
          text: { body: message }
        })
      }
    );

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`WhatsApp API error: ${JSON.stringify(data)}`);
    }

    console.log('✅ REAL WhatsApp message sent successfully!');
    return data;
    
  } catch (error) {
    console.error('❌ WhatsApp API failed:', error.message);
    
    // Fallback to simulation
    console.log('🔄 Falling back to simulation');
    console.log('---');
    return { success: true, simulated: true };
  }
}

module.exports = { sendWhatsAppMessage };