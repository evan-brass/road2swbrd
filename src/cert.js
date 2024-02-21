
export const idf = new class IdFingerprint {
	algorithm;
	bits;
	constructor() { Object.assign(this, ...arguments); }
	[Symbol.toPrimitive](hint) {
		if (hint == 'number') return this.bits;
		else return this.algorithm;
	}
}({ algorithm: 'sha-256', bits: 256 });

export class Cert extends RTCCertificate {
	id;
	static async generate(params = { name: 'ECDSA', namedCurve: 'P-256' }) {
		const ret = await RTCPeerConnection.generateCertificate(params);
		Object.setPrototypeOf(ret, this.prototype);

		let fingerprint;
		// Try to retreive the fingerprint using getFingerprints
		if (ret?.getFingerprints) {
			for (const {algorithm, value} of ret.getFingerprints()) {
				if (algorithm.toLowerCase() == String(idf)) {
					fingerprint = value;
					break;
				}
			}
		}

		// Try to retreive the fingerprint using a temporary connection
		if (!fingerprint) {
			const temp = new RTCPeerConnection({ certificates: [ret] });
			temp.createDataChannel();
			const offer = await temp.createOffer();
			for (const {1: algorithm, 2: value} of offer.sdp.matchAll(/^a=fingerprint:([^ ]+) ([0-9a-f]{2}(:[0-9a-f]{2})+)/img)) {
				if (algorithm.toLowerCase() == String(idf)) {
					fingerprint = value;
					break;
				}
			}
			temp.close();
		}

		// If we couldn't find the needed fingerprint
		if (!fingerprint) return;

		ret.id = BigInt.asUintN(
			Number(idf),
			BigInt('0x' + fingerprint.split(':').join(''))
		);

		return ret;
	}
	[Symbol.toPrimitive]() {
		return this.id;
	}
}
