import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useLoader, useThree } from '@react-three/fiber';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';

/**
 * Impression d'un motif sur le torse du sweat.
 * Le motif est PROJETÉ sur le maillage (DecalGeometry) : il épouse la surface comme une impression
 * textile, il ne flotte pas devant le vêtement.
 *
 * `rect` = rectangle du motif dans la silhouette du mockup (0..1, [gauche, haut, droite, bas]).
 * Sur les mockups, le torse occupe ~18,5 % → 81,5 % de la largeur de la silhouette et
 * 0 → 91,6 % de sa hauteur (col → bas). On convertit vers la zone imprimable du torse 3D.
 * La HAUTEUR est déduite des proportions réelles de l'image → aucun motif n'est déformé.
 */
const MOCKUP_TORSO = { x0: 0.185, x1: 0.815, y0: 0, y1: 0.916 };

export function placePrint(rect, area, imageAspect, side) {
  const [r0, r1, r2, r3] = rect;
  const tw = MOCKUP_TORSO.x1 - MOCKUP_TORSO.x0;
  const th = MOCKUP_TORSO.y1 - MOCKUP_TORSO.y0;
  const W = area.x1 - area.x0;
  const H = area.top - area.bottom;

  const cxT = ((r0 + r2) / 2 - MOCKUP_TORSO.x0) / tw;
  const cyT = ((r1 + r3) / 2 - MOCKUP_TORSO.y0) / th;
  let w = ((r2 - r0) / tw) * W;
  let h = w / imageAspect;
  // reste dans la zone imprimable (réduction proportionnelle si nécessaire)
  const k = Math.min(1, (W * 0.86) / w, (H * 0.9) / h);
  w *= k;
  h *= k;

  let cx = area.x0 + cxT * W;
  if (side === 'back') cx = -cx; // vu de dos, la gauche de l'image est le +X du monde
  let cy = area.top - cyT * H;
  cy = Math.min(area.top - h / 2 - 0.01, Math.max(area.bottom + h / 2 + 0.005, cy));
  return { cx, cy, w, h };
}

export default function PrintDecal({ torsoMesh, area, print, side, depth = 0.3, roughness = 0.5 }) {
  const tex = useLoader(THREE.TextureLoader, print.src);
  const gl = useThree((s) => s.gl);

  const geometry = useMemo(() => {
    const aspect = tex.image.width / tex.image.height;
    const { cx, cy, w, h } = placePrint(print.rect, area, aspect, side);
    const dir = side === 'front' ? -1 : 1;
    const ray = new THREE.Raycaster(new THREE.Vector3(cx, cy, -dir * 2), new THREE.Vector3(0, 0, dir));
    const hit = ray.intersectObject(torsoMesh, false)[0];
    const z = hit ? hit.point.z : side === 'front' ? 0.16 : -0.16;
    const orientation = new THREE.Euler(0, side === 'front' ? 0 : Math.PI, 0);
    return new DecalGeometry(torsoMesh, new THREE.Vector3(cx, cy, z), orientation, new THREE.Vector3(w, h, depth));
  }, [tex, torsoMesh, area, print.rect, side, depth]);

  const material = useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    return new THREE.MeshPhysicalMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.04,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      roughness,
      clearcoat: 0.2,
      clearcoatRoughness: 0.4,
    });
  }, [tex, gl, roughness]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  return <mesh geometry={geometry} material={material} renderOrder={2} receiveShadow />;
}
