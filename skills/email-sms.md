# Email & SMS

> Transactional email (SES, SendGrid), SMS (Twilio, SNS), templates, delivery tracking, bounce handling, and opt-out management for reliable communications.

## Core Principles

1. **Transactional and Marketing Are Separate Channels** — Use different sending domains and infrastructure for transactional (order confirmations, password resets) vs marketing (newsletters, promotions). A marketing spam complaint must never affect transactional delivery.
2. **Templates Are Code, Not Content** — Email/SMS templates must be version-controlled, type-safe, and testable. Use template engines (MJML, React Email) with preview and testing capabilities.
3. **Delivery Is Not Guaranteed** — Build systems that handle bounces, complaints, and delivery failures. Track every message lifecycle: queued, sent, delivered, opened, bounced, complained.
4. **Opt-Out Is Immediate and Permanent** — Unsubscribe must work on first click, take effect immediately, and be durable. CAN-SPAM, GDPR, and PECR compliance are legal requirements.
5. **Rate Limits Protect Your Reputation** — ISPs and carriers throttle senders who blast too fast. Implement sending rate limits, warm up new IPs/domains gradually, and monitor sender reputation.

## Patterns

### Pattern 1: Type-Safe Email Templates with React Email

```typescript
import { render } from '@react-email/render';
import { Html, Head, Body, Container, Text, Button } from '@react-email/components';

interface ContractApprovedEmailProps {
  tenantName: string;
  contractId: string;
  contractType: string;
  approvedAt: Date;
  dashboardUrl: string;
}

function ContractApprovedEmail(props: ContractApprovedEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: 'Inter, sans-serif' }}>
        <Container>
          <Text>Dear {props.tenantName},</Text>
          <Text>
            Your {props.contractType} contract ({props.contractId}) has been
            approved on {props.approvedAt.toLocaleDateString()}.
          </Text>
          <Button href={props.dashboardUrl}>View Contract</Button>
        </Container>
      </Body>
    </Html>
  );
}

// Send via SES
async function sendContractApprovedEmail(params: ContractApprovedEmailProps & { to: string }) {
  const html = await render(<ContractApprovedEmail {...params} />);
  await ses.sendEmail({
    Source: 'notifications@islamicopenfinance.com',
    Destination: { ToAddresses: [params.to] },
    Message: {
      Subject: { Data: `Contract ${params.contractId} Approved` },
      Body: { Html: { Data: html } },
    },
  });
}
```

### Pattern 2: Bounce and Complaint Handling

```typescript
// SES event handler via SNS webhook
async function handleSesNotification(event: SesNotification): Promise<void> {
  switch (event.notificationType) {
    case 'Bounce': {
      const bounced = event.bounce.bouncedRecipients;
      for (const recipient of bounced) {
        if (event.bounce.bounceType === 'Permanent') {
          await db.emailSuppressions.upsert({
            where: { email: recipient.emailAddress },
            create: {
              email: recipient.emailAddress,
              reason: 'hard_bounce',
              suppressedAt: new Date(),
            },
            update: { reason: 'hard_bounce', suppressedAt: new Date() },
          });
        }
      }
      break;
    }
    case 'Complaint': {
      for (const recipient of event.complaint.complainedRecipients) {
        await db.emailSuppressions.upsert({
          where: { email: recipient.emailAddress },
          create: {
            email: recipient.emailAddress,
            reason: 'complaint',
            suppressedAt: new Date(),
          },
          update: { reason: 'complaint', suppressedAt: new Date() },
        });
      }
      break;
    }
  }
}

// Check suppression before sending
async function canSendTo(email: string): Promise<boolean> {
  const suppression = await db.emailSuppressions.findUnique({ where: { email } });
  return suppression === null;
}
```

### Pattern 3: SMS with Delivery Tracking

```typescript
import twilio from 'twilio';

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

async function sendSms(to: string, body: string, reference: string): Promise<string> {
  assert(body.length <= 160, 'SMS body exceeds 160 characters');
  assert(/^\+\d{10,15}$/.test(to), 'Invalid phone number format');

  // Check opt-out
  const optedOut = await db.smsOptOuts.findUnique({ where: { phone: to } });
  if (optedOut) {
    logger.info({ to, reference }, 'SMS skipped — recipient opted out');
    return 'opted_out';
  }

  const message = await client.messages.create({
    to,
    from: process.env.TWILIO_PHONE_NUMBER,
    body,
    statusCallback: `${process.env.API_URL}/webhooks/twilio/status`,
  });

  await db.smsLog.create({
    data: {
      messageId: message.sid,
      to,
      body,
      reference,
      status: 'queued',
      sentAt: new Date(),
    },
  });

  return message.sid;
}
```

### Pattern 4: Notification Preferences

```typescript
interface NotificationPreferences {
  email: {
    contractUpdates: boolean;
    securityAlerts: boolean; // Cannot be disabled
    marketingNews: boolean;
    weeklyDigest: boolean;
  };
  sms: {
    transactionAlerts: boolean;
    securityAlerts: boolean; // Cannot be disabled
  };
}

async function shouldNotify(
  userId: string,
  channel: 'email' | 'sms',
  category: string,
): Promise<boolean> {
  // Security alerts always sent
  if (category === 'securityAlerts') return true;

  const prefs = await getPreferences(userId);
  return prefs[channel]?.[category] ?? false;
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|---|---|---|
| Sending email synchronously in request | Slows API response, fails on provider timeout | Queue email sends, return immediately |
| No suppression list checking | Sending to bounced addresses hurts reputation | Check suppression list before every send |
| HTML email without plain text fallback | Some clients block HTML, accessibility issues | Always include both HTML and plain text |
| Hardcoded email content in code | Cannot update without deploy, no preview | Template system with version control |
| Same domain for transactional and marketing | Marketing complaints block transactional delivery | Separate sending domains and IP pools |
| No delivery tracking | Cannot diagnose delivery issues | Track full lifecycle: queued, sent, delivered, bounced |

## Implementation Checklist

- [ ] Set up separate sending domains for transactional and marketing
- [ ] Implement bounce and complaint handling webhooks
- [ ] Build suppression list with automatic enrollment on hard bounce/complaint
- [ ] Create type-safe template system with preview capability
- [ ] Implement notification preferences with opt-out
- [ ] Add delivery tracking for all sent messages
- [ ] Configure SPF, DKIM, and DMARC for sending domains
- [ ] Set up sending rate limits and IP warm-up schedule

## References

- [AWS SES Best Practices](https://docs.aws.amazon.com/ses/latest/dg/best-practices.html)
- [React Email](https://react.email/)
- [Twilio SMS Best Practices](https://www.twilio.com/docs/sms/tutorials/how-to-send-sms-messages)
- [CAN-SPAM Compliance](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
