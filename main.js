/**
 * Example Addr-esses:
 * const conn = new Addr('udp:eSfQhc2igaaF_yILi4avPLmpeI6ffxOLB6jr-hvFTJs@example.com').connect();
 * const conn = new Addr('turn:bTKXMJ2yK94aKGWUsbQfNG2RzgG7S5vFgBd-FIzdYXQ@127.0.0.1?turn_transport=tcp').connect();
 */
class Addr extends URL {
	#authority() {
		// Use two URLS to unhide default ports: new URL('https://test.com:443').port == '' and new URL('http://test.com:80').port == ''
		const http = new URL(this); http.protocol = 'http:';
		const https = new URL(this); https.protocol = 'https:';
		const host = (http.host.length < https.host.length) ? https.host : http.host;
		const port = parseInt(http.port || https.port || 3478);
		return { username: http.username, password: http.password, hostname: http.hostname, host, port };
	}
	config() {
		if (/^udp:/i.test(this.protocol)) return null;
		else if (/^turns?:/i.test(this.protocol)) {
			const {host} = this.#authority();
			let transport = this.searchParams.get('turn_transport')
			transport = (transport == 'udp') ? '' : '?transport=' + transport;
			return {
				iceTransportPolicy: 'relay',
				iceServers: [{
					urls: `${this.protocol}${host}${transport}`,
					username: this.searchParams.get('turn_username') || 'the/turn/username/constant',
					credential: this.searchParams.get('turn_credential') || 'the/turn/credential/constant'
				}]
			};
		}
	}
	sig() {
		const {username, hostname, port, password: ice_pwd} = this.#authority();
		const id = new Id(username.replace(/_/g, '/').replace(/-/, '+')); // Convert the username from url-base64-no-pad to base64-no-pad
		if (/^udp:/i.test(this.protocol)) {
			return new Sig({
				id,
				ice_pwd,
				candidates: [
					{address: hostname, port, type: 'host'}
				],
				setup: 'passive',
				ice_lite: true
			});
		}
		else if (/^turns?:/i.test(this.protocol)) {
			return new Sig({
				id,
				ice_pwd,
				candidates: [
					{address: '255.255.255.255', port: 4666, type: 'host'}
				],
				setup: 'active'
			});
		}
	}
	connect(config = null) {
		const adjustment = this.config();
		const ret = new Conn({...config, ...adjustment });

		const sig = this.sig();
		if (!sig) ret.close();
		else ret.remote = sig;

		return ret;
	}
}

class Id {
	constructor(init) {
		if (typeof init == 'string') {
			this['sha-256'] = init;
		} else {
			Object.assign(this, ...arguments);
		}
	}
	add_sdp(sdp) {
		for (const {1: alg, 2: value} of sdp.matchAll(/^a=fingerprint:(sha-256) (.+)/img)) {
			if (alg in this) continue;
			const binstr = String.fromCharCode(...value.split(':').map(s => parseInt(s, 16)));
			this[alg] = btoa(binstr).replace('=', '');
		}
	}
	#hex(alg) {
		let b64 = this[alg];
		while (b64.length % 4) b64 += '=';
		const binstr = atob(b64);
		return Array.from(binstr, c => c.charCodeAt(0).toString(16).padStart(2, '0'));
	}
	*sdp() {
		for (const alg in this) {
			yield `a=fingerprint:${alg} ${this.#hex(alg).join(':')}`;
		}
	}
	[Symbol.toPrimitive](hint) {
		if (hint == 'number') {
			return BigInt('0x' + this.#hex('sha-256').join(''));
		} else {
			return this['sha-256'];
		}
	}
}

