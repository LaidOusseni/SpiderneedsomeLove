import { Component, Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useRoomEnvironment } from '../../three/useRoomEnvironment';
import { BRAND_ASSETS } from '../../constants/site';

/**
 * Logo 3D (fichier Intro/Logo 3D.glb, copié tel quel dans public/brand/).
 * Rotation lente et continue, léger balancement vertical. Le modèle n'est pas modifié.
 */
function Logo({ reducedMotion, onReady }) {
  const { scene } = useGLTF(BRAND_ASSETS.logo3d);
  const ref = useRef();

  const model = useMemo(() => {
    const root = scene.clone(true);
    // Centrage + mise à l'échelle sur la largeur
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    root.position.sub(center);
    const wrap = new THREE.Group();
    wrap.add(root);
    wrap.scale.setScalar(3.5 / Math.max(size.x, size.y));
    root.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material = o.material.clone();
        o.material.envMapIntensity = 1.4;
      }
    });
    return wrap;
  }, [scene]);

  useEffect(() => { onReady?.(); }, [onReady]);

  useFrame(({ clock }, delta) => {
    if (!ref.current || reducedMotion) return;
    ref.current.rotation.y += delta * 0.32;
    ref.current.position.y = Math.sin(clock.elapsedTime * 0.8) * 0.04;
  });

  return <primitive ref={ref} object={model} />;
}

function Env() {
  useRoomEnvironment(1);
  return null;
}

class Boundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err) {
    console.error('[Intro] Logo 3D indisponible :', err);
    this.props.onError?.();
  }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function LogoCanvas({ reducedMotion, onReady, onError }) {
  return (
    <Boundary onError={onError}>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ fov: 30, position: [0, 0, 5.2] }}
        gl={{ antialias: true, alpha: true }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <Env />
        <ambientLight intensity={0.2} />
        <directionalLight position={[2, 3, 4]} intensity={2.2} />
        <directionalLight position={[-3, 1, -2]} intensity={3} color="#ff1f3d" />
        <pointLight position={[0, -2, 2]} intensity={6} color="#c90025" distance={8} />
        <Suspense fallback={null}>
          <Logo reducedMotion={reducedMotion} onReady={onReady} />
        </Suspense>
      </Canvas>
    </Boundary>
  );
}

useGLTF.preload(BRAND_ASSETS.logo3d);
