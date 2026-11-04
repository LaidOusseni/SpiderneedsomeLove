import styles from './StatusBadge.module.css';
import { STATUS_LABELS } from '../../utils/creationStatus';

const StatusBadge = ({ status, className = '' }) => (
  <span className={`${styles.badge} ${styles[status] ?? ''} ${className}`}>
    <span className={styles.dot} aria-hidden="true" />
    {STATUS_LABELS[status] ?? status}
  </span>
);

export default StatusBadge;
