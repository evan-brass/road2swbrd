class Id {
    value;
    constructor(init) {
        if (typeof init == 'string') {
            this.value = String.fromCharCode(...init.split(':').map(s => parseInt(s, 16)));
            
        } else {
            Object.assign(this, ...arguments);
        }
    }
    #hex() {
        return Array.from(this.value, c => c.charCodeAt(0).toString(16).padStart(2, '0'));
    }
    to_b64() {
        return btoa(this.value);
    }
    static from_b64(b64) {
        return new this({ value: atob(b64) });
    }
    [Symbol.toPrimitive](hint) {
        return this.#hex().join(':');
    }
}

const default_config = {
    iceServers: [
        {urls: 'stun:global.stun.twilio.com'},
    ]
}
class Conn extends RTCPeerConnection {
    #dc = this.createDataChannel('', {negotiated: true, id: 0});
    constructor(config = null, remote_desc) {
        super({ ...default_config, ...config });
        this.#dc.addEventListener('open', () => console.log('Connected!'));

        this.#signaling_task(remote_desc);
    }
    
    #local_res;
    #local = new Promise(res => this.#local_res = res);
    get local() { return this.#local; }

    #remote_res;
    #remote = new Promise(res => this.#remote_res = res);
    set remote(desc) { this.#remote_res(desc); }
    
    async #signaling_task(remote_desc) {
        if (remote_desc) {
            await this.setRemoteDescription(this.#expand(remote_desc));
        }

        await this.setLocalDescription();
        while (this.iceGatheringState != 'complete') {
            await new Promise(res => this.addEventListener('icegatheringstatechange', res, {once: true}));
        }
        this.#local_res(this.#collapse(this.localDescription));

        if (!remote_desc) {
            const remote = await this.#remote;
            await this.setRemoteDescription(this.#expand(remote));
        }
    }

    #collapse({sdp, type}) {
        const {1: ice_ufrag} = /^a=ice-ufrag:(.+)/im.exec(sdp);
        const {1: ice_pwd} = /^a=ice-pwd:(.+)/im.exec(sdp);
        const {1: fingerprint} = /^a=fingerprint:sha-256 (.+)/im.exec(sdp);
        const {1: setup} = /^a=setup:(.+)/im.exec(sdp);
        const candidates = Array.from(
            sdp.matchAll(/^a=candidate:(.+)/img),
            ({1: candidate}) => candidate
        );
        const id = new Id(fingerprint);


        return {type, ice_ufrag, ice_pwd, id, setup, candidates};
    }
    #expand({type, ice_ufrag, ice_pwd, id, setup, candidates}) {
        const fingerprint = String(id);
        const sdp = [
            'v=0',
            'o=- 7859251806667725441 2 IN IP4 127.0.0.1',
            's=-',
            't=0 0',
            // 'a=group:BUNDLE 0',
            // 'a=extmap-allow-mixed',
            // 'a=msid-semantic: WMS',
            'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
            'c=IN IP4 0.0.0.0',
            ...candidates.map(c => 'a=candidate:' + c),
            `a=ice-ufrag:${ice_ufrag}`,
            `a=ice-pwd:${ice_pwd}`,
            // 'a=ice-options:trickle',
            `a=fingerprint:sha-256 ${fingerprint}`,
            `a=setup:${setup}`,
            // 'a=mid:0',
            'a=sctp-port:5000',
            // 'a=max-message-size:262144',
            ''
        ].join('\n');
        return {sdp, type};
    }
}

const a = new Conn();
const siga = await a.local;
console.log(siga);

const b = new Conn(null, siga);
const sigb = await b.local;
console.log(sigb);

a.remote = sigb;
