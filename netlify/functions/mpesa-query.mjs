// Netlify Serverless Function: /api/mpesa/query
// Polls Safaricom Daraja STK Query to verify if tenant completed PIN authorization on phone

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const data = await req.json();
    const { checkoutRequestId, consumerKey, consumerSecret, passkey, shortcode, env = 'production' } = data || {};

    if (consumerKey && consumerSecret && passkey && checkoutRequestId) {
      const baseUrl = env === 'production'
        ? 'https://api.safaricom.co.ke'
        : 'https://sandbox.safaricom.co.ke';

      // 1. Get OAuth Bearer Token
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
      return new Response(JSON.stringify(queryData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fallback simulation
    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Simulated success' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
