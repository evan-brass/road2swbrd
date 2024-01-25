import { Conn, Sig } from './src/conn.js';
import { Addr } from './src/addr.js';

const test = new Addr('udp:seed.evan-brass.net');
console.log(await test.resolve_id());

const cert = await RTCPeerConnection.generateCertificate({ name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' });
const config = {
	iceTransportPolicy: 'relay',
	iceServers: [{ urls: 'turn:127.0.0.1?transport=tcp', username: 'the/turn/username/constant', credential: 'the/turn/credential/constant' }],
	certificates: [cert]
};
const fork = new Conn(config);
const username = String((await fork.local).id);
const addr = new Addr(`turn:${username}@127.0.0.1?turn_transport=tcp`);
console.log(addr.href);

const answered = new Set();
setInterval(async () => {
	const stats = await fork.getStats();
	for (const dict of stats.values()) {
		const {type, port, usernameFragment } = dict;
		if (type != 'remote-candidate' || !usernameFragment) continue;
		if (answered.has(usernameFragment)) continue;
		
		console.log('answering', usernameFragment);
		const answer = new Conn(config);
		answered.add(usernameFragment);
		answer.addEventListener('close', () => answered.delete(usernameFragment));
		
		answer.remote = new Sig({
			id: new Id(usernameFragment),
			candidates: [
				{address: '255.255.255.255', port: port || 4666, type: 'host'}
			],
			setup: 'passive'
		});
	}
}, 1000);

const incoming = addr.connect();

// const a = new Conn();
// const b = new Conn();
// const siga = await a.local;
// const sigb = await b.local;
// console.log(siga);
// console.log(sigb);
// a.remote = sigb;
// b.remote = siga;
