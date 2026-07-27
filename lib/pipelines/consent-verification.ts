import { logger } from '../logger.js';

export type ConsentStatus = 'VERIFIED' | 'FLAG' | 'UNKNOWN';

export interface ConsentVerificationResult {
  status: ConsentStatus;
  domainAllowed: boolean;
  robotsTxtAllowed: boolean;
  optInHeaderVerified: boolean;
  reason: string;
  provenance: {
    domain: string;
    checkedAt: string;
    rulesApplied: string[];
  };
}

// Allowed domains for public domain & open API content
const DEFAULT_WHITELIST_DOMAINS = new Set([
  'otruyenapi.com',
  'mangadex.org',
  'api.mangadex.org',
  'wikisource.org',
  'vi.wikisource.org',
  'gutenberg.org',
  'syosetu.com',
  'ncode.syosetu.com',
  'archive.org',
]);

export class ConsentVerifier {
  private whitelist: Set<string>;

  constructor(customWhitelist?: string[]) {
    this.whitelist = new Set([
      ...DEFAULT_WHITELIST_DOMAINS,
      ...(customWhitelist || []),
    ]);
  }

  public isDomainWhitelisted(domainOrUrl: string): boolean {
    try {
      let hostname = domainOrUrl;
      if (domainOrUrl.startsWith('http://') || domainOrUrl.startsWith('https://')) {
        const urlObj = new URL(domainOrUrl);
        hostname = urlObj.hostname;
      }
      hostname = hostname.toLowerCase();

      for (const allowedDomain of this.whitelist) {
        if (hostname === allowedDomain || hostname.endsWith('.' + allowedDomain)) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  public parseRobotsTxt(robotsTxt: string, userAgent = 'NovaBot'): { disallowPatterns: string[]; allowPatterns: string[] } {
    const disallowPatterns: string[] = [];
    const allowPatterns: string[] = [];

    if (!robotsTxt) {
      return { disallowPatterns, allowPatterns };
    }

    const lines = robotsTxt.split('\n');
    let isApplicableAgent = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const [key, ...valParts] = trimmed.split(':');
      const value = valParts.join(':').trim();
      const lowerKey = key.trim().toLowerCase();

      if (lowerKey === 'user-agent') {
        isApplicableAgent = value === '*' || value.toLowerCase() === userAgent.toLowerCase();
      } else if (isApplicableAgent) {
        if (lowerKey === 'disallow') {
          if (value) disallowPatterns.push(value);
        } else if (lowerKey === 'allow') {
          if (value) allowPatterns.push(value);
        }
      }
    }

    return { disallowPatterns, allowPatterns };
  }

  public isPathAllowedByRobots(
    path: string,
    robotsTxt?: string,
    userAgent = 'NovaBot'
  ): boolean {
    if (!robotsTxt) return true;

    const { disallowPatterns, allowPatterns } = this.parseRobotsTxt(robotsTxt, userAgent);

    // Check allow patterns first
    for (const pattern of allowPatterns) {
      if (pattern && path.startsWith(pattern)) {
        return true;
      }
    }

    // Check disallow patterns
    for (const pattern of disallowPatterns) {
      if (pattern === '/' || (pattern && path.startsWith(pattern))) {
        return false;
      }
    }

    return true;
  }

  public verifyOptInHeaders(headers: Record<string, string> | Headers | undefined): boolean {
    if (!headers) return false;

    const getHeader = (name: string): string | null => {
      if (typeof (headers as Headers).get === 'function') {
        return (headers as Headers).get(name);
      }
      const record = headers as Record<string, string>;
      const lower = name.toLowerCase();
      for (const k of Object.keys(record)) {
        if (k.toLowerCase() === lower) return record[k];
      }
      return null;
    };

    const consentHeader = getHeader('x-nova-consent');
    const licenseHeader = getHeader('x-license-mode');

    return consentHeader === 'opt-in' || consentHeader === 'verified' || licenseHeader === 'public-domain' || licenseHeader === 'open-access';
  }

  public evaluateConsent(
    targetUrl: string,
    robotsTxt?: string,
    headers?: Record<string, string>
  ): ConsentVerificationResult {
    const rulesApplied: string[] = [];
    const checkedAt = new Date().toISOString();

    let domain = '';
    let urlPath = '/';
    try {
      const parsed = new URL(targetUrl);
      domain = parsed.hostname;
      urlPath = parsed.pathname;
    } catch {
      domain = targetUrl;
    }

    // 1. Domain Whitelist Check
    const domainAllowed = this.isDomainWhitelisted(domain);
    rulesApplied.push(`domain_whitelist:${domainAllowed}`);

    // 2. Robots.txt Check
    const robotsTxtAllowed = this.isPathAllowedByRobots(urlPath, robotsTxt);
    rulesApplied.push(`robots_txt:${robotsTxtAllowed}`);

    // 3. Opt-in Header Check
    const optInHeaderVerified = this.verifyOptInHeaders(headers);
    rulesApplied.push(`opt_in_headers:${optInHeaderVerified}`);

    let status: ConsentStatus = 'UNKNOWN';
    let reason = 'Default unknown status';

    if (domainAllowed && robotsTxtAllowed) {
      status = 'VERIFIED';
      reason = 'Domain is whitelisted and robots.txt allows access';
    } else if (optInHeaderVerified) {
      status = 'VERIFIED';
      reason = 'Explicit opt-in headers provided';
    } else if (!robotsTxtAllowed) {
      status = 'FLAG';
      reason = 'Blocked by robots.txt rules';
    } else {
      status = 'UNKNOWN';
      reason = 'Domain not in whitelist and no opt-in header found';
    }

    logger.info({
      msg: 'Consent verification completed',
      domain,
      status,
      domainAllowed,
      robotsTxtAllowed,
      optInHeaderVerified,
    });

    return {
      status,
      domainAllowed,
      robotsTxtAllowed,
      optInHeaderVerified,
      reason,
      provenance: {
        domain,
        checkedAt,
        rulesApplied,
      },
    };
  }
}

export const consentVerifier = new ConsentVerifier();
