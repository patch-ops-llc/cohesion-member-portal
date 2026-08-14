import { useState } from 'react';
import { Info, AlertTriangle, CheckCircle, X } from 'lucide-react';
import clsx from 'clsx';
import type { PublicBanner, BannerStyle } from '../../types';

interface BannerProps {
  banner: PublicBanner;
  /** Preview mode: render inert, no dismiss, no navigation */
  preview?: boolean;
}

const styles: Record<BannerStyle, { wrapper: string; icon: string; button: string }> = {
  info: {
    wrapper: 'bg-blue-50 border-blue-200 text-blue-900',
    icon: 'text-blue-600',
    button: 'bg-blue-600 hover:bg-blue-700 text-white'
  },
  warning: {
    wrapper: 'bg-amber-50 border-amber-200 text-amber-900',
    icon: 'text-amber-600',
    button: 'bg-amber-600 hover:bg-amber-700 text-white'
  },
  success: {
    wrapper: 'bg-green-50 border-green-200 text-green-900',
    icon: 'text-green-600',
    button: 'bg-green-600 hover:bg-green-700 text-white'
  }
};

const icons: Record<BannerStyle, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle
};

/**
 * Portal-wide announcement bar.
 *
 * The message is rendered as plain text, never as HTML — it is admin-authored
 * content served to every client, so injecting markup here would turn the
 * banner editor into a stored-XSS vector.
 */
export function Banner({ banner, preview = false }: BannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !banner.message.trim()) return null;

  const style = styles[banner.style] ?? styles.info;
  const Icon = icons[banner.style] ?? Info;

  return (
    <div className={clsx('border-b', style.wrapper)} role="status" aria-live="polite">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-start sm:items-center gap-3 flex-col sm:flex-row">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <Icon className={clsx('h-5 w-5 flex-shrink-0 mt-0.5 sm:mt-0', style.icon)} />
            <p className="text-sm leading-relaxed break-words">{banner.message}</p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-auto">
            {banner.cta && (
              <a
                href={preview ? undefined : banner.cta.url}
                onClick={preview ? (e) => e.preventDefault() : undefined}
                target={banner.cta.url.startsWith('http') ? '_blank' : undefined}
                rel="noopener noreferrer"
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                  style.button,
                  preview && 'cursor-default'
                )}
              >
                {banner.cta.label}
              </a>
            )}

            {!preview && (
              <button
                onClick={() => setDismissed(true)}
                className="p-1 rounded hover:bg-black/5 transition-colors"
                aria-label="Dismiss announcement"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
