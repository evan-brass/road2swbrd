import {base58} from './src/base58.js';

export const defaults = {
	iceServers: [{urls: 'stun:global.stun.twilio.com'}]
};

const known_ids = new WeakMap();
export async function get_id(cert = null, conn = null) {
	const known = known_ids.get(cert);
	if (known) return known;
	
	// If the cert has getFingerprints then use that
	let fingerprint;
	if (cert?.getFingerprints) {
		for (const {algorithm, value} of cert.getFingerprints()) {
			if (algorithm.toLowerCase() == 'sha-256') {
				fingerprint = value;
				break;
			}
		}
	}

	// Otherwise use a peer connection (the one provided or a temporary one)
	if (!fingerprint) {
		const pc = conn ?? new RTCPeerConnection({ certificates: [cert] });
		if (!conn) pc.createDataChannel('');
		const offer = await pc.createOffer();
		fingerprint = /^a=fingerprint:sha-256 (.+)/im.exec(offer.sdp)?.[1];
		if (!conn) pc.close();
	}


	if (!fingerprint) return 0n;
	const id = BigInt('0x' + fingerprint.split(':').join(''));

	// Insert the id into the known_ids (if the cert was provided)
	if (cert instanceof RTCCertificate) known_ids.set(cert, id);

	return id;
}

export class Conn extends RTCPeerConnection {
	#dc = this.createDataChannel('', {negotiated: true, id: 0});
	constructor(config) {
		if (config?.certificates?.length > 1) throw new Error("You may only provide 1 certificate.");
		const cert = config?.cert ?? config?.certificates?.[0] ?? cert;
		super({
			...defaults,
			...config,
			certificates: [cert],
			bundlePolicy: 'max-bundle',
			rtcpMuxPolicy: 'require',
			peerIdentity: null,
		});

		this.#signaling_task(config);
	}
	static async generateCertificate() {
		return await super.generateCertificate({ name: 'ECDSA', namedCurve: 'P-256' });
	}

	async #signaling_task(config) {
		const {
			pid,
			lpid = await get_id(
				config?.cert ?? config?.certificates?.[0],
				this
			),
			polite = lpid < pid,
			setup = polite ? 'active' : 'passive',
			ice_lite = false,
			ice_pwd = 'the/ice/password/constant'
		} = config ?? {};
		
		// Prepare for renegotiation
		let negotiation_needed = false; this.addEventListener('negotiationneeded', () => negotiation_needed = true);
		this.#dc.addEventListener('message', async ({ data }) => { try {
			const { candidate } = JSON.parse(data);
			if (candidate) await this.addIceCandidate(candidate);
		} catch {}});
		this.addEventListener('icecandidate', ({candidate}) => {
			if (candidate && this.#dc.readyState == 'open') {
				this.#dc.send(JSON.stringify({ candidate }));
			}
		});
		let remote_desc = false; this.#dc.addEventListener('message', ({data}) => { try {
			const { description } = JSON.parse(data);
			if (description) remote_desc = description;
		} catch {}})

		// First pass of signaling
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

		// Switchover into handling renegotiation
		while (1) {
			if (['closing', 'closed'].includes(this.#dc.readyState)) { break; }
			else if (this.#dc.readyState == 'connecting') {
				await new Promise(res => this.#dc.addEventListener('open', res, {once: true}));
			}
			else if (negotiation_needed) {
				negotiation_needed = false;
				await super.setLocalDescription();
				try { this.#dc.send(JSON.stringify({ description: this.localDescription })); } catch {}
			}
			else if (remote_desc) {
				const desc = remote_desc; remote_desc = false;
				// Ignore incoming offers if we have a local offer and are also impolite
				if (desc?.type == 'offer' && this.signalingState == 'have-local-offer' && !polite) continue;

				await super.setRemoteDescription(desc);

				if (desc?.type == 'offer') negotiation_needed = true; // Call setLocalDescription.
			}
			else {
				// Wait for something to happen
				await new Promise(res => {
					this.addEventListener('negotiationneeded', res, {once: true});
					this.#dc.addEventListener('message', res, {once: true});
					this.#dc.addEventListener('close', res, {once: true});
				});
			}
		}
	}
}

const certa = await Conn.generateCertificate();
const certb = await Conn.generateCertificate();
const ida = await get_id(certa);
const idb = await get_id(certb);

const a = new Conn({ pid: idb, cert: certa });
const b = new Conn({ pid: ida, cert: certb });
// console.log(a.addTransceiver('audio'));

a.addEventListener('icecandidate', ({ candidate }) => b.addIceCandidate(candidate));
b.addEventListener('icecandidate', ({ candidate }) => a.addIceCandidate(candidate));
