export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Route POST /api/contact to the contact handler
    if (url.pathname === '/api/contact') {
      if (request.method === 'OPTIONS') {
        return corsPreflightResponse();
      }
      if (request.method === 'POST') {
        return handleContact(request, env);
      }
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Serve images from R2 bucket (falls back to static assets if binding unavailable)
    if (url.pathname.startsWith('/images/') && env.IMAGES) {
      const key = url.pathname.slice(1);
      try {
        const object = await env.IMAGES.get(key);
        if (object !== null) {
          const headers = new Headers();
          object.writeHttpMetadata(headers);
          headers.set('etag', object.httpEtag);
          headers.set('cache-control', 'public, max-age=31536000, immutable');
          headers.set('content-type', headers.get('content-type') || 'image/webp');
          return new Response(object.body, { headers });
        }
      } catch (err) {
        console.error('R2 error:', err);
      }
    }

    // All other requests: serve static assets
    return env.ASSETS.fetch(request);
  },
};

async function handleContact(request, env) {
  try {
    const formData = await request.json();
    const { name, email, subject, message } = formData;

    if (!name || !email || !subject || !message) {
      return jsonResponse(400, { success: false, message: 'All fields are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return jsonResponse(400, { success: false, message: 'Invalid email format' });
    }

    const ipAddress = request.headers.get('CF-Connecting-IP') || 'unknown';
    const userAgent = request.headers.get('User-Agent') || 'unknown';
    const submittedAt = new Date().toISOString();

    // 1. Store in D1 (failure doesn't stop step 2)
    try {
      await env.DB.prepare(
        `INSERT INTO contact_submissions (name, email, subject, message, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(name, email, subject, message, ipAddress, userAgent)
        .run();
    } catch (dbError) {
      console.error('D1 insert error:', dbError);
    }

    // 2. Send email via Resend
    const resendApiKey = env.RESEND_API_KEY;
    const recipientEmail = env.RECIPIENT_EMAIL;

    if (!resendApiKey) {
      console.error('RESEND_API_KEY not set');
      return jsonResponse(200, { success: true, message: 'Message received. We will be in touch soon.' });
    }

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2d3e50; color: white; padding: 24px 20px; border-radius: 6px 6px 0 0; }
    .header h2 { margin: 0; font-size: 20px; }
    .content { background: #f4f4f4; padding: 24px 20px; border-radius: 0 0 6px 6px; }
    .field { margin-bottom: 16px; }
    .label { font-weight: bold; color: #2d3e50; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .value { background: white; padding: 10px 14px; border-radius: 4px; border-left: 3px solid #4a9eba; }
    .message-value { white-space: pre-wrap; }
    .footer { margin-top: 20px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 12px; color: #888; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>New Contact Form Submission</h2>
      <div style="font-size:13px; opacity:0.8; margin-top:6px;">Azure Lens Photography - azurelens.work</div>
    </div>
    <div class="content">
      <div class="field">
        <div class="label">Name</div>
        <div class="value">${escapeHtml(name)}</div>
      </div>
      <div class="field">
        <div class="label">Email</div>
        <div class="value"><a href="mailto:${escapeHtml(email)}" style="color:#4a9eba;">${escapeHtml(email)}</a></div>
      </div>
      <div class="field">
        <div class="label">Subject</div>
        <div class="value">${escapeHtml(subject)}</div>
      </div>
      <div class="field">
        <div class="label">Message</div>
        <div class="value message-value">${escapeHtml(message)}</div>
      </div>
      <div class="footer">
        <div>Submitted: ${submittedAt}</div>
        <div>IP: ${ipAddress}</div>
      </div>
    </div>
  </div>
</body>
</html>`.trim();

    const emailText = `
New Contact Form Submission - Azure Lens Photography

From:    ${name}
Reply to: ${email}
Subject: ${subject}

Message:
${message}

---
To reply, email ${name} directly at: ${email}
Submitted: ${submittedAt}
IP: ${ipAddress}
    `.trim();

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Azure Lens Contact Form <contact@send.azurelens.work>',
        to: `${recipientEmail}`,
        reply_to: `${recipientEmail}`,
        subject: `[Azure Lens] New enquiry from ${name}: ${subject}`,
        html: emailHtml,
        text: emailText,
      }),
    });

    if (!resendResponse.ok) {
      console.error('Resend error:', resendResponse.status, await resendResponse.text());
    }

    return jsonResponse(200, { success: true, message: 'Message received. We will be in touch soon.' });

  } catch (error) {
    console.error('Contact handler error:', error);
    return jsonResponse(500, { success: false, message: 'Something went wrong. Please try again.' });
  }
}

function corsPreflightResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
