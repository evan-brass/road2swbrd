import { Id } from './id';
import { Conn } from './conn.js';
/**
 * Example Addr-esses:
 * const conn = new Addr('udp:eSfQhc2igaaF_yILi4avPLmpeI6ffxOLB6jr-hvFTJs@example.com').connect();
 * const conn = new Addr('turn:bTKXMJ2yK94aKGWUsbQfNG2RzgG7S5vFgBd-FIzdYXQ@127.0.0.1?turn_transport=tcp').connect();
 */
export class Addr extends URL {
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
