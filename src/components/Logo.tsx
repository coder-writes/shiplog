export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 22 20" className="h-5 w-auto" aria-hidden fill="currentColor">
        <rect x="0" y="5" width="2.6" height="10" rx="1.3" />
        <rect x="4.8" y="1" width="2.6" height="18" rx="1.3" />
        <rect x="9.6" y="7" width="2.6" height="6" rx="1.3" />
        <rect x="14.4" y="3" width="2.6" height="14" rx="1.3" />
        <rect x="19.2" y="6" width="2.6" height="8" rx="1.3" />
      </svg>
      <span className="text-xl font-semibold tracking-tight">ShipLog</span>
    </span>
  );
}
