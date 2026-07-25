export type RemoteScope = "remote" | "hybrid" | "onsite" | "unknown";

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  remoteScope: RemoteScope;
  remoteConfidence: number;
  employmentType: "full-time" | "part-time" | "contract" | "internship" | "temporary" | "unknown";
  salary: {
    min: number | null;
    max: number | null;
    currency: string | null;
    period: "hour" | "month" | "year" | null;
    text: string | null;
  };
  tags: string[];
  publishedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  sources: Array<{ id: string; label: string; url: string; lastSeenAt: string }>;
}

export interface JobResponse {
  items: Job[];
  total: number;
  page: number;
  limit: number;
}

export interface Stats {
  activeJobs: number;
  remoteJobs: number;
  sources: number;
  lastUpdatedAt: string | null;
}

export interface Source {
  id: string;
  label: string;
  enabled: boolean;
  policyStatus: string;
  lastSuccessAt: string | null;
}

export interface Filters {
  query: string;
  location: string;
  remoteScope: "" | RemoteScope;
  source: string;
  page: number;
}