class Sig {
	id;
	candidates;
	// ice_pwd;
	// ice_ufrag;
	// setup;
	// ice_lite;
	constructor() { Object.assign(this, ...arguments); }
	add_sdp(sdp) {
		this.id ??= new Id();
		this.id.add_sdp(sdp);
		this.ice_ufrag ??= /^a=ice-ufrag:(.+)/im.exec(sdp)[1];
		this.ice_pwd ??= /^a=ice-pwd:(.+)/im.exec(sdp)[1];
		this.candidates ??= Array.from(
			sdp.matchAll(/^a=candidate:([^ ]+) ([0-9]+) (udp) ([0-9]+) ([^ ]+) ([0-9]+) typ (host|srflx|relay)/img),
			([_fm, foundation, component, transport, priority, address, port, type]) => {
				return {priority: parseInt(priority), address, port: parseInt(port), type}
			}
		);
		this.candidates.sort(({priority: a}, {priority: b}) => b - a);
	}
	*sdp(polite) {
		yield* this.id.sdp();
		const ice_ufrag = this.ice_ufrag || String(this.id);
		yield 'a=ice-ufrag:' + ice_ufrag;
		const ice_pwd = this.ice_pwd || 'the/ice/password/constant';
		yield 'a=ice-pwd:' + ice_pwd;
		if (this.ice_lite) yield 'a=ice-lite';
		for (let i = 0; i < this.candidates.length; ++i) {
			const candidate = this.candidates[i];
			if (typeof candidate == 'string') yield 'a=candidate:' + candidate;
			else if (typeof candidate == 'object') {
				const {
					foundation = 'foundation',
					component = '1',
					transport = 'udp',
					priority = this.candidates.length - i,
					address,
					port = 3478,
					type = 'host'
				} = candidate;
				yield `a=candidate:${foundation} ${component} ${transport} ${priority} ${address} ${port} typ ${type}`;
			}
		}
		const setup = this.setup ?? (polite ? 'passive' : 'active');
		yield 'a=setup:' + setup;
	}
}

const config_default = {
	iceServers: [{urls: 'stun:global.stun.twilio.com'}]
};
class Conn extends RTCPeerConnection {
	#config;
	#dc = this.createDataChannel('', {negotiated: true, id: 0});
	constructor(config = null, remote_desc) {
		super({ ...config_default, ...config});
		this.#config = config;
		this.#dc.addEventListener('open', () => console.log('Connected!'));
		this.#signaling_task(remote_desc);
	}

	#local_res;
	#local = new Promise(res => this.#local_res = res);
	get local() { return this.#local; }
	
	#remote_res;
	#remote = new Promise(res => this.#remote_res = res);
	set remote(remote_desc) { this.#remote_res(remote_desc); }

	#desc(sig, polite) {
		const sdp = [
			'v=0',
			'o=WebRTC-with-addresses 42 0 IN IP4 0.0.0.0',
			's=-',
			't=0 0',
			'm=application 42 UDP/DTLS/SCTP webrtc-datachannel',
			'c=IN IP4 0.0.0.0',
			'a=sctp-port:5000',
			...sig.sdp(polite),
			''
		].join('\n');
		const type = (this.signalingState == 'have-local-offer') ? 'answer' : 'offer';
		return {type, sdp};
	}
	async #signaling_task() {
		const offer = await this.createOffer();
		const local_id = new Id();
		local_id.add_sdp(offer.sdp);
		offer.sdp = offer.sdp.replace(/^a=ice-ufrag:(.+)/im, 'a=ice-ufrag:' + local_id);
		const ice_pwd = this.#config?.ice_pwd || 'the/ice/password/constant';
		offer.sdp = offer.sdp.replace(/^a=ice-pwd:(.+)/im, 'a=ice-pwd:' + ice_pwd);
		await super.setLocalDescription(offer);

		while (this.iceGatheringState != 'complete') await new Promise(res => this.addEventListener('icegatheringstatechange', res, {once: true}));
		const local = new Sig({ id: local_id, ice_ufrag: '', ice_pwd: this.#config?.ice_pwd ?? '' });
		local.add_sdp(this.localDescription.sdp);
		this.#local_res(local);

		const remote = await this.#remote;
		const polite = local.id < remote.id;
		await super.setRemoteDescription(this.#desc(remote, polite));
	}
}
const cert = await RTCPeerConnection.generateCertificate({ name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' });
const config = {
	iceTransportPolicy: 'relay',
	iceServers: [{ urls: 'turn:127.0.0.1?transport=tcp', username: 'the/turn/username/constant', credential: 'the/turn/credential/constant' }],
	certificates: [cert]
};
const fork = new Conn(config);
const username = String((await fork.local).id).replaceAll('/', '_').replaceAll('+', '-');
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
