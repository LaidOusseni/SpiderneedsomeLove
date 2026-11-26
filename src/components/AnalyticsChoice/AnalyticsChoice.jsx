import { useState } from 'react';
import styles from './AnalyticsChoice.module.css';
import { isAnalyticsOptedOut, setAnalyticsOptOut } from '../../services/analytics';

/** Accepter / refuser la mesure d'audience anonyme (le refus supprime l'identifiant du navigateur). */
const AnalyticsChoice = () => {
  const [optedOut, setOptedOut] = useState(isAnalyticsOptedOut);
  const toggle = () => {
    setAnalyticsOptOut(!optedOut);
    setOptedOut(!optedOut);
  };
  return (
    <div className={styles.choice}>
      <p className={styles.state} role="status">
        {optedOut ? 'Mesure d’audience refusée sur cet appareil.' : 'Mesure d’audience anonyme active sur cet appareil.'}
      </p>
      <button type="button" className={styles.btn} onClick={toggle} aria-pressed={optedOut}>
        {optedOut ? 'Réactiver la mesure d’audience' : 'Refuser la mesure d’audience'}
      </button>
    </div>
  );
};

export default AnalyticsChoice;
