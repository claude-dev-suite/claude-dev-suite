---
name: wireguard
description: |
  WireGuard VPN setup on Linux. Covers server config, client config, key management,
  NAT/IP forwarding, peer management, split tunnel, full tunnel, and site-to-site.

  USE WHEN: user mentions "wireguard", "wg0", "wg-quick", "wireguard vpn",
  "wireguard server setup", "wireguard peer", "wireguard keys", "wireguard client",
  "wireguard nat", "wireguard iptables", "wireguard split tunnel", "wireguard qr code",
  "wg genkey", "wireguard site-to-site", "wireguard keepalive"

  DO NOT USE FOR: OpenVPN setups - different tool and protocol,
  IPsec / IKEv2 VPNs,
  Tailscale or Netbird (they use WireGuard underneath but have their own CLIs),
  Cloud VPN gateways (AWS VPN, GCP Cloud VPN)
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---
# WireGuard Core Knowledge

## Concepts

| Term | Meaning |
|---|---|
| Interface | Virtual network adapter (`wg0`). One per VPN tunnel. |
| Private key | Generated per peer; never shared. |
| Public key | Derived from private key; exchanged with remote peers. |
| Peer | Any other WireGuard node (server or client). |
| AllowedIPs | IP ranges allowed through the tunnel to/from this peer. Acts as routing table + firewall. |
| Endpoint | `IP:port` where this peer is reachable (optional on server for dynamic clients). |
| PersistentKeepalive | Sends keepalive every N seconds — required for clients behind NAT. |
| PreSharedKey | Optional symmetric key for additional post-quantum protection. |

---

## Server Setup

### Install WireGuard

```bash
# Ubuntu / Debian
sudo apt update && sudo apt install -y wireguard wireguard-tools

# RHEL / Rocky / Alma
sudo dnf install -y epel-release && sudo dnf install -y wireguard-tools

# Arch
sudo pacman -S wireguard-tools

# Verify kernel module loaded (Linux 5.6+: built in)
sudo modprobe wireguard && echo "WireGuard module OK"
```

### Generate Server Keys

```bash
# Create key directory with tight permissions
sudo mkdir -p /etc/wireguard
sudo chmod 700 /etc/wireguard

# Generate server key pair
wg genkey | sudo tee /etc/wireguard/server_private.key | \
  wg pubkey | sudo tee /etc/wireguard/server_public.key

sudo chmod 600 /etc/wireguard/server_private.key
cat /etc/wireguard/server_public.key    # Share this with clients
```

### Server Config — `/etc/wireguard/wg0.conf`

```ini
[Interface]
# Server private key (keep secret)
PrivateKey = <SERVER_PRIVATE_KEY>

# VPN subnet address for the server itself
Address = 10.10.0.1/24

# UDP port WireGuard listens on
ListenPort = 51820

# IP forwarding rules — applied when wg-quick brings up the interface
# Replace eth0 with your actual outbound interface (ip route | grep default)
PostUp   = sysctl -w net.ipv4.ip_forward=1
PostUp   = iptables -A FORWARD -i %i -j ACCEPT
PostUp   = iptables -A FORWARD -o %i -j ACCEPT
PostUp   = iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
# IPv6 forwarding (optional)
PostUp   = sysctl -w net.ipv6.conf.all.forwarding=1
PostUp   = ip6tables -A FORWARD -i %i -j ACCEPT
PostUp   = ip6tables -t nat -A POSTROUTING -o eth0 -j MASQUERADE

PreDown  = iptables -D FORWARD -i %i -j ACCEPT
PreDown  = iptables -D FORWARD -o %i -j ACCEPT
PreDown  = iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
PreDown  = ip6tables -D FORWARD -i %i -j ACCEPT
PreDown  = ip6tables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

# Save/restore rules between restarts
SaveConfig = false          # Set true only during testing; keeps config clean in prod

# --- Peers (one block per client) ---

[Peer]
# Client: Alice's laptop
PublicKey = <ALICE_PUBLIC_KEY>
# Unique IP assigned to Alice's device in the VPN subnet
AllowedIPs = 10.10.0.2/32
# No Endpoint here — Alice connects from dynamic IPs
# PresharedKey = <OPTIONAL_PSK>   # Uncomment for additional security

[Peer]
# Client: Bob's phone
PublicKey = <BOB_PUBLIC_KEY>
AllowedIPs = 10.10.0.3/32

[Peer]
# Site-to-site: Office network (192.168.50.0/24)
PublicKey = <OFFICE_GW_PUBLIC_KEY>
AllowedIPs = 10.10.0.10/32, 192.168.50.0/24
Endpoint = office-gw.example.com:51820
PersistentKeepalive = 25
```

