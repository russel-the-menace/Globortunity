import type { Job } from "./types";

export function formatSalary(job: Job): string {
  if (job.salary.text) return job.salary.text;
  if (job.salary.min === null && job.salary.max === null) return "Salary not listed";
  const formatter = new Intl.NumberFormat("en", {
    style: job.salary.currency ? "currency" : "decimal",
    ...(job.salary.currency ? { currency: job.salary.currency } : {}),
    maximumFractionDigits: 0,
  });
  const range = [job.salary.min, job.salary.max]
    .filter((value): value is number => value !== null)
    .map((value) => formatter.format(value))
    .join(" - ");
  return job.salary.period ? `${range} / ${job.salary.period}` : range;
}

export function relativeTime(value: string | null): string {
  if (!value) return "Recently";
  const difference = new Date(value).getTime() - Date.now();
  const absolute = Math.abs(difference);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (absolute < 60 * 60 * 1000) return formatter.format(Math.round(difference / (60 * 1000)), "minute");
  if (absolute < 24 * 60 * 60 * 1000) return formatter.format(Math.round(difference / (60 * 60 * 1000)), "hour");
  return formatter.format(Math.round(difference / (24 * 60 * 60 * 1000)), "day");
}

export function companyInitials(name: string): string {
  return name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toLocaleUpperCase("en-US") ?? "")
    .join("");
}
