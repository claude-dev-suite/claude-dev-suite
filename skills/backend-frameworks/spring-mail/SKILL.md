---
name: spring-mail
description: |
  Spring Mail for sending emails in Spring Boot 3.x. Covers JavaMailSender,
  SimpleMailMessage, MimeMessage, HTML emails, attachments, templates
  (Thymeleaf/FreeMarker), async sending, and testing.

  USE WHEN: user mentions "spring mail", "JavaMailSender", "email Spring Boot",
  "send email", "MimeMessage", "email templates", "SMTP Spring"

  DO NOT USE FOR: transactional email services (SendGrid, SES) - use their SDKs,
  SMS/push notifications - use appropriate services
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Mail

## Quick Start

```yaml
# application.yml
spring:
  mail:
    host: smtp.gmail.com
    port: 587
    username: ${MAIL_USERNAME}
    password: ${MAIL_PASSWORD}
    properties:
      mail:
        smtp:
          auth: true
          starttls:
            enable: true
```

```java
@Service
@RequiredArgsConstructor
public class EmailService {

    private final JavaMailSender mailSender;

    public void sendSimpleEmail(String to, String subject, String text) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setTo(to);
        message.setSubject(subject);
        message.setText(text);
        message.setFrom("noreply@example.com");

        mailSender.send(message);
    }
}
```

---

## Configuration

```java
@Configuration
public class MailConfig {

    @Bean
    public JavaMailSender javaMailSender(MailProperties props) {
        JavaMailSenderImpl mailSender = new JavaMailSenderImpl();
        mailSender.setHost(props.getHost());
        mailSender.setPort(props.getPort());
        mailSender.setUsername(props.getUsername());
        mailSender.setPassword(props.getPassword());

        Properties javaMailProperties = new Properties();
        javaMailProperties.put("mail.smtp.auth", true);
        javaMailProperties.put("mail.smtp.starttls.enable", true);
        javaMailProperties.put("mail.smtp.connectiontimeout", 5000);
        javaMailProperties.put("mail.smtp.timeout", 5000);
        javaMailProperties.put("mail.smtp.writetimeout", 5000);

        mailSender.setJavaMailProperties(javaMailProperties);
        return mailSender;
    }
}
```

---

## MimeMessage (HTML & Attachments)

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class EmailService {

    private final JavaMailSender mailSender;

    // HTML Email
    public void sendHtmlEmail(String to, String subject, String htmlContent)
            throws MessagingException {
        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");

        helper.setTo(to);
        helper.setSubject(subject);
        helper.setText(htmlContent, true);  // true = HTML
        helper.setFrom("noreply@example.com");

        mailSender.send(message);
    }

    // Email con attachment
    public void sendEmailWithAttachment(String to, String subject, String text,
                                        String attachmentPath) throws MessagingException {
        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, true);

        helper.setTo(to);
        helper.setSubject(subject);
        helper.setText(text);
        helper.setFrom("noreply@example.com");

        FileSystemResource file = new FileSystemResource(new File(attachmentPath));
        helper.addAttachment(file.getFilename(), file);

        mailSender.send(message);
    }

    // Email con inline image
    public void sendEmailWithInlineImage(String to, String subject,
                                         String htmlContent, String imagePath)
            throws MessagingException {
        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, true);

        helper.setTo(to);
        helper.setSubject(subject);
        // Reference: <img src="cid:logo">
        helper.setText(htmlContent, true);
        helper.setFrom("noreply@example.com");

        FileSystemResource image = new FileSystemResource(new File(imagePath));
        helper.addInline("logo", image);

        mailSender.send(message);
    }

    // Multiple recipients
    public void sendToMultiple(String[] to, String[] cc, String[] bcc,
                               String subject, String text) throws MessagingException {
        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message);

        helper.setTo(to);
        if (cc != null) helper.setCc(cc);
        if (bcc != null) helper.setBcc(bcc);
        helper.setSubject(subject);
        helper.setText(text);
        helper.setFrom("noreply@example.com");

        mailSender.send(message);
    }
}
```

---

## Thymeleaf Templates

```java
@Service
@RequiredArgsConstructor
public class TemplateEmailService {

