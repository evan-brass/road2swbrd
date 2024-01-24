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
        if (hint == 'number') {
            return BigInt('0x' + this.#hex().join(''));
        } else {
            return this.#hex().join(':');
        }
    }
}

const default_config = {
    iceServers: [
        {urls: 'stun:global.stun.twilio.com'},
    ]
}
class Conn extends RTCPeerConnection {
    #dc = this.createDataChannel('', {negotiated: true, id: 0});
    constructor(config = null) {
        super({ ...default_config, ...config });
        this.#dc.addEventListener('open', () => console.log('Connected!'));

        this.#signaling_task();
    }
    
    #local_res;
    #local = new Promise(res => this.#local_res = res);
    get local() { return this.#local; }

    #remote_res;
    #remote = new Promise(res => this.#remote_res = res);
    set remote(desc) { this.#remote_res(desc); }
    
    async #signaling_task() {
        const offer = await super.createOffer();
        const {1: fingerprint} = /^a=fingerprint:sha-256 (.+)/im.exec(offer.sdp);
        const local_id = new Id(fingerprint);
        offer.sdp = offer.sdp.replace(/^a=ice-ufrag:.+/im, 'a=ice-ufrag:' + local_id.to_b64().replace('=', ''));
        offer.sdp = offer.sdp.replace(/^a=ice-pwd:.+/im, 'a=ice-pwd:the/ice/password/constant');
        await super.setLocalDescription(offer);
        while (this.iceGatheringState != 'complete') {
            await new Promise(res => this.addEventListener('icegatheringstatechange', res, {once: true}));
        }
        const local = this.#collapse(this.localDescription);
        this.#local_res(local);

        const remote = await this.#remote;
        const polite = local_id < remote.id;
        
        await super.setRemoteDescription(this.#expand(remote, polite));
    }

    #collapse({sdp, type}) {
        const {1: fingerprint} = /^a=fingerprint:sha-256 (.+)/im.exec(sdp);
        const candidates = Array.from(
            sdp.matchAll(/^a=candidate:([^ ]) ([0-9]+) ([0-9]+) (udp|tcp) ([^ ]) ([0-9]+) typ (host|srflx|relay)/img),
            ([_fullmatch, foundation, component, priority, transport, address, port, type]) => ({
                priority: parseInt(priority),
                transport,
                address,
                port: parseInt(port),
                type
            })
        );
        const id = new Id(fingerprint);

        return {id, candidates};
    }
    #expand({id, setup, candidates}, polite) {
        const ice_ufrag = id.to_b64().replace('=', '');
        const ice_pwd = 'the/ice/password/constant';
        const fingerprint = String(id);
        const sdp = [
            'v=0',
            'o=- 7859251806667725441 2 IN IP4 127.0.0.1',
            's=-',
            't=0 0',
            'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
            'c=IN IP4 0.0.0.0',
            ...candidates.map(c => 'a=candidate:' + c),
            `a=ice-ufrag:${ice_ufrag}`,
            `a=ice-pwd:${ice_pwd}`,
            `a=fingerprint:sha-256 ${fingerprint}`,
            `a=setup:${setup || polite ? 'passive' : 'active'}`,
            'a=sctp-port:5000',
            ''
        ].join('\n');
        return {sdp, type: 'answer'};
    }
    setLocalDescription() { throw new Error("Manual signaling disabled."); }
    setRemoteDescription() { throw new Error("Manual signaling disabled."); }
    createOffer() { throw new Error("Manual signaling disabled."); }
    createAnswer() { throw new Error("Manual signaling disabled."); }
}

const a = new Conn();
const b = new Conn();
const [siga, sigb] = await Promise.all([a.local, b.local]);
console.log(siga);
console.log(sigb);
a.remote = sigb;
b.remote = siga;
