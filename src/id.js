export class Id {
	constructor(init) {
		if (typeof init == 'string') {
			this['sha-256'] = init;
		} else {
			Object.assign(this, ...arguments);
		}
	}
	add_sdp(sdp) {
		const {1: value} = /^a=fingerprint:sha-256 (.+)/im.exec(sdp);
		if (value) {
			const binstr = String.fromCharCode(...value.split(':').map(s => parseInt(s, 16)));
			this['sha-256'] = btoa(binstr).replace('=', '');
		}
	}
	#hex(alg) {
		let b64 = this[alg];
		while (b64.length % 4 != 0) b64 += '=';
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
