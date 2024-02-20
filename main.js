import {base58} from './src/base58.js';


export const defaults = {
	iceServers: [{urls: 'stun:global.stun.twilio.com'}]
};

export class Conn extends RTCPeerConnection {
	#dc = this.createDataChannel('', {negotiated: true, id: 0});
	constructor(config) {
		super({
			...defaults,
			...config,
			bundlePolicy: 'max-bundle',
			rtcpMuxPolicy: 'require',
			peerIdentity: null,
		});

		this.#signaling_task(config);
	}

	async #signaling_task({
		lpid, pid,
		polite = lpid < pid,
		setup = polite ? 'active' : 'passive',
		ice_lite = false,
		ice_pwd = 'the/ice/password/constant'
	} = {}) {
		const fingerprint = pid.toString(16).padStart(64, '0').replace(/[0-9a-f]{2}/ig, ':$&').slice(1);
		const ice_ufrag = base58(pid);
		await super.setRemoteDescription({ type: 'offer', sdp: [
			'v=0',
			'o=swbrd 42 0 IN IP4 0.0.0.0',
			's=-',
			't=0 0',
			'a=group:BUNDLE dc',
			`a=fingerprint:sha-256 ${fingerprint}`,
			`a=ice-ufrag:${ice_ufrag}`,
			`a=ice-pwd:${ice_pwd}`,
			'a=ice-options:trickle',
			...(ice_lite ? ['a=ice-lite'] : []),
			'm=application 42 UDP/DTLS/SCTP webrtc-datachannel',
			'c=IN IP4 0.0.0.0',
			'a=mid:dc',
			`a=setup:${setup}`,
			'a=sctp-port:5000',
			''
		].join('\n') });
		const answer = await super.createAnswer();
		answer.sdp = answer.sdp
			.replace(/^a=ice-ufrag:.+/im, `a=ice-ufrag:${base58(lpid)}`)
			.replace(/^a=ice-pwd:.+/im, `a=ice-pwd:${ice_pwd}`);
		// TODO: Anything else that we need to mung?

		await super.setLocalDescription(answer);

		// TODO: switchover to perfect negotiation
	}
}

export class Cert extends RTCCertificate {
	id;
	static async generate(params = { name: 'ECDSA', namedCurve: 'P-256' }) {
		const ret = await RTCPeerConnection.generateCertificate(params);
		Object.setPrototypeOf(ret, this.prototype);

		// Try to get the id using getFingerprints
		let fingerprint;
		if ('getFingerprints' in ret) {
			for (const {algorithm, value} of ret.getFingerprints()) {
				if (algorithm.toLowerCase() == 'sha-256') {
					fingerprint = value;
					break;
				}
			}
		}

		// Otherwise use a temporary connection using the certificate
		if (!fingerprint) {
			const temp = new RTCPeerConnection({ certificates: [ret] });
			temp.createDataChannel('');
			const offer = await temp.createOffer();
			fingerprint = /^a=fingerprint:sha-256 (.+)/im.exec(offer.sdp)?.[1];
			temp.close();
		}

		if (!fingerprint) throw new Error("Failed to get the sha-256 fingerprint for the generated certificate");
		ret.id = BigInt('0x' + fingerprint.split(':').join(''));
		
		return ret;
	}
	connect(pid, config = null) {
		const ret = new Conn({
			...config,
			lpid: this.id,
			pid: BigInt(pid),
			certificates: [this]
		});

		return ret;
	}
}

const certa = await Cert.generate({
	name: 'ECDSA',
	namedCurve: 'P-256'
});
const certb = await Cert.generate({
	name: "RSASSA-PKCS1-v1_5",
	modulusLength: 2048,
	publicExponent: new Uint8Array([1, 0, 1]),
	hash: "SHA-256",
});

const a = certa.connect(certb.id);
const b = certb.connect(certa.id);

a.addEventListener('icecandidate', ({ candidate }) => b.addIceCandidate(candidate));
b.addEventListener('icecandidate', ({ candidate }) => a.addIceCandidate(candidate));
