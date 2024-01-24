import { Id } from './id.js';

export class Sig {
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

export const config_default = {
	iceServers: [{urls: 'stun:global.stun.twilio.com'}]
};
export class Conn extends RTCPeerConnection {
	#config;
	#dc = this.createDataChannel('', {negotiated: true, id: 0});
	constructor(config = null) {
		super({ ...config_default, ...config});
		this.#config = config;
		this.#dc.addEventListener('open', () => console.log('Connected!'));
		this.#signaling_task();
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