### Enable IP Forwarding Permanently

```bash
# /etc/sysctl.conf or /etc/sysctl.d/99-wireguard.conf
echo "net.ipv4.ip_forward = 1"       | sudo tee /etc/sysctl.d/99-wireguard.conf
echo "net.ipv6.conf.all.forwarding = 1" | sudo tee -a /etc/sysctl.d/99-wireguard.conf
sudo sysctl --system
```

### Start and Enable via systemd

```bash
sudo systemctl enable --now wg-quick@wg0
sudo systemctl status wg-quick@wg0

# Check interface
sudo wg show wg0
```

---

## Client Config Generation

### Generate Client Keys

```bash
# Run on the client machine (or generate server-side and distribute securely)
wg genkey | tee client_private.key | wg pubkey > client_public.key
chmod 600 client_private.key

# Optional preshared key (same for both sides)
wg genpsk > client_psk.key
```

### Client Config — Full Tunnel (all traffic through VPN)

```ini
# /etc/wireguard/wg0.conf  (on client)
[Interface]
PrivateKey = <CLIENT_PRIVATE_KEY>
Address    = 10.10.0.2/32          # Unique VPN IP assigned to this client
DNS        = 10.10.0.1             # Server acts as DNS resolver; or use 1.1.1.1

[Peer]
PublicKey  = <SERVER_PUBLIC_KEY>
Endpoint   = vpn.example.com:51820
# Full tunnel: all traffic (including internet) through VPN
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25           # Required when client is behind NAT
# PresharedKey = <PSK>
```

### Client Config — Split Tunnel (only internal subnets through VPN)

```ini
[Interface]
PrivateKey = <CLIENT_PRIVATE_KEY>
Address    = 10.10.0.2/32
DNS        = 10.10.0.1

[Peer]
PublicKey  = <SERVER_PUBLIC_KEY>
Endpoint   = vpn.example.com:51820
# Split tunnel: only route private subnets through VPN
AllowedIPs = 10.10.0.0/24, 192.168.1.0/24, 172.16.0.0/12
# Internet traffic goes directly (NOT through VPN)
PersistentKeepalive = 25
```

---

## QR Code for Mobile Clients

```bash
# Install qrencode
sudo apt install -y qrencode

# Print QR code to terminal (scan with WireGuard iOS/Android app)
qrencode -t ansiutf8 < /etc/wireguard/clients/alice.conf

# Or export to PNG
qrencode -o alice-vpn.png < /etc/wireguard/clients/alice.conf
```

---

## Peer Management (Hot Reload — No Restart Required)

### Add a Peer Without Restart

```bash
# Generate new peer keys
wg genkey | tee /etc/wireguard/clients/carol_private.key | \
  wg pubkey > /etc/wireguard/clients/carol_public.key

CAROL_PUBKEY=$(cat /etc/wireguard/clients/carol_public.key)

# Add peer to running interface
sudo wg set wg0 peer "$CAROL_PUBKEY" allowed-ips 10.10.0.4/32

# Persist to config file
sudo wg-quick save wg0    # ONLY works if SaveConfig=true
# OR append to conf manually:
echo -e "\n[Peer]\nPublicKey = $CAROL_PUBKEY\nAllowedIPs = 10.10.0.4/32" \
  | sudo tee -a /etc/wireguard/wg0.conf
```

