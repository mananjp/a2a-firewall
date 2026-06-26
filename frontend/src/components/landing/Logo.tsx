interface LogoProps {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}

export function Logo({ size = 28, withWordmark = true, className = "" }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="A2A Firewall logo"
        role="img"
      >
        <defs>
          <linearGradient id="shield-gradient" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#60a5fa" />
            <stop offset="0.5" stopColor="#22d3ee" />
            <stop offset="1" stopColor="#10b981" />
          </linearGradient>
        </defs>
        <path
          d="M16 2 L28 6 V16 C28 22.5 22.5 28.5 16 30 C9.5 28.5 4 22.5 4 16 V6 Z"
          fill="url(#shield-gradient)"
          opacity="0.95"
        />
        <path
          d="M16 2 L28 6 V16 C28 22.5 22.5 28.5 16 30 C9.5 28.5 4 22.5 4 16 V6 Z"
          stroke="white"
          strokeOpacity="0.15"
          strokeWidth="1"
        />
        <circle cx="16" cy="16" r="6.5" stroke="white" strokeOpacity="0.85" strokeWidth="1.4" fill="none" />
        <circle cx="16" cy="16" r="2.6" fill="white" fillOpacity="0.9" />
      </svg>
      {withWordmark && (
        <span className="font-semibold tracking-tight text-white">A2A Firewall</span>
      )}
    </span>
  );
}
