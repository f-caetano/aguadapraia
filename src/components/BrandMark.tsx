export default function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <path
        d="M9 17 A7 7 0 0 1 23 17"
        stroke="var(--cp-warning)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <line x1="16" y1="5" x2="16" y2="8.5" stroke="var(--cp-warning)" strokeWidth="2" strokeLinecap="round" />
      <line x1="7.5" y1="8.5" x2="9.8" y2="10.8" stroke="var(--cp-warning)" strokeWidth="2" strokeLinecap="round" />
      <line x1="24.5" y1="8.5" x2="22.2" y2="10.8" stroke="var(--cp-warning)" strokeWidth="2" strokeLinecap="round" />
      <line x1="4.5" y1="17" x2="7.5" y2="17" stroke="var(--cp-warning)" strokeWidth="2" strokeLinecap="round" />
      <line x1="27.5" y1="17" x2="24.5" y2="17" stroke="var(--cp-warning)" strokeWidth="2" strokeLinecap="round" />
      <line x1="2" y1="17" x2="30" y2="17" stroke="var(--cp-map-line)" strokeWidth="1.2" opacity="0.55" />
      <path
        d="M2 21 Q7 18 12 21 Q17 24 22 21 Q27 18 30 21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M2 26 Q7 23 12 26 Q17 29 22 26 Q27 23 30 26"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  )
}
