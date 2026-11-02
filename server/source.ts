import { FeedService } from './feed.ts';
import { scheduledSnapshot } from './scheduled.ts';

export function createTransitSource() {
  if (!process.env.TRANSIT_FEED_URL && process.env.TRANSIT_MODE === 'ctan') return { get: () => scheduledSnapshot() };
  return new FeedService(process.env.TRANSIT_FEED_URL);
}
