// Netlify Serverless Function: /api/webhook/mpesa-callback
// Receives asynchronous payment callbacks from Safaricom M-Pesa

export default async (req, context) => {
  if (req.method === 'POST') {
    try {
      const payload = await req.json();
      console.log('Safaricom Callback Payload:', JSON.stringify(payload, null, 2));

      return new Response(JSON.stringify({
        ResultCode: 0,
        ResultDesc: 'Callback accepted successfully'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response('Rentmaster M-Pesa Webhook Gateway Active', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' }
  });
};
