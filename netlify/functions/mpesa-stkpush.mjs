// Netlify Serverless Function: /api/mpesa/stkpush
// Proxies STK push requests to Safaricom Daraja API with zero CORS issues

export default async (req, context) => {
  // Only accept POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const data = await req.json();
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
      tillType = 'till',
      env = 'production'
    } = data || {};

    // Format phone to 254XXXXXXXXX
    let cleanPhone = (phone || '').replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '254' + cleanPhone.slice(1);
    if (cleanPhone.startsWith('7') || cleanPhone.startsWith('1')) cleanPhone = '254' + cleanPhone;

    // Check if user provided real Safaricom Daraja credentials
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
        return new Response(JSON.stringify({
          success: false,
          error: 'Failed to authenticate with Safaricom Daraja. Please check Consumer Key and Secret.',
          details: tokenData
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 2. Generate Lipa Na M-Pesa Password
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const activeShortcode = shortcode || tillNumber || '174379';
      const password = Buffer.from(`${activeShortcode}${passkey}${timestamp}`).toString('base64');

      // Buy Goods Till vs Paybill
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
        return new Response(JSON.stringify({
          success: true,
          isRealDaraja: true,
          checkoutRequestId: stkData.CheckoutRequestID,
          merchantRequestId: stkData.MerchantRequestID,
          customerMessage: stkData.CustomerMessage || 'Success. Request accepted for processing.',
          phone: cleanPhone,
          till: activeShortcode,
          transactionType
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        return new Response(JSON.stringify({
          success: false,
          isRealDaraja: true,
          error: stkData.errorMessage || stkData.ResponseDescription || 'Safaricom rejected the request',
          details: stkData
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } else {
      // Fallback: Keys not configured yet
      return new Response(JSON.stringify({
        success: true,
        isRealDaraja: false,
        needsCredentials: true,
        message: 'Daraja live keys not configured yet. Live handset push requires Consumer Key and Passkey.',
        phone: cleanPhone,
        till: tillNumber || '582190'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
