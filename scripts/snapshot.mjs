/**
 * Snapshot the working tree before it can be lost.
 *
 * This branch carries hundreds of uncommitted files and has no upstream, so a single `git checkout`
 * can destroy work that exists nowhere else — which is exactly what happened on 2026-11-07 when one
 * revert also discarded every uncommitted change in that file, and there was no stash, sourcemap,
 * editor history, or cloud version to restore from. The code had to be rebuilt from the assertions its
 * tests encode.
 *
 * This writes a `.tar.gz` outside the repo, so a bad revert in the repo cannot touch it. It is a
 * stopgap until the work is committed and pushed, not a substitute for that.
 *
 * It uses only Node built-ins. The first version shelled out to `zip`, which does not exist on
 * Windows — so the tool whose job is to prevent loss would have failed on the machine it was most
 * needed on.
 *
 *   node scripts/snapshot.mjs               # write a snapshot
 *   node scripts/snapshot.mjs --keep=5      # prune to the newest 5
 *   node scripts/snapshot.mjs --list        # list what exists
 *   node scripts/snapshot.mjs --restore=<file> --into=<dir>
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

const DEST = join(homedir(), 'uml-working-snapshots');
/**
 * Folders worth keeping. `dist` and `node_modules` are rebuildable; the source is not. `.uml-data` and
 * any local secret file are excluded on purpose: a snapshot that copies credentials is a new risk.
 */
const PARTS = ['web/src', 'web/functions', 'web/scripts', 'docs', '.github'];
const SKIP = /(^|\/)(node_modules|dist|\.wrangler)(\/|$)|\.env(\.|$)/;
const STAMP = /^elite-rebuild-(\d{8}-\d{6})\.tar\.gz$/;

/* ---------- a minimal tar writer and reader, so this needs no external binary ---------- */

function tarHeader(name, size) {
  const block = Buffer.alloc(512);
  block.write(name.slice(0, 100), 0, 100, 'utf8');
  block.write('000644 \0', 100, 8, 'utf8');
  block.write('000000 \0', 108, 8, 'utf8');
  block.write('000000 \0', 116, 8, 'utf8');
  block.write(`${size.toString(8).padStart(11, '0')} `, 124, 12, 'utf8');
  block.write(`${Math.floor(Date.now() / 1000).toString(8).padStart(11, '0')} `, 136, 12, 'utf8');
  block.write('        ', 148, 8, 'utf8');
  block.write('0', 156, 1, 'utf8');
  block.write('ustar\0' + '00', 257, 8, 'utf8');
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(`${sum.toString(8).padStart(6, '0')} \0`, 148, 8, 'utf8');
  return block;
}

function collect(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = relative(root, full).split(sep).join('/');
      if (SKIP.test(rel)) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push({ rel, full });
    }
  };
  for (const part of PARTS) {
    const abs = join(root, part);
    if (!existsSync(abs)) continue;
    if (statSync(abs).isDirectory()) walk(abs);
  }
  return out;
}

function writeTarGz(root, target) {
  const files = collect(root);
  if (files.length === 0) throw new Error('nothing to snapshot');
  const chunks = [];
  for (const file of files) {
    const bytes = readFileSync(file.full);
    chunks.push(tarHeader(file.rel, bytes.length), bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512));
  }
  chunks.push(Buffer.alloc(1024));
  writeFileSync(target, gzipSync(Buffer.concat(chunks), { level: 9 }));
  return files.length;
}

function readTarGz(source) {
  const data = gunzipSync(readFileSync(source));
  const entries = [];
  let offset = 0;
  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const size = parseInt(header.subarray(124, 136).toString('utf8').trim(), 8) || 0;
    offset += 512;
    if (name) entries.push({ name, bytes: data.subarray(offset, offset + size) });
    offset += size + ((512 - (size % 512)) % 512);
  }
  return entries;
}

/* -------------------------------------- commands -------------------------------------- */

function list() {
  if (!existsSync(DEST)) return [];
  return readdirSync(DEST)
    .filter((name) => STAMP.test(name))
    .map((name) => ({ name, path: join(DEST, name), at: statSync(join(DEST, name)).mtimeMs }))
    .sort((a, b) => b.at - a.at);
}

const args = process.argv.slice(2);
const argOf = (prefix) => args.find((a) => a.startsWith(prefix))?.slice(prefix.length);

if (args.includes('--list')) {
  const found = list();
  if (found.length === 0) {
    console.log(`No snapshots in ${DEST}.`);
  } else {
    for (const snap of found) {
      const mb = (statSync(snap.path).size / (1024 * 1024)).toFixed(1);
      console.log(`${new Date(snap.at).toISOString()}  ${mb} MB  ${snap.name}`);
    }
  }
  process.exit(0);
}

const restoreFrom = argOf('--restore=');
if (restoreFrom) {
  const into = argOf('--into=') ?? join(process.cwd(), 'snapshot-restore');
  mkdirSync(into, { recursive: true });
  const entries = readTarGz(restoreFrom);
  for (const entry of entries) {
    const target = join(into, entry.name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, entry.bytes);
  }
  console.log(`Restored ${entries.length} files into ${into}`);
  process.exit(0);
}

const repo = resolve(import.meta.dirname, '..');
const missing = PARTS.filter((part) => !existsSync(join(repo, part)));
if (missing.length > 0) {
  console.error(`Refusing to snapshot: not found under ${repo}: ${missing.join(', ')}`);
  process.exit(1);
}

mkdirSync(DEST, { recursive: true });
const d = new Date();
const p = (n) => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
const target = join(DEST, `elite-rebuild-${stamp}.tar.gz`);
const count = writeTarGz(repo, target);
console.log(`Snapshot written: ${target} (${(statSync(target).size / (1024 * 1024)).toFixed(1)} MB, ${count} files)`);

const keep = Number(argOf('--keep='));
if (Number.isInteger(keep) && keep > 0) {
  for (const snap of list().slice(keep)) {
    unlinkSync(snap.path);
    console.log(`Pruned ${snap.name}`);
  }
}
