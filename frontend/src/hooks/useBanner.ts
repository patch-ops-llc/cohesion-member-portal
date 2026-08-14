import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import api from '../services/api';
import type { PublicBanner } from '../types';

async function fetchBanner(): Promise<PublicBanner | null> {
  const response = await api.get<{ banner: PublicBanner | null }>('/settings/banner');
  return response.data.banner;
}

// Does this banner apply to the route currently being viewed?
export function bannerAppliesTo(banner: PublicBanner, pathname: string): boolean {
  if (banner.pages === 'all') return true;
  return banner.pages.some(page =>
    page === '/' ? pathname === '/' : pathname.startsWith(page)
  );
}

/**
 * The active banner for the current route, or null.
 *
 * Unauthenticated so it can also render on the login page — a "portal is down
 * for maintenance" notice is least useful to people who are already inside.
 * Failures resolve to null: a banner outage must never block the portal.
 */
export function useBanner(): PublicBanner | null {
  const location = useLocation();

  const { data } = useQuery({
    queryKey: ['portal-banner'],
    queryFn: fetchBanner,
    // Always refetch: a banner is a live announcement, so a client must never
    // be looking at a version that staff have already changed or switched off.
    // refetchOnWindowFocus overrides the app-wide default, so switching back to
    // the tab picks up a change without a reload.
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retry: false
  });

  if (!data) return null;
  return bannerAppliesTo(data, location.pathname) ? data : null;
}
