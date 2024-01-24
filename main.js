const config_default = {
	iceServers: [{urls: 'stun:global.stun.twilio.com'}]
};
function collapse({type, sdp}) {
	const {1: ice_ufrag} = /^a=ice-ufrag:(.+)/im.exec(sdp);
	const {1: ice_pwd} = /^a=ice-pwd:(.+)/im.exec(sdp);
	const {1: fingerprint} = /^a=fingerprint:sha-256 (.+)/im.exec(sdp);
	const {1: setup} = /^a=setup:(.+)/im.exec(sdp);
	const candidates = Array.from(
		sdp.matchAll(/^a=candidate:(.+)/img),
		({1: candidate}) => candidate
	);

	return {type, ice_ufrag, ice_pwd, fingerprint, setup, candidates};
}
function expand({type, ice_ufrag, ice_pwd, fingerprint, setup, candidates}) {
	const sdp = [
		'v=0',
		'o=WebRTC-with-addresses 5736221942966321338 0 IN IP4 0.0.0.0',
		's=-',
		't=0 0',
		`a=fingerprint:sha-256 ${fingerprint}`,
		'm=application 42 UDP/DTLS/SCTP webrtc-datachannel',
		'c=IN IP4 0.0.0.0',
		`a=ice-ufrag:${ice_ufrag}`,
		`a=ice-pwd:${ice_pwd}`,
		`a=setup:${setup}`,
		'a=sctp-port:5000',
		...candidates.map(c => 'a=candidate:' + c),
		'',
	].join('\n');
	return {type, sdp};
}
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

	async #signaling_task(remote_desc) {
		if (remote_desc) {
			await super.setRemoteDescription(expand(remote_desc));
		}
		await super.setLocalDescription();
		while (this.iceGatheringState != 'complete') await new Promise(res => this.addEventListener('icegatheringstatechange', res, {once: true}));
		this.#local_res(collapse(this.localDescription));

		if (!remote_desc) {
			const remote = await this.#remote;
			await super.setRemoteDescription(expand(remote));
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
