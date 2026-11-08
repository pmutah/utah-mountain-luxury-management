import { corsJson } from './data';
import { findCleanLink } from './clean-link-store';
import { storageReadPaused } from './kv-json';
import type { SettingsEnv } from './kv';
import type { CleanLinkRecord } from '../../src/lib/clean-link';

/**
 * Resolve a cleaner's token, keeping "bad link" and "could not read" apart.
 *
 * Every cleaner route used `findCleanLink(...).catch(() => null)`, which turns **any** storage failure into "This
 * clean link is not valid." Measured on production on a token minted seconds earlier: `404, 404, 404, 200, 404, 200,
 * 404, 404` across eight identical reads — a cleaner standing in a driveway was told their link was bad most of the
 * time, when the link was fine and the read had failed.
 *
 * That is worse than an outage, because of what it teaches: a person told their credential is invalid stops trying,
 * and the next time the page works they no longer trust it.
 *
 * Returns either the link or a response to send. A caller that gets a response must return it unchanged.
 */
export async function resolveCleanLink(
  env: SettingsEnv,
  token: string,
  request: Request,
): Promise<{ link: CleanLinkRecord } | { response: Response }> {
  let link: CleanLinkRecord | null;
  try {
    link = await findCleanLink(env, token);
  } catch (err) {
    /*
     * 503, not 404. The token may be perfectly good; we simply do not know, and the honest thing is to say so and
     * invite another try. `storageReads: 'paused'` marks the read-limited case for the desk.
     */
    const response = storageReadPaused(err)
      ? corsJson(
          request,
          {
            error: 'The clean links could not be read just now. This is not a bad link — try again in a moment.',
            storageReads: 'paused',
          },
          503,
        )
      : corsJson(
          request,
          { error: 'The clean links could not be read just now. This is not a bad link — try again in a moment.' },
          503,
        );
    return { response };
  }
  if (!link) {
    return { response: corsJson(request, { error: 'This clean link is not valid.' }, 404) };
  }
  return { link };
}
