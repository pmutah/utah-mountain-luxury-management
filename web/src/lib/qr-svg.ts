/**
 * A small QR encoder for a stay URL.
 *
 * Byte mode, error correction M, mask 0, versions 1 through 6. No dependency.
 * Format bits follow the QR specification (the 0x5412 mask of the format polynomial).
 */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!;
})();

function mul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a]! + LOG[b]!]!;
}

type Version = {
  size: number;
  blocks: Array<{ data: number; ec: number }>;
  align: number[];
};

const VERSIONS: Record<number, Version> = {
  1: { size: 21, blocks: [{ data: 16, ec: 10 }], align: [] },
  2: { size: 25, blocks: [{ data: 28, ec: 16 }], align: [6, 18] },
  3: { size: 29, blocks: [{ data: 44, ec: 26 }], align: [6, 22] },
  4: { size: 33, blocks: [{ data: 32, ec: 18 }, { data: 32, ec: 18 }], align: [6, 26] },
  5: { size: 37, blocks: [{ data: 43, ec: 24 }, { data: 43, ec: 24 }], align: [6, 30] },
  6: { size: 41, blocks: [{ data: 27, ec: 16 }, { data: 27, ec: 16 }, { data: 27, ec: 16 }, { data: 27, ec: 16 }], align: [6, 34] },
};

function dataCapacity(version: Version): number {
  return version.blocks.reduce((sum, block) => sum + block.data, 0);
}

function rsGenerator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j]!;
      next[j + 1] ^= mul(poly[j]!, EXP[i]!);
    }
    poly = next;
  }
  return poly;
}

function rsRemainder(data: number[], degree: number): number[] {
  const gen = rsGenerator(degree);
  const result = data.concat(new Array(degree).fill(0));
  for (let i = 0; i < data.length; i++) {
    const factor = result[i]!;
    if (!factor) continue;
    for (let j = 0; j < gen.length; j++) result[i + j] ^= mul(gen[j]!, factor);
  }
  return result.slice(data.length);
}

function pushBits(bits: number[], value: number, length: number) {
  for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
}

function chooseVersion(bytes: number): Version {
  for (const version of [1, 2, 3, 4, 5, 6]) {
    const spec = VERSIONS[version]!;
    if (bytes + 2 <= dataCapacity(spec)) return spec;
  }
  throw new Error('That stay link is too long for this QR.');
}

function dataCodewords(text: string, spec: Version): number[] {
  const raw = new TextEncoder().encode(text);
  const bits: number[] = [];
  pushBits(bits, 0b0100, 4);
  pushBits(bits, raw.length, 8);
  for (const byte of raw) pushBits(bits, byte, 8);
  const max = dataCapacity(spec) * 8;
  pushBits(bits, 0, Math.min(4, Math.max(0, max - bits.length)));
  while (bits.length % 8 !== 0) bits.push(0);
  const bytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j++) value = (value << 1) | (bits[i + j] ?? 0);
    bytes.push(value);
  }
  let pad = 0xec;
  while (bytes.length < dataCapacity(spec)) {
    bytes.push(pad);
    pad = pad === 0xec ? 0x11 : 0xec;
  }
  return bytes;
}

function interleave(bytes: number[], spec: Version): number[] {
  const blocks: Array<{ data: number[]; ec: number[] }> = [];
  let offset = 0;
  for (const block of spec.blocks) {
    const data = bytes.slice(offset, offset + block.data);
    offset += block.data;
    blocks.push({ data, ec: rsRemainder(data, block.ec) });
  }
  const out: number[] = [];
  const maxData = Math.max(...blocks.map((block) => block.data.length));
  for (let i = 0; i < maxData; i++) for (const block of blocks) if (i < block.data.length) out.push(block.data[i]!);
  const maxEc = Math.max(...blocks.map((block) => block.ec.length));
  for (let i = 0; i < maxEc; i++) for (const block of blocks) if (i < block.ec.length) out.push(block.ec[i]!);
  return out;
}

function blank(size: number): { modules: boolean[][]; fn: boolean[][] } {
  const modules = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
  const fn = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
  return { modules, fn };
}

