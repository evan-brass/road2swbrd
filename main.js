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

	async #signaling_task(remote_desc) {
		if (remote_desc) {
			await super.setRemoteDescription(remote_desc);
		}
		await super.setLocalDescription();
		while (this.iceGatheringState != 'complete') await new Promise(res => this.addEventListener('icegatheringstatechange', res, {once: true}));
		this.#local_res(this.localDescription);

		if (!remote_desc) {
			const remote = await this.#remote;
			await super.setRemoteDescription(remote);
		}
	}
}

const a = new Conn();
const siga = await a.local;

const b = new Conn(null, siga);
const sigb = await b.local;

a.remote = sigb;
