import { useEffect, useState } from 'react';
import { Megaphone, Save, Eye, AlertCircle, CheckCircle } from 'lucide-react';
import clsx from 'clsx';
import api from '../../services/api';
import { Banner } from '../shared/Banner';
import { InlineLoader } from '../shared/LoadingSpinner';
import type { PortalBanner, BannerStyle } from '../../types';

interface PageOption {
  value: string;
  label: string;
}

const STYLE_OPTIONS: { value: BannerStyle; label: string; hint: string }[] = [
  { value: 'info', label: 'Informational', hint: 'General announcements' },
  { value: 'warning', label: 'Warning', hint: 'Deadlines, outages, action needed' },
  { value: 'success', label: 'Success', hint: 'Good news, completed milestones' }
];

export function BannerSettings() {
  const [banner, setBanner] = useState<PortalBanner | null>(null);
  const [pageOptions, setPageOptions] = useState<PageOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await api.get<{ banner: PortalBanner; pageOptions: PageOption[] }>(
          '/admin/settings/banner'
        );
        if (cancelled) return;
        setBanner(response.data.banner);
        setPageOptions(response.data.pageOptions);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load banner settings');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const update = (patch: Partial<PortalBanner>) => {
    setBanner(prev => (prev ? { ...prev, ...patch } : prev));
    setSaved(false);
  };

  const handleSave = async () => {
    if (!banner) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await api.put<{ banner: PortalBanner }>('/admin/settings/banner', {
        enabled: banner.enabled,
        message: banner.message,
        style: banner.style,
        cta: banner.cta,
        pages: banner.pages
      });
      setBanner(response.data.banner);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save banner');
    } finally {
      setIsSaving(false);
    }
  };

  const togglePage = (value: string) => {
    if (!banner) return;
    const current = banner.pages === 'all' ? [] : banner.pages;
    const next = current.includes(value)
      ? current.filter(p => p !== value)
      : [...current, value];
    update({ pages: next.length === 0 ? 'all' : next });
  };

  if (isLoading) return <InlineLoader message="Loading banner settings..." />;
  if (!banner) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
        {error || 'Banner settings unavailable'}
      </div>
    );
  }

  const ctaLabel = banner.cta?.label ?? '';
  const ctaUrl = banner.cta?.url ?? '';

  const setCta = (label: string, url: string) => {
    update({ cta: label.trim() || url.trim() ? { label, url } : null });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Megaphone className="h-6 w-6 text-primary" />
          Portal Banner
        </h1>
        <p className="text-gray-600 mt-1">
          Shown across the client-facing portal. Changes take effect immediately — no deployment needed.
        </p>
      </div>

      {/* Live preview uses the real client component, so what you see here
          cannot drift from what clients actually get. */}
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-2">
          <Eye className="h-4 w-4" />
          Preview
        </div>
        {banner.message.trim() ? (
          <div className="rounded-lg overflow-hidden border border-gray-200">
            <Banner
              banner={{
                message: banner.message,
                style: banner.style,
                cta: banner.cta,
                pages: banner.pages,
                updatedAt: banner.updatedAt
              }}
              preview
            />
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-400 text-sm">
            Add a message to see the preview
          </div>
        )}
      </div>

      <div className="card p-6 space-y-5">
        {/* On/off */}
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={banner.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <span>
            <span className="font-medium text-gray-900">Show banner to clients</span>
            <span className="block text-sm text-gray-500">
              {banner.enabled ? 'Currently visible in the portal' : 'Hidden — clients see nothing'}
            </span>
          </span>
        </label>

        {/* Message */}
        <div>
          <label htmlFor="banner-message" className="label">Message</label>
          <textarea
            id="banner-message"
            value={banner.message}
            onChange={(e) => update({ message: e.target.value })}
            rows={3}
            maxLength={500}
            placeholder="e.g. Tax documents are due March 15. Upload yours as soon as possible."
            className="input"
          />
          <p className="text-xs text-gray-400 mt-1">{banner.message.length}/500 characters</p>
        </div>

        {/* Style */}
        <div>
          <span className="label">Style</span>
          <div className="grid sm:grid-cols-3 gap-2">
            {STYLE_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => update({ style: option.value })}
                className={clsx(
                  'text-left p-3 rounded-lg border transition-colors',
                  banner.style === option.value
                    ? 'border-primary bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                )}
              >
                <span className="block font-medium text-sm text-gray-900">{option.label}</span>
                <span className="block text-xs text-gray-500">{option.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div>
          <span className="label">Call-to-action button (optional)</span>
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              type="text"
              value={ctaLabel}
              onChange={(e) => setCta(e.target.value, ctaUrl)}
              placeholder="Button label, e.g. Learn more"
              maxLength={60}
              className="input"
            />
            <input
              type="text"
              value={ctaUrl}
              onChange={(e) => setCta(ctaLabel, e.target.value)}
              placeholder="https://… or /settings/notifications"
              className="input"
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Both fields are required for the button to appear. Only http(s) links and in-portal paths are accepted.
          </p>
        </div>

        {/* Pages */}
        <div>
          <span className="label">Where to show it</span>
          <label className="flex items-center gap-2 mb-2 cursor-pointer">
            <input
              type="radio"
              checked={banner.pages === 'all'}
              onChange={() => update({ pages: 'all' })}
              className="h-4 w-4 border-gray-300 text-primary focus:ring-primary"
            />
            <span className="text-sm text-gray-900">All client-facing pages</span>
          </label>
          <label className="flex items-center gap-2 mb-2 cursor-pointer">
            <input
              type="radio"
              checked={banner.pages !== 'all'}
              onChange={() => update({ pages: [pageOptions[0]?.value ?? '/'] })}
              className="h-4 w-4 border-gray-300 text-primary focus:ring-primary"
            />
            <span className="text-sm text-gray-900">Only selected pages</span>
          </label>

          {banner.pages !== 'all' && (
            <div className="ml-6 space-y-1.5">
              {pageOptions.map(option => (
                <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={banner.pages !== 'all' && banner.pages.includes(option.value)}
                    onChange={() => togglePage(option.value)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-gray-700">{option.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <span className="text-red-800 text-sm">{error}</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={isSaving} className="btn-primary">
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? 'Publishing…' : 'Publish changes'}
        </button>
        {saved && (
          <span className="text-green-700 text-sm flex items-center gap-1">
            <CheckCircle className="h-4 w-4" />
            Published — clients see this now
          </span>
        )}
      </div>
    </div>
  );
}
