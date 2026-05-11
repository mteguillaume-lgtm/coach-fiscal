const VARIANTS = {
  primary:   'relative overflow-hidden bg-teal-gradient text-white border-transparent hover:brightness-110 active:brightness-95 shadow-sm shimmer-btn',
  secondary: 'bg-white text-teal-600 border-teal-200 hover:bg-teal-50 hover:border-teal-300 active:bg-teal-100 shadow-sm',
  ghost:     'bg-transparent text-teal-600 border-transparent hover:bg-teal-50 active:bg-teal-100',
  dark:      'relative overflow-hidden bg-white/10 text-white border-white/20 hover:bg-white/20 backdrop-blur-sm',
  danger:    'bg-white text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 active:bg-red-100',
};

const SIZES = {
  sm: 'text-xs px-3 py-1.5 rounded-lg gap-1.5',
  md: 'text-sm px-4 py-2 rounded-xl gap-2',
  lg: 'text-sm px-6 py-3 rounded-xl gap-2 font-semibold',
  xl: 'text-base px-8 py-4 rounded-2xl gap-2.5 font-semibold',
};

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  className = '',
  ...props
}) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center font-medium border transition-all duration-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
        VARIANTS[variant] ?? VARIANTS.primary,
        SIZES[size] ?? SIZES.md,
        className,
      ].join(' ')}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
