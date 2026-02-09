const https = require('https');

// Helper to determine if we should simulate
const shouldSimulate = () => {
  return !process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_ID;
};

async function sendWhatsAppMessage(phoneNumber, message) {
  return new Promise((resolve, reject) => {
    try {
      // Remove any formatting and keep only digits
      const formattedPhone = phoneNumber.replace(/\D/g, '');

      console.log(`\n📤 [SENDING] To: ${formattedPhone}`);

      // Simulation Mode
      if (shouldSimulate()) {
        console.log('⚠️  [SIMULATION] Verification or Credentials missing.');
        console.log(`   Message Content: "${message}"`);
        console.log('   Action: Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_ID in .env to send real messages.');
        console.log('---');
        return resolve({ success: true, simulated: true });
      }

      // Real Send Mode
      console.log('🚀 [REAL API] Attempting to send via WhatsApp Cloud API...');

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
              console.log('✅ [SUCCESS] Message sent!');
              console.log(`   ID: ${parsedData.messages?.[0]?.id || 'unknown'}`);
              resolve(parsedData);
            } else {
              console.error('❌ [API ERROR] WhatsApp rejected the request:');
              console.error(JSON.stringify(parsedData, null, 2));

              // Don't fallback to simulation on API error - we want to know it failed
              resolve({ success: false, error: parsedData });
            }
          } catch (error) {
            console.error('❌ [PARSE ERROR] Invalid JSON response from Meta:', data);
            resolve({ success: false, error: error.message });
          }
        });
      });

      req.on('error', (error) => {
        console.error('❌ [NETWORK ERROR] Request failed:', error.message);
        resolve({ success: false, error: error.message });
      });

      req.write(postData);
      req.end();

    } catch (error) {
      console.error('❌ [INTERNAL ERROR] sendWhatsAppMessage failed:', error.message);
      resolve({ success: false, error: error.message });
    }
  });
}

module.exports = { sendWhatsAppMessage };