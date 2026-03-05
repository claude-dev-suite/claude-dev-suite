---
name: push-notifications
description: |
  Push notifications for web and mobile. Firebase Cloud Messaging (FCM),
  Apple Push Notification Service (APNs), Web Push API, Expo Notifications,
  and notification service architecture.

  USE WHEN: user mentions "push notification", "FCM", "Firebase messaging",
  "APNs", "web push", "service worker notification", "Expo notifications"

  DO NOT USE FOR: email notifications - use `email-sending`;
  in-app real-time updates - use `socket-io` or `sse`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Push Notifications

## Firebase Cloud Messaging (FCM) — Server

```typescript
import admin from 'firebase-admin';

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Send to single device
await admin.messaging().send({
  token: deviceToken,
  notification: { title: 'New Order', body: 'Order #1234 confirmed' },
  data: { orderId: '1234', type: 'order_confirmed' },
  android: { priority: 'high' },
  apns: { payload: { aps: { sound: 'default', badge: 1 } } },
});

// Send to topic
await admin.messaging().send({
  topic: 'promotions',
  notification: { title: 'Flash Sale', body: '50% off today!' },
});
```

## Web Push (Service Worker)

```typescript
// Register service worker and subscribe
const registration = await navigator.serviceWorker.register('/sw.js');
const subscription = await registration.pushManager.subscribe({
  userVisibleNotification: true,
  applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
});

// Send subscription to server
await fetch('/api/push/subscribe', {
  method: 'POST',
  body: JSON.stringify(subscription),
  headers: { 'Content-Type': 'application/json' },
});
```

### Service Worker (sw.js)

```javascript
self.addEventListener('push', (event) => {
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      data: { url: data.url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
```

### Server (web-push library)

```typescript
import webpush from 'web-push';

webpush.setVapidDetails('mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

await webpush.sendNotification(subscription, JSON.stringify({
  title: 'New Message',
  body: 'You have a new message from John',
  url: '/messages/123',
}));
```

## Expo Notifications (React Native)

```typescript
import * as Notifications from 'expo-notifications';

// Request permission
const { status } = await Notifications.requestPermissionsAsync();
if (status !== 'granted') return;

// Get push token
const token = (await Notifications.getExpoPushTokenAsync()).data;
// Send token to your server

// Handle received notification
Notifications.addNotificationReceivedListener((notification) => {
  console.log(notification.request.content);
});

// Handle notification tap
Notifications.addNotificationResponseReceivedListener((response) => {
  const data = response.notification.request.content.data;
  navigateTo(data.screen);
});
```

## Notification Service Pattern

```typescript
class NotificationService {
  async send(userId: string, notification: NotificationPayload) {
    const devices = await this.deviceRepo.findByUser(userId);

    const results = await Promise.allSettled(
      devices.map((device) => {
        switch (device.platform) {
          case 'web': return this.sendWebPush(device, notification);
          case 'ios':
          case 'android': return this.sendFCM(device, notification);
        }
      })
    );

    // Remove invalid tokens
    for (const [i, result] of results.entries()) {
      if (result.status === 'rejected' && isInvalidToken(result.reason)) {
        await this.deviceRepo.remove(devices[i].id);
      }
    }
  }
}
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Sending pushes synchronously | Use background job queue |
| No token cleanup | Remove invalid/expired device tokens |
| Missing notification permission UX | Ask contextually with explanation |
| No notification grouping | Group by type to avoid notification spam |
| Silent failures on send | Log failures, retry transient errors |

## Production Checklist

- [ ] VAPID keys generated for web push
- [ ] FCM service account configured
- [ ] Device token storage and cleanup
- [ ] Background job queue for batch sends
- [ ] Notification preferences per user
- [ ] Rate limiting to prevent spam
- [ ] Analytics: delivery rate, open rate