### Remove a Peer Without Restart

```bash
PEER_PUBKEY="<PUBLIC_KEY_TO_REMOVE>"
sudo wg set wg0 peer "$PEER_PUBKEY" remove
# Remove the [Peer] block from wg0.conf manually to persist
```

### Check Peer Status

```bash
# Show all peers, latest handshake, transfer stats
sudo wg show wg0

# Show only handshake times (0 = never connected)
sudo wg show wg0 latest-handshakes

# Show allowed IPs
sudo wg show wg0 allowed-ips

# Check transfer per peer
sudo wg show wg0 transfer
```

---

## Site-to-Site Pattern

```
Office LAN (192.168.50.0/24)          Cloud LAN (10.10.0.0/24)
        |                                     |
  [Office GW] ──── WireGuard tunnel ──── [Cloud GW / Server]
  wg0: 10.10.0.10                       wg0: 10.10.0.1
```

**Cloud Server peer for office:**
```ini
[Peer]
PublicKey    = <OFFICE_GW_PUBLIC_KEY>
AllowedIPs   = 10.10.0.10/32, 192.168.50.0/24
Endpoint     = office-public-ip:51820
PersistentKeepalive = 25
```

**Office Gateway config:**
```ini
[Interface]
PrivateKey = <OFFICE_GW_PRIVATE_KEY>
Address    = 10.10.0.10/24
ListenPort = 51820
PostUp   = iptables -A FORWARD -i %i -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PreDown  = iptables -D FORWARD -i %i -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

[Peer]
PublicKey    = <CLOUD_SERVER_PUBLIC_KEY>
AllowedIPs   = 10.10.0.0/24          # Cloud VPN subnet only (split tunnel)
Endpoint     = vpn.example.com:51820
PersistentKeepalive = 25
```

---

## Monitoring and Transfer Stats

```bash
# Live monitoring
watch -n 2 sudo wg show

# Handshake age (should be < 3 min for active clients with keepalive=25)
sudo wg show wg0 latest-handshakes | awk '{
  now = systime(); age = now - $2;
  printf "%s  last handshake: %d seconds ago\n", $1, age
}'

# Total transferred (bytes) — parse for alerting
sudo wg show wg0 transfer

# Interface stats via ip
ip -s link show wg0
```

---

## DNS for VPN Clients

### Option 1: systemd-resolved on server as DNS resolver

```bash
# Allow DNS queries from VPN subnet
sudo apt install -y systemd-resolved
# Edit /etc/systemd/resolved.conf
[Resolve]
DNS=1.1.1.1 8.8.8.8
DNSStubListener=yes

# Allow port 53 from VPN interface
sudo iptables -A INPUT -i wg0 -p udp --dport 53 -j ACCEPT
sudo iptables -A INPUT -i wg0 -p tcp --dport 53 -j ACCEPT
```

Clients set `DNS = 10.10.0.1` in their `[Interface]` block.

### Option 2: dnsmasq for internal hostname resolution

```bash
sudo apt install -y dnsmasq
# /etc/dnsmasq.conf
interface=wg0
bind-interfaces
domain=vpn.internal
expand-hosts
local=/vpn.internal/
# Forward everything else to upstream
server=1.1.1.1
server=8.8.8.8
```

