import { Component, Suspense, forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import LoveFaithFigure, { FIGURE_BOUNDS } from '../../three/figure/LoveFaithFigure';
import { NEUTRAL_POSE } from '../../three/figure/poses';
import PoseSelector from '../PoseSelector/PoseSelector';
import { useRoomEnvironment } from '../../three/useRoomEnvironment';
import { hasWebGL, isLowPowerDevice, prefersReducedMotion } from '../../three/webgl';
import styles from './GarmentViewer.module.css';

const FOV = 32;
// Encombrement de la figurine (bras compris)
const FIGURE_W = FIGURE_BOUNDS.halfWidth * 2;
const FIGURE_H = FIGURE_BOUNDS.maxY - FIGURE_BOUNDS.minY;
const TARGET_Y = 0.02; // centre de rotation/zoom au niveau du torse (impressions)
const POSE_BAR = 84; // px réservés de chaque côté pour la colonne des poses (cadrage symétrique)
const MOBILE = 700;

/** Distance caméra qui fait tenir la figurine quel que soit le format d'écran. */
function fitDistance(aspect) {
  const t = Math.tan((FOV * Math.PI) / 360);
  return Math.max(FIGURE_H / (2 * t), FIGURE_W / (2 * t * aspect)) * 1.14;
}

function Scene({ garment, pose, controlsRef, reducedMotion, lowPower, enableZoom, onReady, onPoseApplied }) {
  const { size, camera } = useThree();
  useRoomEnvironment(0.35);
  // sur ordinateur, la colonne des poses occupe un bord : la figurine est cadrée dans l'espace restant
  const aspect = (size.width > MOBILE ? Math.max(size.width - POSE_BAR * 2, size.width * 0.6) : size.width) / size.height;

  // Cadrage adapté au format (portrait mobile ↔ paysage). Seule la distance change : l'angle choisi par le
  // visiteur est conservé ; les changements de pose ne touchent jamais la caméra.
  useEffect(() => {
    const d = fitDistance(aspect);
    camera.position.setLength(d);
    camera.updateProjectionMatrix();
    controlsRef.current?.saveState();
  }, [aspect, camera, controlsRef]);

  return (
    <>
      <ambientLight intensity={0.28} />
      <hemisphereLight args={['#ffffff', '#2a0004', 0.55]} />
      {/* Lumière principale douce, haut-avant-gauche */}
      <directionalLight
        position={[-1.6, 2.2, 2.4]}
        intensity={2.3}
        castShadow={!lowPower}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-0.7}
        shadow-camera-right={0.7}
        shadow-camera-top={0.7}
        shadow-camera-bottom={-0.7}
      />
      {/* Débouchage neutre (le blanc reste blanc) */}
      <directionalLight position={[2, 0.6, 1.6]} intensity={0.75} />
      {/* Contours : rouge Love&Faith (discret, ne teinte pas le tissu) + blanc, depuis l'arrière */}
      <directionalLight position={[-2.2, 1.2, -2.4]} intensity={1.3} color="#ff1f3d" />
      <directionalLight position={[2.4, 1.8, -2]} intensity={1.7} color="#ffffff" />

      <Suspense fallback={null}>
        <LoveFaithFigure garment={garment} pose={pose} reducedMotion={reducedMotion} onReady={onReady} onPoseApplied={onPoseApplied} />
      </Suspense>
      <ContactShadows
        position={[0, FIGURE_BOUNDS.minY - (FIGURE_BOUNDS.minY + FIGURE_BOUNDS.maxY) / 2 - 0.02, 0]}
        opacity={0.55}
        scale={2}
        blur={2.4}
        far={0.6}
        resolution={256}
        color="#000000"
      />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enablePan={false}
        target={[0, TARGET_Y, 0]}
        enableZoom={enableZoom}
        zoomSpeed={0.7}
        minDistance={0.62}
        maxDistance={fitDistance(aspect) * 1.2}
        minPolarAngle={Math.PI * 0.2}
        maxPolarAngle={Math.PI * 0.6}
        rotateSpeed={0.75}
        enableDamping
        dampingFactor={0.08}
      />
    </>
  );
}

/** Repli 2D clairement identifié comme tel. */
function Fallback2D({ creation, reason }) {
  return (
    <div className={styles.fallback}>
      <img src={creation.mockups.front} alt={`${creation.name} — devant`} className={styles.fallbackImg} />
      <p className={styles.fallbackNote}>
        {reason === 'loading'
          ? 'Chargement du vêtement 3D…'
          : 'Aperçu 2D — la vue 3D n\'est pas disponible sur cet appareil.'}
      </p>
    </div>
  );
}

class ViewerBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err) {
    console.error('[GarmentViewer] Rendu 3D indisponible :', err);
  }
  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Visualiseur 3D d'une création, avec le sélecteur des 7 poses de la figurine.
 * La figurine démarre en pose neutre ; une pose ne change que sur clic du visiteur.
 * ref expose { reset() } pour le bouton « Recentrer » (caméra seulement : la pose est conservée).
 */
const GarmentViewer = forwardRef(function GarmentViewer({ creation, className = '', label, enableZoom = true, showPoses = true }, ref) {
  const controlsRef = useRef(null);
  const wrapRef = useRef(null);
  const [visible, setVisible] = useState(true);
  const [pose, setPose] = useState(NEUTRAL_POSE);
  const [ready, setReady] = useState(false);
  const [applied, setApplied] = useState(NEUTRAL_POSE); // pose atteinte (fin de transition)
  const onReady = useCallback(() => setReady(true), []);
  const [webgl] = useState(hasWebGL);
  const [reducedMotion] = useState(prefersReducedMotion);
  const [lowPower] = useState(isLowPowerDevice);

  useImperativeHandle(ref, () => ({
    reset: () => controlsRef.current?.reset(),
  }));

  // Nouvelle création → le vêtement revient de face
  useEffect(() => { controlsRef.current?.reset(); }, [creation.slug]);

  // Pause du rendu quand le visualiseur sort de l'écran (batterie / performances)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={wrapRef}
      className={`${styles.viewer} ${showPoses && webgl ? styles.withPoses : ''} ${className}`}
      data-pose={pose}
      data-pose-applied={applied}
    >
      {webgl ? (
        <ViewerBoundary resetKey={creation.slug} fallback={<Fallback2D creation={creation} />}>
          <div
            className={styles.canvasWrap}
            role="img"
            aria-label={label ?? `Figurine Love&Faith portant ${creation.name} — glisser pour tourner, molette ou pincement pour zoomer`}
          >
          <Canvas
            className={styles.canvas}
            shadows={!lowPower}
            dpr={lowPower ? [1, 1.25] : [1, 1.75]}
            frameloop={visible ? 'always' : 'never'}
            // légère plongée : l'encolure et l'intérieur du col restent visibles
            camera={{ fov: FOV, position: [0, 0.26, 2.6], near: 0.05, far: 20 }}
            gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          >
            <Scene
              garment={creation.garment}
              pose={pose}
              enableZoom={enableZoom}
              controlsRef={controlsRef}
              reducedMotion={reducedMotion}
              lowPower={lowPower}
              onReady={onReady}
              onPoseApplied={setApplied}
            />
          </Canvas>
          </div>
          {!ready && (
            <div className={styles.loading} role="status">
              <span className={styles.spinner} aria-hidden="true" />
              Chargement de la figurine…
            </div>
          )}
          {showPoses && <PoseSelector value={pose} onChange={setPose} disabled={!ready} />}
        </ViewerBoundary>
      ) : (
        <Fallback2D creation={creation} />
      )}
    </div>
  );
});

export default GarmentViewer;
