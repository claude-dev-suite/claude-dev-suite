---
name: webrtc
description: |
  WebRTC peer-to-peer communication. Signaling, ICE/STUN/TURN, media streams,
  data channels, screen sharing, and SFU integration (mediasoup, LiveKit).

  USE WHEN: user mentions "WebRTC", "video call", "peer-to-peer", "P2P",
  "screen sharing", "data channel", "STUN", "TURN", "mediasoup", "LiveKit"

  DO NOT USE FOR: server-to-client streaming - use `sse`;
  chat messaging - use `socket-io`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# WebRTC

## Peer Connection Setup

```typescript
const config: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'turn:turn.example.com', username: 'user', credential: 'pass' },
  ],
};

const pc = new RTCPeerConnection(config);

// Get local media
const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
stream.getTracks().forEach((track) => pc.addTrack(track, stream));

// Display remote stream
pc.ontrack = (event) => {
  remoteVideo.srcObject = event.streams[0];
};

// ICE candidates — send to remote peer via signaling
pc.onicecandidate = (event) => {
  if (event.candidate) {
    signalingChannel.send({ type: 'ice-candidate', candidate: event.candidate });
  }
};
```

## Signaling (via Socket.IO)

```typescript
// Caller
const offer = await pc.createOffer();
await pc.setLocalDescription(offer);
socket.emit('signal', { type: 'offer', sdp: offer });

// Callee — on receiving offer
socket.on('signal', async (msg) => {
  if (msg.type === 'offer') {
    await pc.setRemoteDescription(msg.sdp);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('signal', { type: 'answer', sdp: answer });
  } else if (msg.type === 'answer') {
    await pc.setRemoteDescription(msg.sdp);
  } else if (msg.type === 'ice-candidate') {
    await pc.addIceCandidate(msg.candidate);
  }
});
```

## Data Channels

```typescript
const dataChannel = pc.createDataChannel('chat', { ordered: true });

dataChannel.onopen = () => dataChannel.send('Hello!');
dataChannel.onmessage = (e) => console.log('Received:', e.data);

// Remote side
pc.ondatachannel = (event) => {
  const channel = event.channel;
  channel.onmessage = (e) => console.log('Received:', e.data);
};
```

## Screen Sharing

```typescript
const screenStream = await navigator.mediaDevices.getDisplayMedia({
  video: { cursor: 'always' },
  audio: true,
});

const videoTrack = screenStream.getVideoTracks()[0];
const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
await sender?.replaceTrack(videoTrack);

videoTrack.onended = () => {
  // User stopped sharing — switch back to camera
  const cameraTrack = localStream.getVideoTracks()[0];
  sender?.replaceTrack(cameraTrack);
};
```

## LiveKit (SFU — recommended for group calls)

```typescript
import { Room, RoomEvent } from 'livekit-client';

const room = new Room();
await room.connect(LIVEKIT_URL, accessToken);

await room.localParticipant.enableCameraAndMicrophone();

room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
  const element = track.attach();
  document.getElementById('remote-videos')!.appendChild(element);
});

room.on(RoomEvent.ParticipantDisconnected, (participant) => {
  console.log(`${participant.identity} left`);
});
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| No TURN server | Always configure TURN for NAT traversal |
| P2P for group calls (>4 users) | Use SFU (LiveKit, mediasoup) |
| No error handling on getUserMedia | Handle NotAllowedError, NotFoundError |
| Signaling over unencrypted channel | Use WSS (WebSocket Secure) |
| No connection state monitoring | Listen to `connectionstatechange` event |

## Production Checklist

- [ ] TURN server deployed and configured
- [ ] SFU for group video (>3 participants)
- [ ] Fallback UI when media access denied
- [ ] Connection quality monitoring
- [ ] Bandwidth adaptation (simulcast)
- [ ] Recording capability if needed
