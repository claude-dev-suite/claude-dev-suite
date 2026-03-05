---
name: email-sending
description: |
  Email sending integration. Covers Nodemailer (Node.js), Spring Mail (Java),
  smtplib (Python). Transactional email services: SendGrid, Amazon SES, Resend.
  Template engines: MJML, React Email.

  USE WHEN: user mentions "send email", "nodemailer", "SMTP", "SendGrid",
  "SES", "Resend", "transactional email", "email template", "MJML",
  "React Email", "spring mail"

  DO NOT USE FOR: push notifications - use `push-notifications`;
  SMS - different channel; email parsing/reading
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Email Sending

## Node.js (Nodemailer)

```typescript
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 587,
  secure: false, // true for 465
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

await transporter.sendMail({
  from: '"My App" <noreply@myapp.com>',
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Welcome</h1><p>Thanks for signing up.</p>',
});
```

## Transactional Email Services

### Resend (recommended for simplicity)
```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

await resend.emails.send({
  from: 'My App <noreply@myapp.com>',
  to: ['user@example.com'],
  subject: 'Welcome!',
  html: '<h1>Welcome</h1>',
});
```

### SendGrid
```typescript
import sgMail from '@sendgrid/mail';
sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

await sgMail.send({
  to: 'user@example.com',
  from: 'noreply@myapp.com',
  templateId: 'd-abc123',        // Dynamic template
  dynamicTemplateData: { name: 'John', link: resetUrl },
});
```

### Amazon SES (via AWS SDK v3)
```typescript
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

const ses = new SESv2Client({ region: 'us-east-1' });
await ses.send(new SendEmailCommand({
  FromEmailAddress: 'noreply@myapp.com',
  Destination: { ToAddresses: ['user@example.com'] },
  Content: {
    Simple: {
      Subject: { Data: 'Welcome!' },
      Body: { Html: { Data: htmlContent } },
    },
  },
}));
```

## Email Templates

### React Email (recommended for React projects)
```tsx
// emails/welcome.tsx
import { Html, Head, Body, Container, Text, Button } from '@react-email/components';

export function WelcomeEmail({ name, url }: { name: string; url: string }) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: 'sans-serif' }}>
        <Container>
          <Text>Welcome, {name}!</Text>
          <Button href={url} style={{ background: '#000', color: '#fff', padding: '12px 20px' }}>
            Get Started
          </Button>
        </Container>
      </Body>
    </Html>
  );
}

// Render to HTML string
import { render } from '@react-email/render';
const html = await render(<WelcomeEmail name="John" url="https://app.com" />);
```

### MJML (framework-agnostic)
```typescript
import mjml2html from 'mjml';

const { html } = mjml2html(`
  <mjml>
    <mj-body>
      <mj-section>
        <mj-column>
          <mj-text>Welcome, {{name}}!</mj-text>
          <mj-button href="{{url}}">Get Started</mj-button>
        </mj-column>
      </mj-section>
    </mj-body>
  </mjml>
`);
```

## Python
```python
from email.message import EmailMessage
import aiosmtplib

msg = EmailMessage()
msg["From"] = "noreply@myapp.com"
msg["To"] = "user@example.com"
msg["Subject"] = "Welcome!"
msg.set_content("Welcome!", subtype="html")

await aiosmtplib.send(msg, hostname=SMTP_HOST, port=587,
    username=SMTP_USER, password=SMTP_PASS, start_tls=True)
```

## Java (Spring Mail)
```java
@Service
public class EmailService {
    @Autowired private JavaMailSender mailSender;
    @Autowired private TemplateEngine templateEngine; // Thymeleaf

    public void sendWelcome(String to, String name) {
        var ctx = new Context();
        ctx.setVariable("name", name);
        String html = templateEngine.process("welcome", ctx);

        var message = mailSender.createMimeMessage();
        var helper = new MimeMessageHelper(message, true);
        helper.setTo(to);
        helper.setFrom("noreply@myapp.com");
        helper.setSubject("Welcome!");
        helper.setText(html, true);
        mailSender.send(message);
    }
}
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Sending email in request handler | Use background job queue (BullMQ, Celery) |
| No retry on transient failure | Retry with exponential backoff (3 attempts) |
| Hardcoded from address | Use env var, match verified domain |
| HTML without plain text fallback | Always include both HTML and text versions |
| No unsubscribe header | Add `List-Unsubscribe` header (required by Gmail/Yahoo) |
| Sending from unverified domain | Set up SPF, DKIM, DMARC records |

## Production Checklist

- [ ] SPF, DKIM, DMARC DNS records configured
- [ ] Domain verified with email provider
- [ ] `List-Unsubscribe` header on marketing emails
- [ ] Bounce and complaint handling (webhook)
- [ ] Email sending via background queue (not in request)
- [ ] Rate limiting to stay within provider limits
- [ ] Plain text fallback for all HTML emails
- [ ] Template preview/testing before deploy