function setFn(modules: boolean[][], fn: boolean[][], x: number, y: number, dark: boolean) {
  if (x < 0 || y < 0 || y >= modules.length || x >= modules.length) return;
  modules[y]![x] = dark;
  fn[y]![x] = true;
}

function drawFinder(modules: boolean[][], fn: boolean[][], ox: number, oy: number) {
  for (let dy = -1; dy <= 7; dy++) {
    for (let dx = -1; dx <= 7; dx++) {
      const x = ox + dx;
      const y = oy + dy;
      if (x < 0 || y < 0 || x >= modules.length || y >= modules.length) continue;
      const inside = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
      const dark = inside && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
      setFn(modules, fn, x, y, dark);
    }
  }
}

function drawAlignment(modules: boolean[][], fn: boolean[][], cx: number, cy: number) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const dark = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
      setFn(modules, fn, cx + dx, cy + dy, dark);
    }
  }
}

function drawFunction(modules: boolean[][], fn: boolean[][], spec: Version) {
  const size = spec.size;
  drawFinder(modules, fn, 0, 0);
  drawFinder(modules, fn, size - 7, 0);
  drawFinder(modules, fn, 0, size - 7);
  for (let i = 0; i < size; i++) {
    if (!fn[6]![i]) setFn(modules, fn, i, 6, i % 2 === 0);
    if (!fn[i]![6]) setFn(modules, fn, 6, i, i % 2 === 0);
  }
  for (const x of spec.align) {
    for (const y of spec.align) {
      if (fn[y]?.[x]) continue;
      drawAlignment(modules, fn, x, y);
    }
  }
  const bits = 0x5412;
  for (let i = 0; i <= 5; i++) setFn(modules, fn, 8, i, ((bits >>> i) & 1) === 1);
  setFn(modules, fn, 8, 7, ((bits >>> 6) & 1) === 1);
  setFn(modules, fn, 8, 8, ((bits >>> 7) & 1) === 1);
  setFn(modules, fn, 7, 8, ((bits >>> 8) & 1) === 1);
  for (let i = 9; i < 15; i++) setFn(modules, fn, 14 - i, 8, ((bits >>> i) & 1) === 1);
  for (let i = 0; i < 8; i++) setFn(modules, fn, size - 1 - i, 8, ((bits >>> i) & 1) === 1);
  for (let i = 8; i < 15; i++) setFn(modules, fn, 8, size - 15 + i, ((bits >>> i) & 1) === 1);
  setFn(modules, fn, 8, size - 8, true);
}

function drawData(modules: boolean[][], fn: boolean[][], codewords: number[]) {
  const size = modules.length;
  const bits: number[] = [];
  for (const byte of codewords) for (let i = 7; i >= 0; i--) bits.push((byte >>> i) & 1);
  let index = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = upward ? size - 1 - vert : vert;
        if (fn[y]![x]) continue;
        let dark = index < bits.length ? bits[index] === 1 : false;
        index += 1;
        if ((x + y) % 2 === 0) dark = !dark;
        modules[y]![x] = dark;
      }
    }
    upward = !upward;
  }
}

export function qrModules(text: string): boolean[][] {
  const spec = chooseVersion(new TextEncoder().encode(text).length);
  const { modules, fn } = blank(spec.size);
  drawFunction(modules, fn, spec);
  drawData(modules, fn, interleave(dataCodewords(text, spec), spec));
  return modules;
}

export function qrSvg(text: string, module = 4): string {
  const modules = qrModules(text);
  const quiet = 4;
  const size = modules.length + quiet * 2;
  let rects = '';
  for (let y = 0; y < modules.length; y++) {
    for (let x = 0; x < modules.length; x++) {
      if (!modules[y]![x]) continue;
      rects += `<rect x="${(x + quiet) * module}" y="${(y + quiet) * module}" width="${module}" height="${module}"/>`;
    }
  }
  const px = size * module;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${px} ${px}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/>${rects.replaceAll('<rect ', '<rect fill="#1c2b27" ')}</svg>`;
}
