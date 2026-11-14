import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import PrintDecal from '../PrintDecal';
import { NEUTRAL_POSE, POSES, SEATED_POSE } from './poses';

/**
 * Figurine Love&Faith articulée — mannequin officiel de la vue 3D.
 * Modèle : public/models/lovefaith-figure.glb (squelette LF_Rig + 7 clips de pose), publié par
 * scripts/figurine/compress-rig.mjs. Le maillage « Sweat » change selon la création : couleur du tissu et impressions
 * avant/arrière, qui suivent l'os du torse quand la figurine change de pose.
 *
 * Poses : la figurine démarre en pose neutre et n'en change que lorsque `pose` change (clic du visiteur).
 * Le passage d'une pose à l'autre est un fondu des clips du squelette (une seule fois), puis la pose finale est tenue.
 */
const MODEL_URL = '/models/lovefaith-figure.glb';
const SCALE = 1.64; // le modèle mesure 1 unité de haut
const TRANSITION = 0.7; // s

// Encombrement à l'échelle de la scène (pose neutre : y de -0,512 à 0,554, mains comprises)
export const FIGURE_BOUNDS = { minY: -0.512 * SCALE, maxY: 0.554 * SCALE, halfWidth: 0.27 * SCALE };

// Zone imprimable du torse, en unités du modèle (col → bas du sweat, entre les bras)
const PRINT_AREA = { x0: -0.12, x1: 0.12, top: 0.17, bottom: -0.068 };
const PRINT_DEPTH = 0.16; // profondeur de projection : le motif ne déborde pas sur le dos ni sur les bras

const configureLoader = (loader) => loader.setMeshoptDecoder(MeshoptDecoder);
const smooth = (t) => t * t * (3 - 2 * t);

function useFigureModel() {
  const gltf = useLoader(GLTFLoader, MODEL_URL, configureLoader);
  // Copie propre à ce visualiseur : SkeletonUtils.clone relie chaque maillage skinné à SES os
  // (un clone ordinaire partagerait le squelette du cache entre visualiseurs).
  return useMemo(() => {
    const scene = cloneSkinned(gltf.scene);
    scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false; // la boîte d'un maillage skinné est celle du repos : ne pas le masquer en pose
      }
    });
    const seat = scene.getObjectByName('Tabouret');
    if (seat) {
      seat.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.transparent = true;
        }
      });
    }
    return { scene, sweat: scene.getObjectByName('Sweat'), seat, clips: gltf.animations };
  }, [gltf]);
}

/**
 * Lecture des poses. Chaque clip contient la pose complète des 20 os : un clip à poids 1 ne laisse aucune articulation
 * de la pose précédente. Transition : les actions en cours s'effacent pendant que la nouvelle monte (somme des poids = 1),
 * y compris si le visiteur change de pose en pleine transition.
 */
function usePosePlayer({ scene, seat, clips }, pose, reducedMotion, onPoseApplied) {
  const mixer = useMemo(() => new THREE.AnimationMixer(scene), [scene]);
  const state = useRef(null);

  const actions = useMemo(() => {
    const map = {};
    for (const p of POSES) {
      const clip = THREE.AnimationClip.findByName(clips, p.clip);
      if (!clip) {
        console.error(`[LoveFaithFigure] Clip de pose introuvable dans le GLB : ${p.clip}`);
        continue;
      }
      const a = mixer.clipAction(clip);
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true; // la dernière image est conservée
      map[p.id] = a;
    }
    return map;
  }, [mixer, clips]);

  // Tabouret : posé au sol à l'endroit qu'il occupe dans la pose assise, puis détaché du squelette
  // (il ne glisse pas pendant que la figurine s'assoit). Il n'apparaît que pour cette pose.
  useEffect(() => {
    const sit = actions[SEATED_POSE];
    if (!seat || !sit) return;
    sit.reset().setEffectiveWeight(1).play();
    mixer.update(10);
    scene.updateMatrixWorld(true);
    scene.attach(seat);
    sit.setEffectiveWeight(0); // sinon ce poids résiduel ferait croire que la figurine est assise
    sit.stop();
    seat.visible = false;
  }, [actions, mixer, scene, seat]);

  // Pose initiale : neutre, appliquée sans transition, aucune lecture automatique ensuite
  useEffect(() => {
    const neutral = actions[NEUTRAL_POSE];
    if (!neutral) return undefined;
    neutral.reset().setEffectiveWeight(1).play();
    mixer.update(10);
    state.current = { target: NEUTRAL_POSE, from: [], t: 1 };
    return () => mixer.stopAllAction();
  }, [actions, mixer]);

  // Changement de pose demandé par le visiteur
  useEffect(() => {
    const s = state.current;
    const next = actions[pose];
    if (!s || !next || pose === s.target) return; // déjà dans cette pose (ou en route vers elle) : rien à relancer
    const from = Object.entries(actions)
      .filter(([id, a]) => id !== pose && a.getEffectiveWeight() > 0.0001)
      .map(([, a]) => ({ action: a, w0: a.getEffectiveWeight() }));
    const w0 = next.getEffectiveWeight();
    if (w0 < 0.0001) next.reset();
    next.enabled = true;
    if (reducedMotion) {
      for (const f of from) f.action.stop();
      next.reset().setEffectiveWeight(1).play();
      next.time = next.getClip().duration;
      next.paused = true;
      mixer.update(0);
      state.current = { target: pose, from: [], next, w0: 1, t: 1 };
      onPoseApplied?.(pose);
      return;
    }
    next.setEffectiveWeight(w0).play();
    state.current = { target: pose, from, next, w0, t: 0 };
  }, [pose, actions, reducedMotion, mixer, onPoseApplied]);

  useFrame((_, dt) => {
    const s = state.current;
    if (!s) return;
    if (s.next && s.t < 1) {
      s.t = Math.min(1, s.t + dt / TRANSITION);
      const e = smooth(s.t);
      for (const f of s.from) f.action.setEffectiveWeight(f.w0 * (1 - e));
      s.next.setEffectiveWeight(s.w0 + (1 - s.w0) * e);
      if (s.t >= 1) {
        for (const f of s.from) f.action.stop();
        s.from = [];
        onPoseApplied?.(s.target);
      }
    }
    if (seat) {
      const w = actions[SEATED_POSE]?.getEffectiveWeight() ?? 0;
      const k = THREE.MathUtils.clamp((w - 0.35) / 0.65, 0, 1);
      seat.visible = k > 0.01;
      seat.traverse((o) => { if (o.isMesh) o.material.opacity = k; });
    }
    mixer.update(dt);
  });
}

