import { Cert } from './src/cert.js';
import { Conn } from './src/conn.js';
import { Addr } from './src/addr.js';

const a = new Addr('udp:seed.evan-brass.net'); await a.resolve_id();
const t = a.connect();
console.log(t);
