import { FeedService } from './feed.ts';
import { officialTransitService } from './transit-service.ts';

export function createTransitSource() {
  if (process.env.TRANSIT_MODE === 'demo' && !process.env.TRANSIT_FEED_URL) return new FeedService();
  return officialTransitService();
}
