interface Env {
  DB: D1Database;
  RECIPIENT_EMAIL: string;
}

interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export async function onRequestPost(context: { 
  request: Request; 
  env: Env;
}) {
  try {
    const formData: ContactFormData = await context.request.json();
    
    // Validate the data
    const { name, email, subject, message } = formData;
    
    if (!name || !email || !subject || !message) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'All fields are required' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Invalid email format' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get user info
    const ipAddress = context.request.headers.get('CF-Connecting-IP') || 'unknown';
    const userAgent = context.request.headers.get('User-Agent') || 'unknown';
    
    // 1. Store in D1 Database
    await context.env.DB.prepare(
      `INSERT INTO contact_submissions 
       (name, email, subject, message, ip_address, user_agent) 
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(name, email, subject, message, ipAddress, userAgent)
    .run();

    // 2. Send Email using MailChannels (free on Cloudflare)
    const emailBody = `
New Contact Form Submission

From: ${name}
Email: ${email}
Subject: ${subject}

Message:
${message}

---
Submitted: ${new Date().toISOString()}
IP: ${ipAddress}
User Agent: ${userAgent}
    `.trim();

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2d3e50; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
    .content { background: #f4f4f4; padding: 20px; border-radius: 0 0 5px 5px; }
    .field { margin-bottom: 15px; }
    .label { font-weight: bold; color: #2d3e50; }
    .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>New Contact Form Submission</h2>
    </div>
    <div class="content">
      <div class="field">
        <div class="label">From:</div>
        <div>${name}</div>
      </div>
      <div class="field">
        <div class="label">Email:</div>
        <div><a href="mailto:${email}">${email}</a></div>
      </div>
      <div class="field">
        <div class="label">Subject:</div>
        <div>${subject}</div>
      </div>
      <div class="field">
        <div class="label">Message:</div>
        <div style="white-space: pre-wrap;">${message}</div>
      </div>
      <div class="footer">
        <div>Submitted: ${new Date().toISOString()}</div>
        <div>IP: ${ipAddress}</div>
      </div>
    </div>
  </div>
</body>
</html>
    `.trim();

    // Send email via MailChannels
    const emailResponse = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: context.env.RECIPIENT_EMAIL }],
            dkim_domain: 'yourdomain.com', // Optional: your domain for DKIM
            dkim_selector: 'mailchannels', // Optional: DKIM selector
          }
        ],
        from: {
          email: 'contact@yourdomain.com', // Replace with your domain
          name: 'Portfolio Contact Form'
        },
        reply_to: {
          email: email,
          name: name
        },
        subject: `Contact Form: ${subject}`,
        content: [
          {
            type: 'text/plain',
            value: emailBody
          },
          {
            type: 'text/html',
            value: emailHtml
          }
        ]
      })
    });

    if (!emailResponse.ok) {
      console.error('Email send failed:', await emailResponse.text());
      // Continue anyway - data is saved in DB
    }
    
    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Form submitted successfully' 
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    console.error('Error processing form:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      message: 'Server error processing your request' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle OPTIONS for CORS
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}