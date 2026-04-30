---
name: bitcoin-core-zmq
description: |
  ZeroMQ notifications from Bitcoin Core: rawblock, rawtx, hashblock,
  hashtx, sequence. Subscribe over TCP/IPC, integration patterns for
  Electrs, BTCPay, Lightning nodes.
  USE WHEN: building real-time integrations with bitcoind, monitoring
  mempool sequence, integrating LN nodes.
allowed-tools: Read, Grep, Glob
---

# ZMQ Notifications

Bitcoin Core can publish events via ZeroMQ for low-latency, push-based
integration. Beats polling RPC for real-time apps.

## Configuration

`bitcoin.conf`:
```ini
zmqpubrawblock=tcp://127.0.0.1:28332
zmqpubrawtx=tcp://127.0.0.1:28333
zmqpubhashblock=tcp://127.0.0.1:28334
zmqpubhashtx=tcp://127.0.0.1:28335
zmqpubsequence=tcp://127.0.0.1:28336
```

Each topic on its own port (or share — but separate is cleaner).

Bind address forms:
- `tcp://127.0.0.1:port` — local-only.
- `tcp://0.0.0.0:port` — all interfaces (firewall it!).
- `ipc:///tmp/socket.ipc` — Unix socket, fast for local.
- `inproc://...` — same-process only (rarely useful from external client).

## Topics

| Topic | Payload | Notes |
|-------|---------|-------|
| `rawblock` | full block bytes | At every new tip block. |
| `rawtx` | full tx bytes | Mempool admission + block inclusion. |
| `hashblock` | 32-byte block hash | Lightweight tip notification. |
| `hashtx` | 32-byte txid | Lightweight tx notification. |
| `sequence` | txid + status byte | Mempool sequence (Add/Remove/...). |

### Sequence message format

```
[32 bytes] hash
[1 byte]   status: 'A' = mempool add
                   'R' = mempool remove (eviction or mined)
                   'C' = block connect (new tip)
                   'D' = block disconnect (reorg)
[8 bytes]  mempool sequence number (only for A/R)
```

The sequence number is monotonic per node restart and lets clients
detect missed messages.

## Client subscription

Python (`pyzmq`):
```python
import zmq

ctx = zmq.Context()
sock = ctx.socket(zmq.SUB)
sock.connect("tcp://127.0.0.1:28333")
sock.setsockopt_string(zmq.SUBSCRIBE, "rawtx")

while True:
    topic, body, seq = sock.recv_multipart()
    print(topic, len(body), int.from_bytes(seq, "little"))
```

The third frame is a 4-byte little-endian message counter (per topic
since node start) — useful to detect drops.

Node (`zeromq` package):
```js
const zmq = require("zeromq");
const sock = new zmq.Subscriber();
sock.connect("tcp://127.0.0.1:28332");
sock.subscribe("rawblock");
for await (const [topic, msg, seq] of sock) {
    console.log(topic.toString(), msg.length);
}
```

## Throughput considerations

- ZMQ uses unbounded buffers by default → if client is slow, memory
  grows. Set HWM (`set HighWaterMark`) on subscriber to drop old
  messages instead.
- Order of arrival: per topic per peer in order; cross-topic ordering
  not guaranteed (subscribe to multiple topics → use sequence number
  to reconcile).

## Common patterns

### Lightning node monitoring

LND, CLN, LDK use ZMQ to know when mempool / block events affect
their channels:
- `rawblock` → check if commitment tx confirmed.
- `rawtx` → fee bump opportunities.
- `sequence` → detect a counterparty broadcast quickly.

### BTCPay Server

Subscribes to `rawblock` + `rawtx` for invoice status updates.

### Indexers (Electrs, Fulcrum)

Use `hashblock` for tip notification → trigger incremental update of
the index.

### Mempool watcher

```python
sock.subscribe("sequence")
seen = set()
while True:
    topic, body, _ = sock.recv_multipart()
    txid = body[:32].hex()
    status = chr(body[32])
    if status == "A": seen.add(txid)
    elif status in ("R", "C"): seen.discard(txid)
```

## Failure modes

- **Connection drop** — ZMQ reconnects automatically on TCP. After
  reconnect, you may have missed messages — use sequence numbers +
  RPC catch-up to reconcile.
- **Slow consumer** — without HWM, memory bloats. Set
  `sock.set(zmq.RCVHWM, 1000)` to cap.
- **TCP across hosts** — fine for dev, but be aware of firewall +
  encryption (no built-in TLS for ZMQ; use stunnel or VPN).

## RPC alternative: `getzmqnotifications`

```bash
bitcoin-cli getzmqnotifications
```

Returns currently configured notification endpoints — useful for
debugging "is my client listening on the right port?".

## Common bugs

- Subscribing without setting topic filter (`SUBSCRIBE` to `""` =
  receive all from publisher) — gets blocks even if subscribed only
  to "tx".
- Treating `hashblock` as ordered with `rawtx` for the same tx that
  just confirmed — they're independent topics.
- Setting `zmqpubrawblock=tcp://0.0.0.0:28332` and exposing to
  internet — a malicious peer can drain bandwidth.

## See also

- [rpc/SKILL.md](../rpc/SKILL.md)
- [rest-api/SKILL.md](../rest-api/SKILL.md)
- [../../infrastructure/electrs/SKILL.md](../../infrastructure/electrs/SKILL.md)
- [../../infrastructure/btcpay/SKILL.md](../../infrastructure/btcpay/SKILL.md)
