import { isIP } from "node:net";

export interface NormalizedUrl {
  canonicalUrl: string;
  domain: string;
}

const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
]);

export function normalizeUrl(input: string): NormalizedUrl | null {
  try {
    const parsed = new URL(input.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (
      parsed.username ||
      parsed.password ||
      isBlockedHostname(parsed.hostname)
    ) {
      return null;
    }
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    if (
      (parsed.protocol === "http:" && parsed.port === "80") ||
      (parsed.protocol === "https:" && parsed.port === "443")
    ) {
      parsed.port = "";
    }
    const params = [...parsed.searchParams.entries()]
      .filter(
        ([key]) =>
          !key.toLowerCase().startsWith("utm_") &&
          !TRACKING_PARAMS.has(key.toLowerCase()),
      )
      .sort(([keyA, valueA], [keyB, valueB]) =>
        `${keyA}=${valueA}`.localeCompare(`${keyB}=${valueB}`),
      );
    parsed.search = "";
    for (const [key, value] of params) parsed.searchParams.append(key, value);
    if (parsed.pathname.length > 1)
      parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return { canonicalUrl: parsed.toString(), domain: parsed.hostname };
  } catch {
    return null;
  }
}

export function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (
    normalized === "localhost" ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized === "metadata.google.internal" ||
    normalized === "169.254.169.254"
  )
    return true;

  const version = isIP(normalized);
  if (version === 4) {
    const octets = normalized.split(".").map(Number);
    const first = octets[0] ?? -1;
    const second = octets[1] ?? -1;
    return (
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      first === 0
    );
  }
  if (version === 6) {
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8")
    );
  }
  return false;
}

export function dedupeUrls(urls: string[]): NormalizedUrl[] {
  const seen = new Set<string>();
  const normalized: NormalizedUrl[] = [];
  for (const url of urls) {
    const value = normalizeUrl(url);
    if (value && !seen.has(value.canonicalUrl)) {
      seen.add(value.canonicalUrl);
      normalized.push(value);
    }
  }
  return normalized;
}