    private final JavaMailSender mailSender;
    private final TemplateEngine templateEngine;

    public void sendWelcomeEmail(String to, String userName) throws MessagingException {
        Context context = new Context();
        context.setVariable("userName", userName);
        context.setVariable("activationLink", "https://example.com/activate/123");

        String htmlContent = templateEngine.process("email/welcome", context);

        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");

        helper.setTo(to);
        helper.setSubject("Welcome to Our Platform!");
        helper.setText(htmlContent, true);
        helper.setFrom("noreply@example.com");

        mailSender.send(message);
    }

    public void sendOrderConfirmation(String to, Order order) throws MessagingException {
        Context context = new Context();
        context.setVariable("order", order);
        context.setVariable("items", order.getItems());
        context.setVariable("total", order.getTotal());

        String htmlContent = templateEngine.process("email/order-confirmation", context);

        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");

        helper.setTo(to);
        helper.setSubject("Order Confirmation #" + order.getId());
        helper.setText(htmlContent, true);
        helper.setFrom("orders@example.com");

        mailSender.send(message);
    }
}
```

```html
<!-- templates/email/welcome.html -->
<!DOCTYPE html>
<html xmlns:th="http://www.thymeleaf.org">
<head>
    <meta charset="UTF-8">
</head>
<body style="font-family: Arial, sans-serif;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #333;">Welcome, <span th:text="${userName}">User</span>!</h1>
        <p>Thank you for joining our platform.</p>
        <p>Please click the button below to activate your account:</p>
        <a th:href="${activationLink}"
           style="display: inline-block; padding: 10px 20px; background-color: #007bff;
                  color: white; text-decoration: none; border-radius: 5px;">
            Activate Account
        </a>
    </div>
</body>
</html>
```

---

## Async Email Sending

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class AsyncEmailService {

    private final JavaMailSender mailSender;
    private final TemplateEngine templateEngine;

    @Async("emailExecutor")
    public CompletableFuture<Void> sendEmailAsync(EmailRequest request) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");

            helper.setTo(request.getTo());
            helper.setSubject(request.getSubject());
            helper.setText(request.getContent(), request.isHtml());
            helper.setFrom(request.getFrom());

            mailSender.send(message);
            log.info("Email sent successfully to: {}", request.getTo());

            return CompletableFuture.completedFuture(null);
        } catch (Exception e) {
            log.error("Failed to send email to: {}", request.getTo(), e);
            return CompletableFuture.failedFuture(e);
        }
    }

    @Async("emailExecutor")
    @Retryable(retryFor = MailException.class, maxAttempts = 3,
               backoff = @Backoff(delay = 1000, multiplier = 2))
    public void sendWithRetry(String to, String subject, String content) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setTo(to);
        message.setSubject(subject);
        message.setText(content);
        message.setFrom("noreply@example.com");

        mailSender.send(message);
    }
}

@Configuration
@EnableAsync
public class AsyncConfig {

    @Bean("emailExecutor")
    public Executor emailExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(5);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("email-");
        executor.initialize();
        return executor;
    }
}
```

---

## Email Queue Pattern

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class EmailQueueService {

    private final EmailRepository emailRepository;
    private final JavaMailSender mailSender;

    // Queue email for later sending
    public void queueEmail(EmailRequest request) {
        EmailEntity email = EmailEntity.builder()
            .to(request.getTo())
            .subject(request.getSubject())
            .content(request.getContent())
            .status(EmailStatus.PENDING)
            .createdAt(Instant.now())
            .build();

        emailRepository.save(email);
    }

    // Scheduled job to process queue
    @Scheduled(fixedDelay = 60000)
    public void processEmailQueue() {
        List<EmailEntity> pending = emailRepository
            .findByStatusOrderByCreatedAt(EmailStatus.PENDING);

        for (EmailEntity email : pending) {
            try {
                sendEmail(email);
                email.setStatus(EmailStatus.SENT);
                email.setSentAt(Instant.now());
            } catch (Exception e) {
                email.setStatus(EmailStatus.FAILED);
                email.setErrorMessage(e.getMessage());
                email.setRetryCount(email.getRetryCount() + 1);
                log.error("Failed to send email {}: {}", email.getId(), e.getMessage());
            }
            emailRepository.save(email);
        }
    }

    private void sendEmail(EmailEntity email) throws MessagingException {
        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");

        helper.setTo(email.getTo());
        helper.setSubject(email.getSubject());
        helper.setText(email.getContent(), true);
        helper.setFrom("noreply@example.com");

        mailSender.send(message);
    }
}
```

---

## Testing

```java
// Con GreenMail
@SpringBootTest
class EmailServiceTest {

