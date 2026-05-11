export default function Card({
  children,
  className = '',
  hoverable = false,
  glass = false,
  dark = false,
}) {
  return (
    <div
      className={[
        'rounded-2xl border p-6',
        dark
          ? 'bg-white/8 border-white/12 backdrop-blur-md'
          : glass
            ? 'bg-white/70 border-white/70 backdrop-blur-sm shadow-glass'
            : 'bg-white border-gray-100 shadow-sm',
        hoverable ? 'card-lift cursor-default' : '',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}
