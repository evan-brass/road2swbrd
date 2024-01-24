class Sig {
	fingerprint256;
	ice_ufrag;
	ice_pwd;
	candidates;
	setup;
	constructor() { Object.assign(this, ...arguments); }
	add_sdp(sdp) {
		this.fingerprint256 ??= /^a=fingerprint:sha-256 (.+)/im.exec(sdp)[1];
		this.ice_ufrag ??= /^a=ice-ufrag:(.+)/im.exec(sdp)[1];
		this.ice_pwd ??= /^a=ice-pwd:(.+)/im.exec(sdp)[1];
		this.candidates ??= Array.from(
			sdp.matchAll(/^a=candidate:(.+)/img),
			({1: candidate}) => candidate
		);
		this.setup ??= /^a=setup:(.+)/im.exec(sdp)[1];
	}
	*sdp(_polite) {
		yield 'a=fingerprint:sha-256 ' + this.fingerprint256;
		yield 'a=ice-ufrag:' + this.ice_ufrag;
		yield 'a=ice-pwd:' + this.ice_pwd;
		for (const candidate of this.candidates) {
			yield 'a=candidate:' + candidate;
		}
		if (this.setup) yield 'a=setup:' + this.setup;
	}
}

const config_default = {
	iceServers: [{urls: 'stun:global.stun.twilio.com'}]
};
class Conn extends RTCPeerConnection {
	#dc = this.createDataChannel('', {negotiated: true, id: 0});
	constructor(config = null, remote_desc) {
		super({ ...config_default, ...config});
		this.#dc.addEventListener('open', () => console.log('Connected!'));
		this.#signaling_task(remote_desc);
	}

	#local_res;
	#local = new Promise(res => this.#local_res = res);
	get local() { return this.#local; }
	
	#remote_res;
	#remote = new Promise(res => this.#remote_res = res);
	set remote(remote_desc) { this.#remote_res(remote_desc); }

	#desc(sig) {
		const sdp = [
			'v=0',
			'o=WebRTC-with-addresses 42 0 IN IP4 0.0.0.0',
			's=-',
			't=0 0',
			'm=application 42 UDP/DTLS/SCTP webrtc-datachannel',
			'c=IN IP4 0.0.0.0',
			'a=sctp-port:5000',
			...sig.sdp(),
			''
		].join('\n');
		const type = (this.signalingState == 'have-local-offer') ? 'answer' : 'offer';
		return {type, sdp};
	}
	async #signaling_task(remote) {
		if (remote) {
			await super.setRemoteDescription(this.#desc(remote));
		}
		await super.setLocalDescription();
		while (this.iceGatheringState != 'complete') await new Promise(res => this.addEventListener('icegatheringstatechange', res, {once: true}));
		const local = new Sig();
		local.add_sdp(this.localDescription.sdp);
		this.#local_res(local);

		if (!remote) {
			remote = await this.#remote;
			await super.setRemoteDescription(this.#desc(remote));
		}
	}
}

const a = new Conn();
const siga = await a.local;
console.log(siga);

const b = new Conn(null, siga);
const sigb = await b.local;
console.log(sigb);

a.remote = sigb;
