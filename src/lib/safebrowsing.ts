// Google Safe Browsing Lookup API (v4) integration.
// Checks a destination URL against Google's phishing/malware lists before we
// agree to shorten it. This is the single most important protection for keeping
// the domain off browser blocklists.
//
// Requires a free API key from https://console.cloud.google.com (enable the
// "Safe Browsing API"). Provide it as the SAFE_BROWSING_API_KEY secret.
// If no key is configured, checks are skipped (fail-open) so the app still runs.

const ENDPOINT = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';

export interface SafeBrowsingResult {
  /** True when the URL is safe (or checking was skipped / unavailable). */
  safe: boolean;
  /** Threat types matched, when unsafe. */
  threats: string[];
  /** True when no key was configured and the check was skipped. */
  skipped: boolean;
}

export async function checkUrlSafety(
  url: string,
  apiKey: string | undefined,
): Promise<SafeBrowsingResult> {
  if (!apiKey) {
    return { safe: true, threats: [], skipped: true };
  }

  const body = {
    client: { clientId: 'snip-url-shortener', clientVersion: '1.0.0' },
    threatInfo: {
      threatTypes: [
        'MALWARE',
        'SOCIAL_ENGINEERING',
        'UNWANTED_SOFTWARE',
        'POTENTIALLY_HARMFUL_APPLICATION',
      ],
      platformTypes: ['ANY_PLATFORM'],
      threatEntryTypes: ['URL'],
      threatEntries: [{ url }],
    },
  };

  try {
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      // On API errors we fail OPEN (allow) so a Google outage doesn't take the
      // whole service down — abuse is still caught by the other layers.
      return { safe: true, threats: [], skipped: true };
    }

    const data = (await res.json()) as {
      matches?: { threatType?: string }[];
    };
    const matches = data.matches ?? [];
    if (matches.length > 0) {
      return {
        safe: false,
        threats: [...new Set(matches.map((m) => m.threatType ?? 'THREAT'))],
        skipped: false,
      };
    }
    return { safe: true, threats: [], skipped: false };
  } catch {
    return { safe: true, threats: [], skipped: true };
  }
}
