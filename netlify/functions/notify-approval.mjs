import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  try {
    const payload = await req.json();
    const { to, toName, subject, message, type, details } = payload;

    if (!to || !subject) {
      return new Response(JSON.stringify({ success: false, error: "Missing required 'to' or 'subject' field" }), { status: 400, headers });
    }

    console.log(`[RENTMASTER EMAIL DISPATCH] To: ${toName ? `${toName} <${to}>` : to} | Type: ${type} | Subject: ${subject}`);
    console.log(`[RENTMASTER EMAIL BODY]:\n${message}`);

    let deliveredVia = "system_log";

    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      try {
        const fromEmail = process.env.NOTIFICATION_FROM_EMAIL || "Rentmaster Approvals <notifications@rentmaster.co.ke>";
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [to],
            subject: subject,
            text: message,
            html: message.replace(/\n/g, "<br/>")
          })
        });
        if (resendRes.ok) {
          deliveredVia = "resend";
        } else {
          const errText = await resendRes.text();
          console.warn("Resend API delivery notice:", errText);
        }
      } catch (sendErr) {
        console.warn("Resend fetch error:", sendErr.message);
      }
    }

    const sendgridApiKey = process.env.SENDGRID_API_KEY;
    if (!resendApiKey && sendgridApiKey) {
      try {
        const fromEmail = process.env.NOTIFICATION_FROM_EMAIL || "notifications@rentmaster.co.ke";
        const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${sendgridApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: to, name: toName || to }] }],
            from: { email: fromEmail, name: "Rentmaster Approvals" },
            subject: subject,
            content: [{ type: "text/plain", value: message }]
          })
        });
        if (sgRes.ok) {
          deliveredVia = "sendgrid";
        }
      } catch (sgErr) {
        console.warn("SendGrid fetch error:", sgErr.message);
      }
    }

    try {
      const blobStore = getStore("rentmaster_global");
      if (blobStore) {
        const entryId = `email_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        await blobStore.setJSON(`notifications/${entryId}`, {
          to,
          toName,
          subject,
          type,
          details,
          timestamp: Date.now(),
          deliveredVia
        });
      }
    } catch (blobErr) {
      console.warn("Blob notification archive note:", blobErr.message);
    }

    return new Response(JSON.stringify({
      success: true,
      deliveredVia,
      recipient: to,
      recipientName: toName || null,
      subject,
      timestamp: Date.now()
    }), {
      status: 200,
      headers
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers
    });
  }
};