---

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|---|---|---|
| Sharing private keys between peers | If one device is compromised, all peers with that key are compromised | Generate a unique key pair per device; never copy private keys |
| Not setting `PersistentKeepalive` for NAT clients | NAT mapping expires → client appears disconnected after idle period | Set `PersistentKeepalive = 25` on all clients behind NAT/firewall |
| Forgetting `net.ipv4.ip_forward = 1` | Traffic enters VPN but is not forwarded → clients can reach server but nothing else | Set via sysctl.d file and apply `PostUp` in wg0.conf |
| Using `SaveConfig = true` in production | `wg-quick save` overwrites conf on shutdown, blowing away comments and formatting | Use `SaveConfig = false`; manage conf file manually or via config management |
| Assigning overlapping AllowedIPs to two peers | WireGuard silently uses the last-defined peer for a given IP range | Assign unique, non-overlapping /32 addresses per client |
| Opening port 51820 to `0.0.0.0/0` in all directions | Exposure is unavoidable for UDP listen port, but ensure firewall blocks other ports | Firewall all ports except 22 (SSH), 51820 (WireGuard), and your services |
| Full tunnel (`0.0.0.0/0`) without DNS set | DNS leaks — queries go to ISP DNS outside the tunnel | Always set `DNS` in client `[Interface]` when using full tunnel |
| Distributing client configs over unencrypted channels | Private key exposed in transit | Transfer via encrypted channel (SFTP, gpg-encrypted file, Signal, QR code over physical display) |
| Leaving unused peers in config | Revoked clients remain technically valid | Remove both the `[Peer]` block from wg0.conf and run `wg set wg0 peer <key> remove` |
| Not logging handshake timestamps | No visibility into active vs stale clients | Set up periodic cron to log `wg show wg0 latest-handshakes` to a monitoring system |

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| No handshake ever established | Endpoint unreachable or firewall blocking port 51820/UDP | `nc -u vpn.example.com 51820` from client; check server firewall: `sudo ufw allow 51820/udp` |
| Handshake established but traffic not routing | `ip_forward` not enabled, iptables FORWARD chain dropping packets | `sysctl net.ipv4.ip_forward` must return `1`; check `iptables -L FORWARD` |
| DNS not working inside VPN | Client DNS set to VPN server IP but DNS not running on server | Install dnsmasq/systemd-resolved; allow port 53 from wg0 interface |
| Client connects but internet not reachable (full tunnel) | NAT/MASQUERADE rule missing | Verify `iptables -t nat -L POSTROUTING` shows MASQUERADE on correct interface |
| Connection drops every few minutes | No keepalive and NAT mapping expires | Add `PersistentKeepalive = 25` to client config |
| "RTNETLINK answers: Operation not supported" on modprobe | Kernel too old (< 5.6) or WireGuard not installed | Install `wireguard-dkms` package or upgrade kernel |
| Peers listed in `wg show` but can't ping VPN server | AllowedIPs mismatch — client AllowedIPs doesn't include server VPN IP | Ensure server VPN IP (10.10.0.1) is within client's AllowedIPs range |
| `wg-quick: line X: invalid option` | wg0.conf syntax error | Run `wg-quick strip wg0` to validate conf; check for tabs vs spaces |
| IP address conflict with LAN | Client VPN subnet overlaps with local network | Change VPN subnet to unused range (e.g., 10.88.0.0/24 instead of 10.0.0.0/24) |
| Can't SSH to server after bringing up wg0 | iptables FORWARD chain blocking return traffic | Add `iptables -A FORWARD -m state --state ESTABLISHED,RELATED -j ACCEPT` |

---

## Production Checklist

- [ ] Unique key pair per device (never share private keys)
- [ ] `/etc/wireguard/` permissions: directory `700`, private key files `600`
- [ ] `net.ipv4.ip_forward = 1` in `/etc/sysctl.d/`
- [ ] iptables MASQUERADE rule set in `PostUp` / cleaned in `PreDown`
- [ ] `PersistentKeepalive = 25` on all NAT clients
- [ ] `SaveConfig = false` in production (manage config via code)
- [ ] `systemctl enable wg-quick@wg0` for auto-start on reboot
- [ ] Firewall: only port 51820/UDP open externally
- [ ] Client configs distributed via encrypted channel
- [ ] Unused peers removed promptly from config and live interface
- [ ] DNS set for full-tunnel clients to prevent DNS leaks
- [ ] Monitoring: cron/alert on peers with no handshake in > 5 minutes
