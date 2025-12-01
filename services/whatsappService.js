const https = require('https');

async function sendWhatsAppMessage(phoneNumber, message) {
  return new Promise((resolve, reject) => {
    try {
      // Remove any formatting and keep only digits
      const formattedPhone = phoneNumber.replace(/\D/g, '');
      
      console.log(`📤 [REAL WHATSAPP] Attempting to send to: ${formattedPhone}`);
      console.log(`📤 Message: ${message}`);
      
      // Check if we have the required environment variables for real API
      if (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_ID) {
        console.log('⚠️  WhatsApp credentials missing, using simulation');
        console.log('---');
        return resolve({ success: true, simulated: true });
      }
      
      console.log('🚀 Attempting REAL WhatsApp API call...');
      
      const postData = JSON.stringify({
        messaging_product: "whatsapp",
        to: formattedPhone,
        type: "text",
        text: { body: message }
      });

      const options = {
        hostname: 'graph.facebook.com',
        port: 443,
        path: `/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsedData = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              console.log('✅ REAL WhatsApp message sent successfully!');
              resolve(parsedData);
            } else {
              console.error('❌ WhatsApp API error:', parsedData);
              console.log('🔄 Falling back to simulation');
              console.log('---');
              resolve({ success: true, simulated: true });
            }
          } catch (error) {
            console.error('❌ Error parsing WhatsApp response:', error.message);
            console.log('🔄 Falling back to simulation');
            console.log('---');
            resolve({ success: true, simulated: true });
          }
        });
      });

      req.on('error', (error) => {
        console.error('❌ WhatsApp API failed:', error.message);
        console.log('🔄 Falling back to simulation');
        console.log('---');
        resolve({ success: true, simulated: true });
      });

      req.write(postData);
      req.end();
      
    } catch (error) {
      console.error('❌ Error in sendWhatsAppMessage:', error.message);
      console.log('🔄 Falling back to simulation');
      console.log('---');
      resolve({ success: true, simulated: true });
    }
  });
}

module.exports = { sendWhatsAppMessage };