// make.fun tiny-stack-vm-01: runs each /input/<id>/program.bin on its input.bin under the tiny stack ISA v1 and
// writes /output/<id>/{stdout.bin,exit.txt}. ISA.md is the spec; generator/subject/vm.mjs is where it is ambiguous.
// Node stdlib only, deterministic, Int32Array machine, one switch per step, no per-step allocation, traps return.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const IN = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUT = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const MO = 65536;

// opcode -> immediate bytes << 8 | pops << 4 | pushes; -1 is no such opcode (trap 5).
const T = new Int32Array(256).fill(-1);
const t = (o, i, a, b) => T[o] = i << 8 | a << 4 | b;
t(0x00, 0, 0, 0); t(0x01, 1, 0, 1); t(0x02, 4, 0, 1); t(0x03, 0, 1, 0);
t(0x04, 0, 1, 2); t(0x05, 0, 2, 2); t(0x06, 0, 2, 3); t(0x07, 0, 3, 3);
for (let o = 0x10; o <= 0x1e; o++) t(o, 0, 2, 1);
t(0x17, 0, 1, 1); t(0x1b, 0, 1, 1);
t(0x20, 0, 2, 1); t(0x21, 0, 2, 1); t(0x22, 0, 2, 1);
t(0x30, 2, 0, 0); t(0x31, 2, 1, 0); t(0x32, 2, 1, 0); t(0x33, 2, 0, 0); t(0x34, 0, 0, 0);
t(0x40, 0, 1, 1); t(0x41, 0, 2, 0); t(0x50, 0, 1, 0); t(0x51, 0, 1, 0); t(0x52, 0, 0, 1); t(0x53, 0, 1, 0);

// One program to its end: out holds the len bytes it wrote, code is the exit code (a trap's code included).
function run(p, inp) {
  const n = p.length, D = new Int32Array(256), C = new Int32Array(64), M = new Int32Array(256);
  const out = Buffer.alloc(MO);
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
      case 0x00: return fin(0);
      case 0x01: D[sp++] = p[nx - 1] << 24 >> 24; break;
      case 0x02: D[sp++] = p[nx - 4] | p[nx - 3] << 8 | p[nx - 2] << 16 | p[nx - 1] << 24; break;
      case 0x03: sp--; break;
      case 0x04: D[sp] = D[sp - 1]; sp++; break;
      case 0x05: { const v = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = v; break; }
      case 0x06: D[sp] = D[sp - 2]; sp++; break;
      case 0x07: { const v = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = v; break; }
      case 0x17: D[sp - 1] = -D[sp - 1] | 0; break;
      case 0x1b: D[sp - 1] = ~D[sp - 1]; break;
      default: { // every opcode the cases above leave: the binary and comparison ops
        const b = D[sp - 1], a = D[sp - 2];
        let r = 0;
        switch (op) {
          case 0x10: r = a + b | 0; break;
          case 0x11: r = a - b | 0; break;
          case 0x12: r = Math.imul(a, b); break;
          case 0x13: if (!b) return fin(4); r = a / b | 0; break;
          case 0x14: if (!b) return fin(4); r = a % b | 0; break;
          case 0x15: if (!b) return fin(4); r = (a >>> 0) / (b >>> 0) | 0; break;
          case 0x16: if (!b) return fin(4); r = (a >>> 0) % (b >>> 0) | 0; break;
          case 0x18: r = a & b; break;
          case 0x19: r = a | b; break;
          case 0x1a: r = a ^ b; break;
          case 0x1c: r = a << (b & 31); break;
          case 0x1d: r = a >> (b & 31); break;
          case 0x1e: r = a >>> (b & 31) | 0; break;
          case 0x20: r = a === b ? 1 : 0; break;
          case 0x21: r = a < b ? 1 : 0; break;
          case 0x22: r = (a >>> 0) < (b >>> 0) ? 1 : 0; break;
        }
        D[sp - 2] = r;
        sp--;
        break;
      }
      case 0x30: case 0x31: case 0x32: { // a signed 16-bit offset from the next instruction
        const rel = (p[nx - 2] | p[nx - 1] << 8) << 16 >> 16;
        let go = true;
        if (op !== 0x30) { const v = D[--sp]; go = op === 0x31 ? !v : !!v; }
        if (go) pc = nx + rel;
        break;
      }
      case 0x33: // an unsigned 16-bit address
        if (cp === 64) return fin(7);
        C[cp++] = nx;
        pc = p[nx - 2] | p[nx - 1] << 8;
        break;
      case 0x34:
        if (!cp) return fin(8);
        pc = C[--cp];
        break;
      case 0x40: { const a = D[sp - 1]; if (a < 0 || a > 255) return fin(6); D[sp - 1] = M[a]; break; }
      case 0x41: { const a = D[sp - 1], v = D[sp - 2]; if (a < 0 || a > 255) return fin(6); sp -= 2; M[a] = v; break; }
      case 0x50: { // decimal ASCII, '-' when negative, no padding, no newline
        const s = '' + D[sp - 1], k = s.length;
        if (len + k > MO) return fin(11); // writes none of its bytes
        out.write(s, len);
        len += k;
        sp--;
        break;
      }
      case 0x51: if (len >= MO) return fin(11); out[len++] = D[--sp] & 255; break;
      case 0x52: D[sp++] = ip < inp.length ? inp[ip++] : -1; break;
      case 0x53: return fin(D[--sp] & 255);
    }
  }
}

for (const id of readdirSync(IN).sort()) {
  const dir = join(IN, id);
  const r = run(readFileSync(join(dir, 'program.bin')), readFileSync(join(dir, 'input.bin')));
  const od = join(OUT, id);
  mkdirSync(od, { recursive: true });
  writeFileSync(join(od, 'stdout.bin'), r.out.subarray(0, r.len));
  writeFileSync(join(od, 'exit.txt'), r.code + '\n');
}
