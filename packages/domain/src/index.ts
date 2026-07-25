import { createHash } from "node:crypto";

export const remoteScopes = ["remote", "hybrid", "onsite", "unknown"] as const;
export type RemoteScope = (typeof remoteScopes)[number];

export const employmentTypes = [
  "full-time",
  "part-time",
  "contract",
  "internship",
  "temporary",
  "unknown",
] as const;
export type EmploymentType = (typeof employmentTypes)[number];

export interface SalaryRange {
  min: number | null;
  max: number | null;
  currency: string | null;
  period: "hour" | "month" | "year" | null;
  text: string | null;
}

export interface NormalizedJobInput {
  sourceId: string;
  externalId: string;
  sourceUrl: string;
  title: string;
  companyName: string;
  location: string;
  description: string;
  remoteScope: RemoteScope;
  remoteConfidence: number;
  employmentType: EmploymentType;
  salary: SalaryRange;
  tags: string[];
  publishedAt: Date | null;
  rawData: Record<string, unknown>;
}

export interface JobSourceView {
  id: string;
  label: string;
  url: string;
  lastSeenAt: string;
}

export interface JobView {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  remoteScope: RemoteScope;
  remoteConfidence: number;
  employmentType: EmploymentType;
  salary: SalaryRange;
  tags: string[];
  publishedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  sources: JobSourceView[];
}

export interface JobSearchFilters {
  query?: string;
  location?: string;
  source?: string;
  remoteScope?: RemoteScope;
  page?: number;
  limit?: number;
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeKey(value: string): string {
  return normalizeWhitespace(value)
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyRemote(text: string): {
  scope: RemoteScope;
  confidence: number;
  evidence: string[];
} {
  const normalized = normalizeWhitespace(text).toLocaleLowerCase("en-US");
  const explicitRemotePatterns = [/不需坐班/u, /无需坐班/u, /\bnot\s+on[ -]?site\b/u];
  const onsitePatterns = [
    /不接受远程/u,
    /非远程/u,
    /必须坐班/u,
    /\bnot\s+remote\b/u,
    /\bno\s+remote\b/u,
    /\bremote\s+(?:is\s+)?(?:unavailable|not available)\b/u,
    /\bon[ -]?site\b/u,
  ];
  const hybridPatterns = [/混合办公/u, /灵活办公/u, /\bhybrid\b/u];
  const remotePatterns = [
    /远程办公/u,
    /全远程/u,
    /居家办公/u,
    /可远程/u,
    /\bfully remote\b/u,
    /\bwork from home\b/u,
    /\bremote\b/u,
  ];

  const match = (patterns: RegExp[]) => patterns.flatMap((pattern) => normalized.match(pattern)?.[0] ?? []);
  const explicitRemote = match(explicitRemotePatterns);
  if (explicitRemote.length > 0) {
    return { scope: "remote", confidence: 0.94, evidence: explicitRemote };
  }

  const onsite = match(onsitePatterns);
  if (onsite.length > 0) {
    return { scope: "onsite", confidence: 0.94, evidence: onsite };
  }

  const hybrid = match(hybridPatterns);
  if (hybrid.length > 0) {
    return { scope: "hybrid", confidence: 0.88, evidence: hybrid };
  }

  const remote = match(remotePatterns);
  if (remote.length > 0) {
    return {
      scope: "remote",
      confidence: remote.some((item) => /全远程|fully remote/u.test(item)) ? 0.98 : 0.86,
      evidence: remote,
    };
  }

  return { scope: "unknown", confidence: 0, evidence: [] };
}

export function parseSalary(text: string | null | undefined): SalaryRange {
  const original = normalizeWhitespace(text ?? "");
  if (!original) {
    return { min: null, max: null, currency: null, period: null, text: null };
  }

  const normalized = original.toLocaleLowerCase("en-US").replace(/,/g, "");
  const match = normalized.match(/(?:[$¥￥])?\s*(\d+(?:\.\d+)?)\s*([kw万]?)\s*[-~—至]\s*(?:[$¥￥])?\s*(\d+(?:\.\d+)?)\s*([kw万]?)/u);
  if (!match) {
    return { min: null, max: null, currency: null, period: null, text: original };
  }

  const scale = (suffix: string | undefined): number => {
    if (suffix === "k") return 1_000;
    if (suffix === "w" || suffix === "万") return 10_000;
    return 1;
  };
  const min = Number(match[1]) * scale(match[2] || match[4]);
  const max = Number(match[3]) * scale(match[4] || match[2]);
  const currency = /[$]/u.test(original) ? "USD" : "CNY";
  const period = /(?:年|year|annual|\/yr)/u.test(normalized)
    ? "year"
    : /(?:时|hour|\/hr)/u.test(normalized)
      ? "hour"
      : "month";

  return { min, max, currency, period, text: original };
}

export function createJobFingerprint(job: Pick<NormalizedJobInput, "title" | "companyName" | "location" | "remoteScope" | "description">): string {
  const descriptionSignature = normalizeKey(job.description).slice(0, 500);
  const value = [
    normalizeKey(job.companyName),
    normalizeKey(job.title),
    normalizeKey(job.location),
    job.remoteScope,
    descriptionSignature,
  ].join("|");
  return createHash("sha256").update(value).digest("hex");
}
