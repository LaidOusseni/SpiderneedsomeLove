import styles from './Button.module.css';

/**
 * @param {'primary'|'secondary'|'ghost'} variant
 */
const Button = ({ children, onClick, disabled = false, variant = 'primary', type = 'button', className = '', ...props }) => {
  return (
    <button
      type={type}
      className={`${styles.btn} ${styles[variant]} ${disabled ? styles.disabled : ''} ${className}`}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
