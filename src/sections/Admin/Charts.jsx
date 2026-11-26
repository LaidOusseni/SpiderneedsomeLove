import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import styles from './Admin.module.css';

/** Largeur réelle du conteneur (graphiques nets à toutes les tailles, sans étirement). */
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(600);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

const niceMax = (v) => {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

export const formatNumber = (n) => new Intl.NumberFormat('fr-FR').format(Math.round(Number(n) || 0));

function formatBucket(d, bucket) {
  if (bucket === 'hour') return `${d.slice(11, 13)} h`;
  const [, m, day] = d.split('-');
  return `${day}/${m}`;
}

/**
 * Évolution dans le temps — une seule série (une seule échelle), aire légère + ligne 2 px,
 * repère et info-bulle au survol / au toucher, tableau des valeurs pour l'accessibilité.
 */
export function TimeChart({ series, field, label, bucket = 'day', height = 220, format = formatNumber }) {
  const [ref, width] = useWidth();
  const [hoverIndex, setHover] = useState(null);
  // Changement de période : l'index survolé peut ne plus exister dans la nouvelle série
  const hover = hoverIndex !== null && hoverIndex < series.length ? hoverIndex : null;
  const gid = useId().replace(/:/g, '');
  const pad = { top: 16, right: 12, bottom: 28, left: 40 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const values = series.map((p) => Number(p[field]) || 0);
  const max = niceMax(Math.max(0, ...values));
  const n = Math.max(1, values.length - 1);
  const x = (i) => pad.left + (values.length === 1 ? w / 2 : (i / n) * w);
  const y = (v) => pad.top + h - (v / max) * h;
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = `${line}L${x(values.length - 1).toFixed(1)},${pad.top + h}L${x(0).toFixed(1)},${pad.top + h}Z`;
  const tickEvery = Math.max(1, Math.ceil(values.length / Math.max(2, Math.floor(w / 70))));
  const total = values.reduce((a, b) => a + b, 0);

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const i = Math.round(((px - pad.left) / w) * n);
    setHover(Math.min(values.length - 1, Math.max(0, i)));
  };

  return (
    <figure className={styles.chart}>
      <figcaption className={styles.chartCaption}>
        <span>{label}</span>
        <span className={styles.chartTotal}>{format(total)} sur la période</span>
      </figcaption>
      <div ref={ref} className={styles.chartBox}>
        {values.length === 0 ? <p className={styles.empty}>Aucune donnée sur cette période.</p> : (
          <svg width={width} height={height} role="img" aria-label={`${label} : ${format(total)} sur la période`}
            onPointerMove={onMove} onPointerLeave={() => setHover(null)} className={styles.svg}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#ff3355" stopOpacity="0.32" />
                <stop offset="1" stopColor="#ff3355" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 0.5, 1].map((t) => (
              <g key={t}>
                <line x1={pad.left} x2={pad.left + w} y1={y(max * t)} y2={y(max * t)} className={styles.grid} />
                <text x={pad.left - 8} y={y(max * t)} dy="0.32em" textAnchor="end" className={styles.axis}>{format(max * t)}</text>
              </g>
            ))}
            {series.map((p, i) => (i % tickEvery === 0 || i === values.length - 1) && (
              <text key={p.d} x={x(i)} y={height - 8} textAnchor="middle" className={styles.axis}>{formatBucket(p.d, bucket)}</text>
            ))}
            <path d={area} fill={`url(#${gid})`} />
            <path d={line} fill="none" stroke="#ff3355" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + h} className={styles.crosshair} />
                <circle cx={x(hover)} cy={y(values[hover])} r="5" fill="#ff3355" stroke="#160306" strokeWidth="2" />
              </g>
            )}
          </svg>
        )}
        {hover !== null && (
          <div className={styles.tooltip} style={{ left: Math.min(Math.max(x(hover), 70), width - 70) }}>
            <strong>{format(values[hover])}</strong> {label.toLowerCase()}
            <span>{formatBucket(series[hover].d, bucket)}{bucket === 'day' ? ` ${series[hover].d.slice(0, 4)}` : ''}</span>
          </div>
        )}
      </div>
      <details className={styles.dataTable}>
        <summary>Voir les données</summary>
        <table>
          <thead><tr><th>{bucket === 'hour' ? 'Heure' : 'Jour'}</th><th>{label}</th></tr></thead>
          <tbody>{series.filter((p) => Number(p[field]) > 0).map((p) => <tr key={p.d}><td>{formatBucket(p.d, bucket)}</td><td>{format(p[field])}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}

/** Classement en barres horizontales (une seule couleur), valeur écrite en clair à côté de chaque barre. */
export function BarList({ items, format = formatNumber, empty = 'Aucune donnée sur cette période.' }) {
  const max = useMemo(() => Math.max(1, ...items.map((i) => Number(i.value) || 0)), [items]);
  if (!items.length || items.every((i) => !Number(i.value))) return <p className={styles.empty}>{empty}</p>;
  return (
    <ol className={styles.barList}>
      {items.map((item, i) => (
        <li key={item.key ?? item.label} className={styles.barRow} title={`${item.label} : ${format(item.value)}${item.sub ? ` · ${item.sub}` : ''}`}>
          <span className={styles.barRank}>{i + 1}</span>
          <span className={styles.barLabel}>
            <span className={styles.barName}>{item.label}</span>
            {item.sub && <span className={styles.barSub}>{item.sub}</span>}
          </span>
          <span className={styles.barTrack} aria-hidden="true">
            <span className={styles.barFill} style={{ width: `${Math.max(1.5, ((Number(item.value) || 0) / max) * 100)}%` }} />
          </span>
          <span className={styles.barValue}>{format(item.value)}</span>
        </li>
      ))}
    </ol>
  );
}
