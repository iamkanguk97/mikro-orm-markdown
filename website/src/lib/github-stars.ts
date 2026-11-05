// Fetches the repository's star count once per build for the header GitHub button.
// The module-level promise means every page rendered in one build shares a single
// request (GitHub allows 60 unauthenticated requests per hour). Any failure —
// offline build, rate limit, unexpected response — yields `undefined`, and the
// button then shows the icon alone instead of failing the build.

const REPO_API_URL = 'https://api.github.com/repos/iamkanguk97/mikro-orm-markdown';
const REQUEST_TIMEOUT_MS = 5000;
const THOUSAND = 1000;

let starCountPromise: Promise<number | undefined> | undefined;

function warnUnavailable(reason: string): undefined {
  // biome-ignore lint/suspicious/noConsole: build log is the only place to report a missing star count
  console.warn(`[website] GitHub star count unavailable: ${reason}`);
  return undefined;
}

async function fetchStarCount(): Promise<number | undefined> {
  try {
    const response = await fetch(REPO_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return warnUnavailable(`HTTP ${response.status}`);
    }
    const body: unknown = await response.json();
    const count = (body as { stargazers_count?: unknown } | null)?.stargazers_count;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
      return warnUnavailable('unexpected response shape');
    }
    return count;
  } catch (error) {
    return warnUnavailable(error instanceof Error ? error.message : String(error));
  }
}

export function getStarCount(): Promise<number | undefined> {
  starCountPromise ??= fetchStarCount();
  return starCountPromise;
}

/** 16 → "16", 1234 → "1.2k", 35000 → "35k". */
export function formatStarCount(count: number): string {
  if (count < THOUSAND) {
    return String(count);
  }
  const thousands = count / THOUSAND;
  return `${thousands >= 10 ? Math.floor(thousands) : Math.floor(thousands * 10) / 10}k`;
}
