# IoT Device Management

> MQTT-based device communication, secure provisioning, telemetry ingestion, over-the-air updates, and digital twin state synchronization.

## Core Principles

1. **Secure-by-Default Provisioning** — Every device receives a unique X.509 certificate or pre-shared key during provisioning; no device communicates without mutual TLS authentication, and compromised credentials are revokable without affecting the fleet.
2. **Telemetry Pipeline Separation** — High-frequency device telemetry flows through a dedicated ingestion pipeline (MQTT to message broker to time-series store) decoupled from command-and-control channels, preventing telemetry floods from blocking device management operations.
3. **Digital Twin Consistency** — Every physical device has a cloud-side digital twin that mirrors its reported state and accepts desired state changes, enabling offline-tolerant command delivery and state reconciliation when devices reconnect.

## Patterns

### Pattern 1: MQTT Device Communication

Establish authenticated MQTT connections with topic-based routing for telemetry ingestion, command delivery, and device status reporting.

```typescript
import mqtt from "mqtt";

interface DeviceConfig {
  deviceId: string;
  certPath: string;
  keyPath: string;
  brokerUrl: string;
}

function connectDevice(config: DeviceConfig): mqtt.MqttClient {
  const client = mqtt.connect(config.brokerUrl, {
    clientId: config.deviceId,
    cert: fs.readFileSync(config.certPath),
    key: fs.readFileSync(config.keyPath),
    rejectUnauthorized: true,
    clean: false,
    keepalive: 60,
  });
  client.subscribe(`devices/${config.deviceId}/commands/#`, { qos: 1 });
  client.on("message", (topic, payload) => {
    const command = JSON.parse(payload.toString());
    handleCommand(config.deviceId, command);
  });
  return client;
}

function publishTelemetry(client: mqtt.MqttClient, deviceId: string, data: Record<string, number>): void {
  const payload = JSON.stringify({ deviceId, timestamp: Date.now(), metrics: data });
  client.publish(`devices/${deviceId}/telemetry`, payload, { qos: 0, retain: false });
}
```

### Pattern 2: Digital Twin State Management

Maintain a cloud-side twin with reported (device-sent) and desired (cloud-set) state, computing delta patches for efficient state reconciliation.

```typescript
interface DigitalTwin {
  deviceId: string;
  reported: Record<string, unknown>;
  desired: Record<string, unknown>;
  metadata: { lastReported: Date; lastDesired: Date; version: number };
}

async function updateReportedState(
  deviceId: string,
  patch: Record<string, unknown>,
): Promise<DigitalTwin> {
  const twin = await db.digitalTwins.findUnique({ where: { deviceId } });
  const reported = { ...twin.reported, ...patch };
  const updated = await db.digitalTwins.update({
    where: { deviceId },
    data: { reported, metadata: { ...twin.metadata, lastReported: new Date(), version: twin.metadata.version + 1 } },
  });
  const delta = computeDelta(updated.desired, updated.reported);
  if (Object.keys(delta).length > 0) {
    await publishDesiredDelta(deviceId, delta);
  }
  return updated;
}

function computeDelta(desired: Record<string, unknown>, reported: Record<string, unknown>): Record<string, unknown> {
  const delta: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(desired)) {
    if (JSON.stringify(reported[key]) !== JSON.stringify(value)) {
      delta[key] = value;
    }
  }
  return delta;
}
```

### Pattern 3: Over-the-Air (OTA) Firmware Update

Orchestrate firmware updates across device fleets with staged rollouts, integrity verification, and automatic rollback on failure.

```typescript
interface OTAUpdate {
  firmwareVersion: string;
  downloadUrl: string;
  sha256Checksum: string;
  rolloutPercentage: number;
  targetDevices: string[];
}

async function initiateOTAUpdate(update: OTAUpdate): Promise<void> {
  const eligibleCount = Math.ceil(update.targetDevices.length * update.rolloutPercentage / 100);
  const batch = update.targetDevices.slice(0, eligibleCount);
  for (const deviceId of batch) {
    await mqtt.publish(`devices/${deviceId}/commands/ota`, JSON.stringify({
      action: "update_firmware",
      version: update.firmwareVersion,
      url: update.downloadUrl,
      checksum: update.sha256Checksum,
    }), { qos: 1 });
    await db.otaJobs.create({
      data: { deviceId, version: update.firmwareVersion, status: "pending", createdAt: new Date() },
    });
  }
}

async function handleOTAResult(deviceId: string, result: { version: string; success: boolean }): Promise<void> {
  await db.otaJobs.update({
    where: { deviceId_version: { deviceId, version: result.version } },
    data: { status: result.success ? "completed" : "failed", completedAt: new Date() },
  });
  if (!result.success) {
    await mqtt.publish(`devices/${deviceId}/commands/ota`, JSON.stringify({ action: "rollback" }), { qos: 1 });
  }
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|-------------|-------------|-----------------|
| Shared credentials across device fleet | One compromised device exposes all devices; no individual revocation possible | Unique per-device X.509 certificates with individual revocation via CRL/OCSP |
| Telemetry and commands on same channel without QoS | High-frequency telemetry floods drown out critical commands | Separate MQTT topics with QoS 0 for telemetry, QoS 1 for commands |
| Full state sync on every device reconnection | Wastes bandwidth on constrained networks; slow reconnection for large states | Delta-based sync using digital twin versioning; send only changed fields |
| Fleet-wide simultaneous OTA updates | Network congestion, mass failures, and potential fleet-wide bricking | Staged rollouts (1%, 10%, 50%, 100%) with automatic halt on failure threshold |

## Implementation Checklist

- [ ] Mutual TLS authentication with per-device X.509 certificates on MQTT broker
- [ ] Telemetry ingestion pipeline separated from command channel with independent QoS levels
- [ ] Digital twin service maintaining reported/desired state with delta-based reconciliation
- [ ] OTA firmware updates with staged rollout, SHA-256 integrity checks, and automatic rollback
- [ ] Device lifecycle management covering provisioning, activation, suspension, and decommissioning

## References

- [AWS IoT Device Shadow (Digital Twin)](https://docs.aws.amazon.com/iot/latest/developerguide/iot-device-shadows.html)
- [MQTT Version 5.0 OASIS Standard](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html)
- [Eclipse IoT Best Practices for Device Management](https://iot.eclipse.org/community/resources/white-papers/)
