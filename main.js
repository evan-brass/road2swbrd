import { Cert } from './src/cert.js';
import { Conn } from './src/conn.js';

const certa = await Cert.load('peera');
const certb = await Cert.load('peerb');

console.log(certa, certb);

const a = new Conn(certb, { cert: certa });
const b = new Conn(certa, { cert: certb });
console.log(a.addTransceiver('audio'));

a.addEventListener('icecandidate', ({ candidate }) => b.addIceCandidate(candidate));
b.addEventListener('icecandidate', ({ candidate }) => a.addIceCandidate(candidate));
