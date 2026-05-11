import { Lock } from 'lucide-react';

export default function PrivacyBadge({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-teal-600 text-sm font-medium ${className}`}>
      <Lock size={14} aria-hidden="true" />
      Vos données restent sur votre appareil
    </span>
  );
}
