import { Cert } from './src/cert.js';
import { Conn } from './src/conn.js';
import { Addr } from './src/addr.js';

const a = new Addr('udp:seed.evan-brass.net'); await a.resolve_id(); a.connect();
new Addr('udp:vMLqtj41eqxrH4ExSw893MLbgDm1JHWqkv9R9AMqhHDE@example.com').connect();
new Addr('turn:U5PYjsHYz77HroCoCTy7hM9YuZ9G6oFZ6z3mWrFCP8uF@127.0.0.1?turn_transport=tcp').connect();
