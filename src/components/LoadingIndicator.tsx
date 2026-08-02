interface LoadingIndicatorProps {
  variant?: 'full' | 'compact'
  label?: string
}

export default function LoadingIndicator({
  variant = 'full',
  label,
}: LoadingIndicatorProps) {
  return (
    <div
      className={`loading-indicator loading-indicator--${variant}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="loading-brand" aria-hidden="true">
        <BrandMark size={variant === 'full' ? 42 : 26} />
      </span>
      <span className="loading-spinner" aria-hidden="true" />
      <div className="loading-bar-track" aria-hidden="true">
        <div className="loading-bar-fill" />
      </div>
      {label && <span className="loading-label">{label}</span>}
    </div>
  )
}
import BrandMark from './BrandMark'