/** Tenue : couleur du sweat et impressions avant/arrière de la création, attachées à l'os du torse. */
function Outfit({ garment, sweat, root }) {
  const printsRef = useRef(null);

  /**
   * Repère du torse, au repère du modèle (`root`). Pour un maillage skinné, la position affichée d'un sommet du
   * torse est  rootInv · os_torse.matrixWorld · boneInverse · v  (le nœud du maillage n'intervient pas : ses sommets
   * sont déjà exprimés à l'échelle du modèle). Ne pas remonter la chaîne des parents du maillage : l'échelle de la
   * racine serait appliquée deux fois et la projection ne toucherait plus la surface.
   */
  const torso = useMemo(() => {
    const bones = sweat.skeleton?.bones ?? [];
    const i = bones.findIndex((b) => b.name === 'torse');
    const tmp = new THREE.Matrix4();
    const rootInv = new THREE.Matrix4();
    const current = (out) => {
      if (i < 0) return out.identity();
      rootInv.copy(root.matrixWorld).invert();
      return out.copy(rootInv).multiply(bones[i].matrixWorld).multiply(sweat.skeleton.boneInverses[i]);
    };
    root.updateMatrixWorld(true);
    const rest = current(new THREE.Matrix4()); // la figurine est encore au repos (= pose neutre) à ce stade
    return { current, restInverse: rest.clone().invert(), rest, tmp };
  }, [sweat, root]);

  // Maillage de projection : géométrie du sweat au repos, au repère du modèle
  const torsoMesh = useMemo(() => {
    const mesh = new THREE.Mesh(sweat.geometry);
    mesh.matrix.copy(torso.rest);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrixWorld(true);
    return mesh;
  }, [sweat, torso]);

  // Les impressions suivent le torse : déplacement de l'os depuis le repos
  useFrame(() => {
    const g = printsRef.current;
    if (!g) return;
    torso.current(torso.tmp).multiply(torso.restInverse);
    g.matrix.copy(torso.tmp);
    g.matrixWorldNeedsUpdate = true;
  });

  const dark = useMemo(() => new THREE.Color(garment.color).getHSL({}).l < 0.25, [garment.color]);

  useEffect(() => {
    // « plastique mat » de la planche : surface lisse, reflets doux
    const original = sweat.material;
    const material = original.clone();
    material.color = new THREE.Color(garment.color);
    material.roughness = dark ? 0.36 : 0.45;
    material.clearcoat = dark ? 0.5 : 0.35;
    material.clearcoatRoughness = 0.3;
    sweat.material = material;
    return () => {
      sweat.material = original;
      material.dispose();
    };
  }, [sweat, garment.color, dark]);

  return (
    <group ref={printsRef} matrixAutoUpdate={false}>
      {['front', 'back'].map((side) =>
        garment.prints?.[side] ? (
          <Suspense key={`${side}-${garment.prints[side].src}`} fallback={null}>
            <PrintDecal
              torsoMesh={torsoMesh}
              area={PRINT_AREA}
              print={garment.prints[side]}
              side={side}
              depth={PRINT_DEPTH}
              roughness={dark ? 0.4 : 0.5}
            />
          </Suspense>
        ) : null,
      )}
    </group>
  );
}

export default function LoveFaithFigure({ garment, pose = NEUTRAL_POSE, reducedMotion, onReady, onPoseApplied }) {
  const model = useFigureModel();
  const { scene, sweat } = model;
  usePosePlayer(model, pose, reducedMotion, onPoseApplied);
  const centerY = -(FIGURE_BOUNDS.minY + FIGURE_BOUNDS.maxY) / 2;

  useEffect(() => { onReady?.(); }, [onReady]);

  // Figurine immobile : aucun flottement ni balancement automatique
  return (
    <group position={[0, centerY, 0]}>
      <group scale={SCALE}>
        <primitive object={scene} />
        <Outfit garment={garment} sweat={sweat} root={scene} />
      </group>
    </group>
  );
}

useLoader.preload(GLTFLoader, MODEL_URL, configureLoader);
