# Notification Systems

> In-app, email, SMS, and push notification delivery with user preference management, intelligent batching, and multi-channel orchestration.

## Core Principles

1. **User Preference Sovereignty** — Users control which channels receive which notification types; preferences are checked before every dispatch, and unsubscribe actions take effect immediately across all systems.
2. **Channel Orchestration** — Notifications route through a priority cascade (in-app first, then push, then email/SMS) with deduplication across channels so users never receive the same message twice on different mediums.
3. **Intelligent Batching** — High-frequency events (e.g., comments, likes) are batched into digest summaries on configurable intervals rather than firing individually, reducing notification fatigue and delivery costs.

## Patterns

### Pattern 1: Multi-Channel Dispatcher

Route notifications through a channel resolver that checks user preferences, selects appropriate delivery channels, and dispatches with per-channel formatting.

```typescript
interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  channels: ("in_app" | "email" | "sms" | "push")[];
}

async function dispatchNotification(notification: Notification): Promise<void> {
  const prefs = await getUserPreferences(notification.userId);
  const enabledChannels = notification.channels.filter(
    (ch) => prefs[notification.type]?.[ch] !== false,
  );
  const dispatchers: Record<string, (n: Notification) => Promise<void>> = {
    in_app: sendInApp,
    email: sendEmail,
    sms: sendSms,
    push: sendPushNotification,
  };
  await Promise.allSettled(
    enabledChannels.map((ch) => dispatchers[ch](notification)),
  );
  await db.notificationLog.create({
    data: { ...notification, deliveredChannels: enabledChannels, sentAt: new Date() },
  });
}
```

### Pattern 2: Digest Batching with Flush Window

Accumulate high-frequency notifications into a digest buffer, then flush as a single summary notification after a configurable quiet period or maximum batch size.

```typescript
class DigestBatcher {
  private buffers = new Map<string, Notification[]>();
  private readonly flushIntervalMs = 300_000;
  private readonly maxBatchSize = 50;

  add(userId: string, notification: Notification): void {
    const key = `${userId}:${notification.type}`;
    const buffer = this.buffers.get(key) ?? [];
    buffer.push(notification);
    this.buffers.set(key, buffer);
    if (buffer.length >= this.maxBatchSize) {
      this.flush(key);
    }
  }

  async flush(key: string): Promise<void> {
    const items = this.buffers.get(key);
    if (!items || items.length === 0) return;
    this.buffers.delete(key);
    const [userId] = key.split(":");
    const digest: Notification = {
      id: crypto.randomUUID(),
      userId,
      type: "digest",
      title: `You have ${items.length} new updates`,
      body: items.map((n) => n.title).join("\n"),
      data: { count: items.length, items: items.map((n) => n.id) },
      channels: ["email", "in_app"],
    };
    await dispatchNotification(digest);
  }
}
```

### Pattern 3: Preference Management API

Expose a structured preference schema that allows users to control notification delivery per type and per channel with immediate propagation.

```typescript
interface NotificationPreferences {
  userId: string;
  global: { quietHoursStart?: string; quietHoursEnd?: string; timezone: string };
  channels: Record<string, ChannelPreference>;
}

interface ChannelPreference {
  in_app: boolean;
  email: boolean;
  sms: boolean;
  push: boolean;
}

async function updatePreferences(
  userId: string,
  updates: Partial<NotificationPreferences["channels"]>,
): Promise<NotificationPreferences> {
  const current = await db.notificationPrefs.findUnique({ where: { userId } });
  const merged = { ...current?.channels, ...updates };
  const updated = await db.notificationPrefs.upsert({
    where: { userId },
    create: { userId, channels: merged, global: { timezone: "UTC" } },
    update: { channels: merged },
  });
  await invalidatePreferenceCache(userId);
  return updated;
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|-------------|-------------|-----------------|
| Sending notifications without checking preferences | Violates user consent, triggers spam complaints, risks CAN-SPAM/GDPR violations | Always check preferences before dispatch; respect unsubscribe immediately |
| Same message on every channel simultaneously | Notification fatigue; users receive 4 alerts for one event | Channel cascade with deduplication: in-app, then push, then email |
| Unbounded notification frequency | Users disable all notifications permanently when overwhelmed | Digest batching with configurable intervals and per-type rate limits |
| Inline notification sending in request handlers | Adds latency to user actions; delivery failures block the request | Queue notifications asynchronously; process via background workers |

## Implementation Checklist

- [ ] Multi-channel dispatcher with per-user, per-type preference checks before every send
- [ ] Digest batching configured for high-frequency event types (5-minute window or 50-item cap)
- [ ] Quiet hours enforcement based on user timezone preferences
- [ ] Unsubscribe links in every email with one-click, no-login unsubscribe compliance
- [ ] Notification delivery log with channel, status, and timestamp for debugging and audit

## References

- [Firebase Cloud Messaging Best Practices](https://firebase.google.com/docs/cloud-messaging/concept-options)
- [AWS SNS Message Delivery and Retry](https://docs.aws.amazon.com/sns/latest/dg/sns-message-delivery-retries.html)
- [CAN-SPAM Act Compliance Guide (FTC)](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
