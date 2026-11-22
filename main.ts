// make.fun tiny-stack-vm-01: a tiny stack ISA v1 VM. Runs each /input/<id>/program.bin on its input.bin and writes
// /output/<id>/{stdout.bin,exit.txt}. ISA.md is the spec, generator/subject/vm.mjs the rule where the two could differ.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const IN = process.env.MAKEFUN_INPUT_DIR ?? '/input', OUT = process.env.MAKEFUN_OUTPUT_DIR ?? '/output', MO = 65536;
// opcode -> immediate bytes << 8 | pops << 4 | pushes; -1 is no such opcode (trap 5).
const T = new Int32Array(256).fill(-1);
const t = (o, i, a, b) => T[o] = i << 8 | a << 4 | b;
t(0,0,0,0);t(1,1,0,1);t(2,4,0,1);t(3,0,1,0);t(4,0,1,2);t(5,0,2,2);t(6,0,2,3);t(7,0,3,3);
for(let o=16;o<31;o++)t(o,0,2,1);
t(23,0,1,1);t(27,0,1,1);t(32,0,2,1);t(33,0,2,1);t(34,0,2,1);
t(48,2,0,0);t(49,2,1,0);t(50,2,1,0);t(51,2,0,0);t(52,0,0,0);
t(64,0,1,1);t(65,0,2,0);t(80,0,1,0);t(81,0,1,0);t(82,0,0,1);t(83,0,1,0);
// One program to its end: out holds the len bytes it wrote, code is the exit code (a trap's code included).
// Every trap ends the program at once and keeps the output written before it: the checks below return early, before
// the instruction's own effect, in ISA.md's order (step limit, pc, opcode, immediate, stack, then the instruction).
function run(p, inp) {
const n = p.length, D = new Int32Array(256), C = new Int32Array(64), M = new Int32Array(256), out = Buffer.alloc(MO);
let sp = 0, cp = 0, len = 0, ip = 0, pc = 0, steps = 0;
const fin = (c) => ({ out, len, code: c });
for (;;) {
if (steps === 1e6) return fin(10); // step limit
if (pc < 0 || pc >= n) return fin(9); // pc outside the program, falling off the end included
const op = p[pc], q = T[op];
if (q < 0) return fin(5);
const im = q >> 8, po = q >> 4 & 3, pu = q & 3;
if (pc + im >= n) return fin(9); // immediate cut off by the program's end
steps++;
if (sp < po) return fin(2);
if (sp - po + pu > 256) return fin(3);
const nx = pc + 1 + im;
pc = nx;
switch (op) {
case 0: return fin(0);
case 1: D[sp++] = p[nx - 1] << 24 >> 24; break; // PUSH8 sign-extends
case 2: D[sp++] = p[nx - 4] | p[nx - 3] << 8 | p[nx - 2] << 16 | p[nx - 1] << 24; break;
case 3: sp--; break;
case 4: D[sp] = D[sp - 1]; sp++; break;
case 5: { const v = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = v; break; }
case 6: D[sp] = D[sp - 2]; sp++; break;
case 7: { const v = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = v; break; }
case 23: D[sp - 1] = -D[sp - 1] | 0; break;
case 27: D[sp - 1] = ~D[sp - 1]; break;
default: { // every opcode the cases above leave: the binary and comparison ops
const b = D[sp - 1], a = D[sp - 2];
let r = 0;
switch (op) {
case 16: r = a + b | 0; break;
case 17: r = a - b | 0; break;
case 18: r = Math.imul(a, b); break; // MUL: the low 32 bits of the exact product
case 19: if (!b) return fin(4); r = a / b | 0; break; // DIV truncates; MIN / -1 wraps to MIN
case 20: if (!b) return fin(4); r = a % b | 0; break; // MOD takes a's sign; x % -1 is 0
case 21: if (!b) return fin(4); r = (a >>> 0) / (b >>> 0) | 0; break;
case 22: if (!b) return fin(4); r = (a >>> 0) % (b >>> 0) | 0; break;
case 24: r = a & b; break;
case 25: r = a | b; break;
case 26: r = a ^ b; break;
case 28: r = a << (b & 31); break; // only the low 5 bits of the count
case 29: r = a >> (b & 31); break;
case 30: r = a >>> (b & 31) | 0; break;
case 32: r = a === b ? 1 : 0; break;
case 33: r = a < b ? 1 : 0; break;
case 34: r = (a >>> 0) < (b >>> 0) ? 1 : 0; break;
}
D[sp - 2] = r;
sp--;
break;
}
case 48: case 49: case 50: { // a signed 16-bit offset from the next instruction
const rel = (p[nx - 2] | p[nx - 1] << 8) << 16 >> 16;
let go = true;
if (op !== 48) { const v = D[--sp]; go = op === 49 ? !v : !!v; }
if (go) pc = nx + rel;
break;
}
case 51: // an unsigned 16-bit address
if (cp === 64) return fin(7);
C[cp++] = nx;
pc = p[nx - 2] | p[nx - 1] << 8;
break;
case 52:
if (!cp) return fin(8);
pc = C[--cp];
break;
case 64: { const a = D[sp - 1]; if (a < 0 || a > 255) return fin(6); D[sp - 1] = M[a]; break; }
case 65: { const a = D[sp - 1], v = D[sp - 2]; if (a < 0 || a > 255) return fin(6); sp -= 2; M[a] = v; break; }
case 80: { // decimal ASCII, '-' when negative, no padding, no newline
const s = '' + D[sp - 1], k = s.length;
if (len + k > MO) return fin(11); // writes none of its bytes
out.write(s, len);
len += k;
sp--;
break;
}
case 81: if (len >= MO) return fin(11); out[len++] = D[--sp] & 255; break;
case 82: D[sp++] = ip < inp.length ? inp[ip++] : -1; break;
case 83: return fin(D[--sp] & 255);
}
}
}
for (const id of readdirSync(IN).sort()) {
const dir = join(IN, id), r = run(readFileSync(join(dir, 'program.bin')), readFileSync(join(dir, 'input.bin'))), od = join(OUT, id);
mkdirSync(od, { recursive: true });
writeFileSync(join(od, 'stdout.bin'), r.out.subarray(0, r.len));
writeFileSync(join(od, 'exit.txt'), r.code + '\n');
}
