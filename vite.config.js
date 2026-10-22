import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173
  },
  plugins: [
    {
      name: 'safaricom-daraja-stk-api',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url, `http://${req.headers.host}`);

          // --- 1. POST /api/mpesa/stkpush ---
          if (req.method === 'POST' && url.pathname === '/api/mpesa/stkpush') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
              res.setHeader('Content-Type', 'application/json');
              try {
                const data = JSON.parse(body || '{}');
                const {
                  phone,
                  amount,
                  tillNumber,
                  accountReference = 'Rent',
                  propertyName = 'Omwoyo Apartments',
                  consumerKey,
                  consumerSecret,
                  passkey,
                  shortcode,
                  tillType = 'till', // 'till' | 'paybill'
                  env = 'production'
                } = data;

                // Format phone number to 254XXXXXXXXX
                let cleanPhone = (phone || '').replace(/\D/g, '');
                if (cleanPhone.startsWith('0')) cleanPhone = '254' + cleanPhone.slice(1);
                if (cleanPhone.startsWith('7') || cleanPhone.startsWith('1')) cleanPhone = '254' + cleanPhone;

                // Check if user provided real Safaricom Daraja API keys
                if (consumerKey && consumerSecret && passkey) {
                  const baseUrl = env === 'production' 
                    ? 'https://api.safaricom.co.ke' 
                    : 'https://sandbox.safaricom.co.ke';

                  // 1. Get OAuth Bearer Token from Safaricom
                  const authHeader = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
                  const tokenRes = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
                    headers: { 'Authorization': `Basic ${authHeader}` }
                  });
                  const tokenData = await tokenRes.json();

                  if (!tokenData.access_token) {
                    res.statusCode = 400;
                    return res.end(JSON.stringify({
                      success: false,
                      error: 'Failed to authenticate with Safaricom Daraja. Please check Consumer Key and Secret.',
                      details: tokenData
                    }));
                  }

                  // 2. Generate Lipa Na M-Pesa Password
                  const now = new Date();
                  const pad = n => String(n).padStart(2, '0');
                  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
                  const activeShortcode = shortcode || tillNumber || '174379';
                  const password = Buffer.from(`${activeShortcode}${passkey}${timestamp}`).toString('base64');

                  // In Safaricom Daraja:
                  // For Buy Goods Till (Supermarket style): TransactionType is CustomerBuyGoodsOnline
                  // For Paybill: TransactionType is CustomerPayBillOnline
                  const isBuyGoods = tillType === 'till' || (!tillType && activeShortcode.length <= 7 && activeShortcode !== '174379');
                  const transactionType = isBuyGoods ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline';

                  // 3. Send STK Push Request to Safaricom
                  const stkPayload = {
                    BusinessShortCode: activeShortcode,
                    Password: password,
                    Timestamp: timestamp,
                    TransactionType: transactionType,
                    Amount: Math.round(Number(amount) || 1),
                    PartyA: cleanPhone,
                    PartyB: activeShortcode,
                    PhoneNumber: cleanPhone,
                    CallBackURL: 'https://rentmaster.app/api/webhook/mpesa-callback',
                    AccountReference: (accountReference || 'Rent').slice(0, 12),
                    TransactionDesc: `Rent for ${propertyName}`.slice(0, 13)
                  };

                  const stkRes = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${tokenData.access_token}`,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(stkPayload)
                  });

                  const stkData = await stkRes.json();

                  if (stkData.ResponseCode === '0') {
                    return res.end(JSON.stringify({
                      success: true,
                      isRealDaraja: true,
                      checkoutRequestId: stkData.CheckoutRequestID,
                      merchantRequestId: stkData.MerchantRequestID,
                      customerMessage: stkData.CustomerMessage || 'Success. Request accepted for processing.',
                      phone: cleanPhone,
                      till: activeShortcode,
                      transactionType
                    }));
                  } else {
                    res.statusCode = 400;
                    return res.end(JSON.stringify({
                      success: false,
                      isRealDaraja: true,
                      error: stkData.errorMessage || stkData.ResponseDescription || 'Safaricom rejected the request',
                      details: stkData
                    }));
                  }
                } else {
                  // Fallback: Daraja credentials not yet configured
                  return res.end(JSON.stringify({
                    success: true,
                    isRealDaraja: false,
                    needsCredentials: true,
                    message: 'Daraja live keys not configured yet. Live handset push requires Consumer Key and Passkey.',
                    phone: cleanPhone,
                    till: tillNumber || '582190'
                  }));
                }
              } catch (err) {
                res.statusCode = 500;
                res.end(JSON.stringify({ success: false, error: err.message }));
              }
            });
            return;
          }

          // --- 2. POST /api/mpesa/query (Check status of STK Push) ---
          if (req.method === 'POST' && url.pathname === '/api/mpesa/query') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
              res.setHeader('Content-Type', 'application/json');
              try {
                const data = JSON.parse(body || '{}');
                const { checkoutRequestId, consumerKey, consumerSecret, passkey, shortcode, env = 'sandbox' } = data;

                if (consumerKey && consumerSecret && passkey && checkoutRequestId) {
                  const baseUrl = env === 'production' 
                    ? 'https://api.safaricom.co.ke' 
                    : 'https://sandbox.safaricom.co.ke';

                  // Get token
                  const authHeader = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
                  const tokenRes = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
                    headers: { 'Authorization': `Basic ${authHeader}` }
                  });
                  const tokenData = await tokenRes.json();

                  const now = new Date();
                  const pad = n => String(n).padStart(2, '0');
                  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
                  const activeShortcode = shortcode || '174379';
                  const password = Buffer.from(`${activeShortcode}${passkey}${timestamp}`).toString('base64');

                  const queryRes = await fetch(`${baseUrl}/mpesa/stkquery/v1/query`, {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${tokenData.access_token}`,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      BusinessShortCode: activeShortcode,
                      Password: password,
                      Timestamp: timestamp,
                      CheckoutRequestID: checkoutRequestId
                    })
                  });

                  const queryData = await queryRes.json();
                  return res.end(JSON.stringify(queryData));
                }

                return res.end(JSON.stringify({ ResultCode: 0, ResultDesc: 'Simulated success' }));
              } catch (err) {
                res.statusCode = 500;
                res.end(JSON.stringify({ success: false, error: err.message }));
              }
            });
            return;
          }

          next();
        });
      }
    }
  ]
});
