import styles from './Input.module.css';

/**
 * Reusable Input component
 * @param {'text'|'email'|'radio'} type
 */
const Input = ({ label, id, type = 'text', className = '', ...props }) => {
  if (type === 'radio') {
    return (
      <label className={`${styles.radioWrapper} ${className}`} htmlFor={id}>
        <span className={styles.radioLabel}>{label}</span>
        <input type="radio" id={id} className={styles.radioInput} {...props} />
      </label>
    );
  }

  return (
    <div className={`${styles.wrapper} ${className}`}>
      {label && (
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
      )}
      <input type={type} id={id} className={styles.input} {...props} />
    </div>
  );
};

export default Input;
