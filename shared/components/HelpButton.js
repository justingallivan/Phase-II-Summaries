import Link from 'next/link';

/**
 * HelpButton - Small "?" icon that links to the guide section for an app.
 *
 * Usage: <HelpButton appKey="reviewer-finder" />
 */
export default function HelpButton({ appKey, className = '' }) {
  return (
    <Link
      href={`/guide#${appKey}`}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-full border border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition-colors text-sm font-medium ${className}`}
      title="View guide"
    >
      ?
    </Link>
  );
}
