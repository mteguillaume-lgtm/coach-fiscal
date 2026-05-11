export default function Card({ children, className = '', hoverable = false }) {
  return (
    <div
      className={[
        'bg-white rounded-xl border border-gray-100 shadow-sm p-6',
        hoverable ? 'transition-shadow duration-200 hover:shadow-md' : '',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}
