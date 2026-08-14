import { Router } from 'express';
import { getPortalBanner } from '../services/settings';

const router = Router();

/**
 * GET /api/settings/banner
 *
 * Deliberately unauthenticated: the banner renders on the login page too, so
 * gating it behind a JWT would hide it from exactly the people who most need
 * to see a "portal is down for maintenance" notice. Returns only what is safe
 * to show a logged-out visitor.
 */
router.get('/banner', async (req, res, next) => {
  try {
    const banner = await getPortalBanner();

    // No caching. The SOW requires banner changes to take effect immediately,
    // and any max-age means a client keeps showing a withdrawn or stale notice
    // until it expires. The cost is one indexed single-row lookup per page load.
    res.set('Cache-Control', 'no-store');

    if (!banner.enabled) {
      res.json({ banner: null });
      return;
    }

    res.json({
      banner: {
        message: banner.message,
        style: banner.style,
        cta: banner.cta,
        pages: banner.pages,
        updatedAt: banner.updatedAt
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
