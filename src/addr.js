import { Id } from './id.js';
import { Conn, Sig } from './conn.js';
import { query_txt } from './dns.js';
/**
 * Example Addr-esses:
 * const a = new Addr('udp:seed.evan-brass.net'); await a.resolve_id(); const conn = a.connect();
 * const conn = new Addr('udp:eSfQhc2igaaF_yILi4avPLmpeI6ffxOLB6jr-hvFTJs@example.com').connect();
 * const conn = new Addr('turn:bTKXMJ2yK94aKGWUsbQfNG2RzgG7S5vFgBd-FIzdYXQ@127.0.0.1?turn_transport=tcp').connect();
 */
export class Addr extends URL {
	#id;
	get id() {
		return this.#id ?? Id.from_str(
			// Convert the username from url-base64-no-pad to base64-no-pad:
			this.#authority().username
		);
	}
	async resolve_id() {
		this.#id ??= this.id;
		if (this.#id) return this.#id;
		for await(const s of query_txt(this.#authority().hostname, {prefix: 'swbrd='})) {
			this.#id ??= Id.from_str(s);
			if (this.#id) return this.#id;
		}
	}
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
		const {hostname, port, password: ice_pwd} = this.#authority();
		const candidates = [];
		let setup = this.searchParams.get('setup');
		let ice_lite;
		if (/^udp:/i.test(this.protocol)) {
			candidates.push({address: hostname, port, type: 'host'});
			setup ??= 'passive';
			ice_lite ??= true;
		}
		else if (/^turns?:/i.test(this.protocol)) {
			candidates.push({address: '255.255.255.255', port: 4666, type: 'host'});
			setup ??= 'active';
		}
		return new Sig({
			id: this.id,
			candidates,
			ice_pwd,
			setup,
			ice_lite
		});
	}
	connect(config = null) {
		if (!this.id) return; // Early return if Addr doesn't have a resolved Id.

		const adjustment = this.config();
		const ret = new Conn({...config, ...adjustment });

		ret.remote = this.sig();

		return ret;
	}
}
