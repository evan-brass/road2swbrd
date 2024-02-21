import { cert as certa } from './src/cert.js?peera';
import { cert as certb } from './src/cert.js?peerb';
import { Conn } from './src/conn.js';

console.log(certa, certb);

const a = new Conn(certb, { cert: certa });
const b = new Conn(certa, { cert: certb });
// console.log(a.addTransceiver('audio'));

a.addEventListener('icecandidate', ({ candidate }) => b.addIceCandidate(candidate));
b.addEventListener('icecandidate', ({ candidate }) => a.addIceCandidate(candidate));
