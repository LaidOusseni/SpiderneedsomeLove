import { useEffect, useRef, useState } from 'react';
import { BRAND_ASSETS } from '../../constants/site';
import styles from './AsciiLogoBackground.module.css';

const CHARACTERS = '.:;-=+*x#%@';
const COLORS = ['#681116', '#8f171d', '#a91e25', '#c62832', '#e7d8d5'];
const TWINKLE_INTERVAL = 4200;

function isLowPowerDevice() {
  return typeof navigator !== 'undefined'
    && ((navigator.hardwareConcurrency ?? 8) <= 4 || (navigator.deviceMemory ?? 8) <= 4);
}

function hash(x, y, seed = 0) {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

export default function AsciiLogoBackground() {
  const canvasRef = useRef(null);
  const [fallback, setFallback] = useState(false);
  const lowPower = isLowPowerDevice();

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: true });
    if (!context) {
      setFallback(true);
      return undefined;
    }

    const image = new Image();
    let disposed = false;
    let seed = 0;
    let timer;
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');

    const draw = () => {
      if (disposed || !image.complete || !image.naturalWidth) return;

      const width = window.innerWidth;
      const height = window.innerHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, lowPower || width <= 640 ? 1 : 1.5);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const size = Math.min(width * 0.94, height * 0.86, 980);
      const columns = Math.min(lowPower ? 90 : Infinity, Math.max(48, Math.round(size / 4.6)));
      const rows = Math.max(32, Math.round(size / 7.4));
      const cellWidth = size / columns;
      const cellHeight = size / rows;
      const left = (width - size) / 2;
      const top = (height - size) / 2;
      const mask = document.createElement('canvas');
      mask.width = columns;
      mask.height = rows;
      const maskContext = mask.getContext('2d', { willReadFrequently: true });
      if (!maskContext) {
        setFallback(true);
        return;
      }

      maskContext.clearRect(0, 0, columns, rows);
      maskContext.drawImage(image, 0, 0, columns, rows);
      const pixels = maskContext.getImageData(0, 0, columns, rows).data;

      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.font = `${Math.max(4, cellHeight * 0.87)}px "Courier New", monospace`;

      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < columns; x += 1) {
          const opacity = pixels[(y * columns + x) * 4 + 3] / 255;
          if (opacity < 0.1) continue;

          const texture = hash(x, y);
          if (texture > opacity * 0.94) continue;

          const flicker = hash(x, y, 19) < 0.004;
          const changed = flicker && seed % 2 === 1;
          const character = CHARACTERS[Math.floor(hash(x, y, changed ? 31 : 7) * CHARACTERS.length)];
          const tone = hash(x, y, 13);
          const colorIndex = tone > 0.998
            ? COLORS.length - 1
            : tone > 0.9 || (flicker && seed % 2 === 1)
              ? 3
              : tone > 0.12
                ? 1
                : 0;
          context.globalAlpha = opacity * (flicker && seed % 2 === 1 ? 0.95 : 0.88);
          context.fillStyle = COLORS[colorIndex];
          context.fillText(
            character,
            left + (x + 0.5) * cellWidth,
            top + (y + 0.5) * cellHeight,
          );
        }
      }
      context.globalAlpha = 1;
      setFallback(false);
    };

    const updateMotionPreference = () => {
      const reduceEffects = motionPreference.matches || lowPower || window.innerWidth <= 640;
      window.clearInterval(timer);
      if (reduceEffects) return;
      timer = window.setInterval(() => {
        if (document.visibilityState !== 'hidden') {
          seed += 1;
          draw();
        }
      }, TWINKLE_INTERVAL);
    };
    const handleResize = () => {
      draw();
      updateMotionPreference();
    };

    image.onload = draw;
    image.onerror = () => setFallback(true);
    image.src = BRAND_ASSETS.logo2d;

    motionPreference.addEventListener('change', updateMotionPreference);
    window.addEventListener('resize', handleResize);
    updateMotionPreference();

    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener('resize', handleResize);
      motionPreference.removeEventListener('change', updateMotionPreference);
      image.onload = null;
      image.onerror = null;
    };
  }, [lowPower]);

  return (
    <div className={styles.background} aria-hidden="true">
      <canvas ref={canvasRef} className={`${styles.canvas} ${lowPower ? styles.static : ''}`} />
      {fallback && <img src={BRAND_ASSETS.logo2d} className={styles.fallback} alt="" />}
    </div>
  );
}
