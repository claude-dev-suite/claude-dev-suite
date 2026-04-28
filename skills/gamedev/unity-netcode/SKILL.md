---
name: unity-netcode
description: |
  Unity Netcode for GameObjects (NGO) — NetworkBehaviour, NetworkVariable,
  RPCs (Server/Client/Owner), client-side prediction, lag compensation,
  Multiplay/Relay/Lobby integration.

  USE WHEN: building multiplayer (co-op, competitive, MMO-lite), network
  authority decisions, anti-cheat, matchmaking + relay.

  DO NOT USE FOR: P2P state-sync without NGO (Mirror, Photon — out of scope);
  ECS-native networking (NetCode for Entities — adjacent stack).
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Unity Netcode for GameObjects

## Architecture

```
┌────────────┐         ┌───────────┐
│   Client   │  RPCs   │  Server   │  authoritative
│            │◀───────▶│ (or Host) │  state — broadcasts via
│ predicts   │  Vars   │           │  NetworkVariable + RPC
└────────────┘         └───────────┘
```

Use **server-authoritative**: never trust the client for damage, currency, or movement validation.

## NetworkBehaviour basics

```csharp
public class PlayerController : NetworkBehaviour {
    public NetworkVariable<int> Health = new(100,
        NetworkVariableReadPermission.Everyone,
        NetworkVariableWritePermission.Server);

    [Rpc(SendTo.Server)]
    public void FireRpc(Vector3 origin, Vector3 dir) {
        if (!IsServer) return;
        // server-side validation + spawn projectile
        SpawnProjectileServerSide(origin, dir, OwnerClientId);
    }

    [Rpc(SendTo.NotMe)]
    public void OnHitEffectRpc(Vector3 pos) {
        // VFX on every client except sender
    }
}
```

## RPC targets (Unity 6 attribute syntax)

| `SendTo` | Use |
|---|---|
| `Server` | Client → server requests |
| `Owner` | Server → owning client only |
| `NotOwner` | Server → all except owner (for own client prediction) |
| `Everyone` | Server → all clients (state broadcast) |
| `NotMe` | Common for VFX/SFX echo |
| `ClientsAndHost` | Mostly for host-aware logic |

## Client-side prediction

1. Client samples input → applies move locally + sends to server.
2. Server validates → broadcasts authoritative state.
3. Client reconciles: if server state diverges from prediction, replay inputs from divergence frame.

NGO doesn't ship a prediction system out-of-the-box — you build one with `NetworkTransform.AuthoritativeMode = Owner` + custom interpolation, or move to **NetCode for Entities** for first-class prediction.

## Lag compensation (hit-scan)

When server processes a fire RPC:
1. Read client RTT → rewind world state to `now - rtt/2`.
2. Raycast against rewound colliders.
3. Apply damage as if the shot landed at that historical state.

Implement via a ring buffer of past Transform/Collider snapshots (e.g. 1s @ 20Hz).

## Unity Gaming Services integration

- **Relay** — NAT punchthrough; host gets a Join Code that clients use.
- **Lobby** — pre-game rooms with metadata; passes Relay Join Code to clients.
- **Matchmaker** — skill/region-based queue; spins up Multiplay servers.
- **Multiplay** — dedicated server hosting; build Linux server build, deploy via UGS dashboard.

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| Client-authoritative damage | Always validate on server |
| `NetworkVariable<T>` for every transform field | Use `NetworkTransform` or batched update RPC |
| RPCs for high-frequency state | Use NetworkVariable (delta-compressed) or unreliable channel for visuals |
| Singleton `NetworkManager` accessed before spawn | Subscribe `NetworkManager.OnServerStarted`/`OnClientConnectedCallback` |
| Mixing host-only logic with `IsServer` | Use `IsHost` for host-specific code paths |
| Not pooling spawned NetworkObjects | NGO supports prespawned pools — use them |

## Production checklist

- [ ] All damage / economy / inventory mutations server-side only
- [ ] Lag compensation for hit-scan weapons
- [ ] NetworkObject pools for projectiles / spawned entities
- [ ] Relay + Lobby tested on real network (cellular, restrictive NAT)
- [ ] Server build CI pipeline (Linux IL2CPP) → Multiplay deploy
- [ ] Client/server version negotiation on connect — reject mismatches
- [ ] Anti-cheat: server validates inputs, throttles RPC rate
