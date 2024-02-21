
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
			temp.createDataChannel('');
			const offer = await temp.createOffer();
			for (const {1: algorithm, 2: value} of offer.sdp.matchAll(/^a=fingerprint:([^ ]+) ([0-9a-f]{2}(:[0-9a-f]{2})+)/img)) {
				if (algorithm.toLowerCase() == String(idf)) {
					fingerprint = value;
					break;
				}
			}
			temp.close();
		}

		// If we didn't get the required fingerprint, then return nothing
		if (!fingerprint) return;

		ret.id = BigInt.asUintN(
			Number(idf),
			BigInt('0x' + fingerprint.split(':').join(''))
		);

		return ret;
	}
	static async load() {
		function wrap(req) {
			return new Promise((res, rej) => {
				req.onsuccess = () => res(req.result);
				req.onerror = () => rej(req.error);
			});
		}
		const openreq = indexedDB.open('swbrd-certs', 1);
		openreq.onupgradeneeded = ({oldVersion, newVersion, target: {result: db}}) => {
			db.createObjectStore('certs');
		};
		openreq.onblocked = ({ oldVersion, newVersion }) => rej(new Error(`Certificate Database blocked: ${oldVersion} -> ${newVersion}`));
		const db = await wrap(openreq);

		// Generate a replacement in case the existing certificate has expired / doesn't match the idf / etc.
		const candidate = await this.generate();

		const trans = db.transaction('certs', 'readwrite');
		const certs = trans.objectStore('certs');
		const cursor_req = certs.openCursor(import.meta.url);
		let cursor;
		while (cursor = await wrap(cursor_req)) {
			const { cert, id, algorithm } = cursor.value;
			if (cert.expires - Date.now() < 2 * (24 * 60 * 60 * 1000)) {
				cursor.delete();
			}
			else if (algorithm != String(idf)) {
				cursor.continue();
			}
			else {
				Object.setPrototypeOf(cert, this.prototype);
				cert.id = id;
				return cert;
			}
		}
		await wrap(certs.put({
			cert: candidate,
			id: candidate.id,
			algorithm: String(idf)
		}, import.meta.url));

		return candidate;
	}
	[Symbol.toPrimitive]() {
		return this.id;
	}
}

export const cert = await Cert.load();
