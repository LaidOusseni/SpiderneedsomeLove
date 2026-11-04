/**
 * Compression d'un GLB (export Blender) avec EXT_meshopt_compression.
 * Les attributs restent en flottants (pas de quantification) : le site peut lire la géométrie du sweat telle quelle
 * pour y projeter les impressions. Les images sont recopiées sans changement.
 */
import fs from 'node:fs';
import { MeshoptEncoder } from 'meshoptimizer';

const COMPONENT_SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

export async function compressGlb(src, dst) {
  await MeshoptEncoder.ready;
  const glb = fs.readFileSync(src);
  const jsonLen = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8'));
  const binLen = glb.readUInt32LE(20 + jsonLen);
  const bin = glb.subarray(28 + jsonLen, 28 + jsonLen + binLen);

  // vues compressibles : une seule donnée de maillage par vue, sans décalage
  const plan = new Map();
  const viewUsers = new Map();
  json.accessors.forEach((a) => viewUsers.set(a.bufferView, (viewUsers.get(a.bufferView) ?? 0) + 1));
  const consider = (accIndex, mode) => {
    const a = json.accessors[accIndex];
    if (a.bufferView === undefined || a.byteOffset || viewUsers.get(a.bufferView) !== 1) return;
    const size = COMPONENT_SIZE[a.componentType] * COMPONENTS[a.type];
    const view = json.bufferViews[a.bufferView];
    if (view.byteStride && view.byteStride !== size) return;
    if (mode === 'ATTRIBUTES' && (size % 4 || size > 256)) return;
    if (mode === 'TRIANGLES' && size !== 2 && size !== 4) return;
    plan.set(a.bufferView, { mode, size, count: a.count });
  };
  for (const mesh of json.meshes) {
    for (const prim of mesh.primitives) {
      Object.values(prim.attributes).forEach((i) => consider(i, 'ATTRIBUTES'));
      if (prim.indices !== undefined && (prim.mode ?? 4) === 4) consider(prim.indices, 'TRIANGLES');
    }
  }

  const chunks = [];
  let offset = 0;
  let fallback = 0;
  const store = (bytes) => {
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
    const at = offset;
    chunks.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    offset += bytes.byteLength;
    return at;
  };
  let before = 0;
  let after = 0;
  json.bufferViews = json.bufferViews.map((view, i) => {
    const raw = new Uint8Array(bin.buffer, bin.byteOffset + (view.byteOffset ?? 0), view.byteLength);
    const p = plan.get(i);
    if (!p) return { ...view, buffer: 0, byteOffset: store(raw) };
    const enc = MeshoptEncoder.encodeGltfBuffer(raw, p.count, p.size, p.mode);
    before += raw.byteLength;
    after += enc.byteLength;
    const fbOffset = fallback;
    fallback += Math.ceil(raw.byteLength / 4) * 4;
    return {
      buffer: 1, byteOffset: fbOffset, byteLength: raw.byteLength, ...(p.mode === 'ATTRIBUTES' ? { byteStride: p.size } : {}),
      ...(view.target ? { target: view.target } : {}),
      extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: store(enc), byteLength: enc.byteLength, byteStride: p.size, mode: p.mode, count: p.count } },
    };
  });
  const newBin = Buffer.concat([...chunks, Buffer.alloc((4 - (offset % 4)) % 4)]);
  json.buffers = [{ byteLength: newBin.length }, { byteLength: fallback, extensions: { EXT_meshopt_compression: { fallback: true } } }];
  json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), 'EXT_meshopt_compression'])];
  json.extensionsRequired = [...new Set([...(json.extensionsRequired ?? []), 'EXT_meshopt_compression'])];

  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonChunk = Buffer.concat([jsonBytes, Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + newBin.length, 8);
  const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
  fs.writeFileSync(dst, Buffer.concat([header, ch(jsonChunk.length, 0x4e4f534a), jsonChunk, ch(newBin.length, 0x004e4942), newBin]));
  return { before, after };
}
