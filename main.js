const a = new RTCPeerConnection();
a.createDataChannel('');

await a.setLocalDescription();
while (a.iceGatheringState != 'complete') await new Promise(res => a.addEventListener('icegatheringstatechange', res, {once: true}));

const b = new RTCPeerConnection();
await b.setRemoteDescription(a.localDescription);
await b.setLocalDescription();
while (b.iceGatheringState != 'complete') await new Promise(res => b.addEventListener('icegatheringstatechange', res, {once: true}));

await a.setRemoteDescription(b.localDescription);