    @RegisterExtension
    static GreenMailExtension greenMail = new GreenMailExtension(ServerSetupTest.SMTP)
        .withConfiguration(GreenMailConfiguration.aConfig().withUser("test", "test"))
        .withPerMethodLifecycle(true);

    @Autowired
    private EmailService emailService;

    @Test
    void sendSimpleEmail_shouldDeliverEmail() {
        emailService.sendSimpleEmail(
            "recipient@example.com",
            "Test Subject",
            "Test content"
        );

        MimeMessage[] messages = greenMail.getReceivedMessages();
        assertThat(messages).hasSize(1);
        assertThat(messages[0].getSubject()).isEqualTo("Test Subject");
        assertThat(GreenMailUtil.getBody(messages[0])).contains("Test content");
    }

    @Test
    void sendHtmlEmail_shouldContainHtml() throws Exception {
        emailService.sendHtmlEmail(
            "recipient@example.com",
            "HTML Test",
            "<h1>Hello</h1><p>World</p>"
        );

        MimeMessage[] messages = greenMail.getReceivedMessages();
        assertThat(messages).hasSize(1);

        String content = GreenMailUtil.getBody(messages[0]);
        assertThat(content).contains("<h1>Hello</h1>");
    }
}

// Mock testing
@SpringBootTest
class EmailServiceMockTest {

    @MockBean
    private JavaMailSender mailSender;

    @Autowired
    private EmailService emailService;

    @Test
    void sendEmail_shouldCallMailSender() {
        emailService.sendSimpleEmail("to@example.com", "Subject", "Text");

        verify(mailSender).send(any(SimpleMailMessage.class));
    }
}
```

---

## Best Practices

| Do | Don't |
|----|-------|
| Use async for non-blocking | Send emails synchronously in handlers |
| Implement retry for transient errors | Ignore send failures |
| Use templates for HTML emails | Build HTML strings manually |
| Queue emails for reliability | Fire and forget |
| Configure timeouts | Use infinite timeouts |

## Production Checklist

- [ ] SMTP credentials secured
- [ ] TLS/STARTTLS enabled
- [ ] Async sending configured
- [ ] Retry mechanism implemented
- [ ] Email queue for reliability
- [ ] SPF/DKIM/DMARC configured
- [ ] Bounce handling implemented
- [ ] Rate limiting in place
- [ ] Templates for all email types
- [ ] Testing with GreenMail

## When NOT to Use This Skill

- **Transactional email services** - Use SendGrid, SES, Mailgun SDKs
- **High volume** - Consider dedicated email services
- **SMS/Push** - Use appropriate notification services
- **Complex campaigns** - Use marketing automation tools

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Sync sending in handlers | Blocks request threads | Use @Async |
| Credentials in code | Security risk | Use env vars/secrets |
| No retry | Lost emails | Implement retry with backoff |
| No queue | Reliability issues | Queue emails in database |
| Ignoring bounces | Bad reputation | Handle bounce notifications |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| AuthenticationFailed | Check credentials | Verify username/password, app password |
| Connection timeout | Check firewall | Verify network, increase timeout |
| Email in spam | Check headers | Configure SPF/DKIM/DMARC |
| Encoding issues | Check charset | Use UTF-8 explicitly |
| SSL handshake failed | Check TLS config | Enable STARTTLS properly |

## Reference Documentation
- [Spring Mail Reference](https://docs.spring.io/spring-framework/reference/integration/email.html)
