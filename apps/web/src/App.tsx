import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ExternalLink,
  Filter,
  Globe2,
  LocateFixed,
  MapPin,
  RefreshCw,
  Search,
  SlidersHorizontal,
  WifiOff,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchJobs, fetchSources, fetchStats } from "./api";
import { companyInitials, formatSalary, relativeTime } from "./format";
import type { Filters, Job, JobResponse, Source, Stats } from "./types";

const initialFilters: Filters = { query: "", location: "", remoteScope: "", source: "", page: 1 };

function ScopeBadge({ scope }: { scope: Job["remoteScope"] }) {
  const label = scope === "unknown" ? "Workplace unclear" : scope;
  return <span className={`scope-badge scope-${scope}`}>{label}</span>;
}

function CompanyMark({ name }: { name: string }) {
  const variant = name.charCodeAt(0) % 4;
  return <span className={`company-mark company-mark-${variant}`}>{companyInitials(name)}</span>;
}

function JobListItem({ job, selected, onSelect }: { job: Job; selected: boolean; onSelect: () => void }) {
  return (
    <button className={`job-row${selected ? " selected" : ""}`} onClick={onSelect} type="button">
      <CompanyMark name={job.company} />
      <span className="job-row-content">
        <span className="job-row-heading">
          <strong>{job.title}</strong>
          <span className="posted-time">{relativeTime(job.publishedAt ?? job.firstSeenAt)}</span>
        </span>
        <span className="company-name">{job.company}</span>
        <span className="job-meta">
          <span><MapPin size={14} />{job.location}</span>
          <span><BriefcaseBusiness size={14} />{job.employmentType}</span>
        </span>
        <span className="job-row-footer">
          <span className="salary">{formatSalary(job)}</span>
          <ScopeBadge scope={job.remoteScope} />
        </span>
      </span>
    </button>
  );
}

function JobDetail({ job }: { job: Job }) {
  const source = job.sources[0];
  return (
    <article className="job-detail">
      <header className="detail-header">
        <CompanyMark name={job.company} />
        <div>
          <p className="detail-company">{job.company}</p>
          <h2>{job.title}</h2>
        </div>
      </header>

      <div className="detail-facts">
        <span><MapPin size={16} />{job.location}</span>
        <span><BriefcaseBusiness size={16} />{job.employmentType}</span>
        <span><Globe2 size={16} />{job.remoteScope}</span>
      </div>

      <div className="detail-actions">
        {source ? (
          <a className="primary-button" href={source.url} target="_blank" rel="noreferrer">
            View original <ExternalLink size={16} />
          </a>
        ) : null}
        <span className="freshness"><CheckCircle2 size={16} />Checked {relativeTime(job.lastSeenAt)}</span>
      </div>

      <dl className="detail-summary">
        <div>
          <dt>Compensation</dt>
          <dd>{formatSalary(job)}</dd>
        </div>
        <div>
          <dt>Work arrangement</dt>
          <dd><ScopeBadge scope={job.remoteScope} /></dd>
        </div>
      </dl>

      <section className="detail-section">
        <h3>Role overview</h3>
        <p>{job.description}</p>
      </section>

      <section className="detail-section">
        <h3>Skills and focus</h3>
        <div className="tag-list">
          {job.tags.map((tag) => <span key={tag}>{tag}</span>)}
        </div>
      </section>

      <footer className="source-note">
        <Building2 size={16} />
        <span>{job.sources.length} source{job.sources.length === 1 ? "" : "s"} matched this listing</span>
      </footer>
    </article>
  );
}

function LoadingRows() {
  return <div className="loading-rows" aria-label="Loading jobs">
    {[0, 1, 2, 3].map((row) => <div className="loading-row" key={row}><span /><div><i /><i /><i /></div></div>)}
  </div>;
}

export default function App() {
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [jobs, setJobs] = useState<JobResponse | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([fetchStats(controller.signal), fetchSources(controller.signal)])
      .then(([nextStats, nextSources]) => {
        setStats(nextStats);
        setSources(nextSources);
      })
      .catch((requestError: unknown) => {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) setError("Could not load source status.");
      });
    return () => controller.abort();
  }, [refreshToken]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchJobs(filters, controller.signal)
      .then((result) => {
        setJobs(result);
        setSelectedId((current) => result.items.some((job) => job.id === current) ? current : (result.items[0]?.id ?? null));
      })
      .catch((requestError: unknown) => {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) setError("The job feed is temporarily unavailable.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [filters, refreshToken]);

  const selectedJob = useMemo(
    () => jobs?.items.find((job) => job.id === selectedId) ?? jobs?.items[0] ?? null,
    [jobs, selectedId],
  );
  const hasFilters = Boolean(filters.query || filters.location || filters.remoteScope || filters.source);
  const totalPages = jobs ? Math.max(1, Math.ceil(jobs.total / jobs.limit)) : 1;

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setFilters({ ...draft, page: 1 });
  };

  const clearFilters = () => {
    setDraft(initialFilters);
    setFilters(initialFilters);
  };

  const goToPage = (page: number) => {
    setFilters((current) => ({ ...current, page }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Globortunity home">
          <span className="brand-mark"><Globe2 size={21} /></span>
          <span>Globortunity</span>
        </a>
        <div className="feed-status">
          <span className="status-dot" />
          {stats?.lastUpdatedAt ? `Updated ${relativeTime(stats.lastUpdatedAt)}` : "Feed starting"}
        </div>
      </header>

      <main>
        <section className="search-band">
          <div className="search-inner">
            <div className="search-heading">
              <div>
                <p className="eyebrow">Remote opportunity index</p>
                <h1>Remote jobs, clearly sourced.</h1>
              </div>
              <button className="icon-button" title="Refresh jobs" aria-label="Refresh jobs" onClick={() => setRefreshToken((value) => value + 1)}>
                <RefreshCw size={18} />
              </button>
            </div>

            <form className="search-form" onSubmit={submitSearch}>
              <label className="field keyword-field">
                <Search size={18} />
                <span className="sr-only">Keyword</span>
                <input value={draft.query} onChange={(event) => setDraft({ ...draft, query: event.target.value })} placeholder="Role, skill, or company" />
              </label>
              <label className="field location-field">
                <LocateFixed size={18} />
                <span className="sr-only">Location</span>
                <input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="Country or time zone" />
              </label>
              <button className="search-button" type="submit"><Search size={18} />Search jobs</button>
            </form>

            <div className="filter-row">
              <div className="scope-control" aria-label="Work arrangement">
                {(["", "remote", "hybrid"] as const).map((scope) => (
                  <button
                    className={draft.remoteScope === scope ? "active" : ""}
                    key={scope || "all"}
                    onClick={() => setDraft({ ...draft, remoteScope: scope })}
                    type="button"
                  >
                    {scope || "All roles"}
                  </button>
                ))}
              </div>
              <label className="source-select">
                <SlidersHorizontal size={16} />
                <select value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value })} aria-label="Job source">
                  <option value="">All sources</option>
                  {sources.filter((source) => source.enabled).map((source) => <option value={source.id} key={source.id}>{source.label}</option>)}
                </select>
              </label>
              {hasFilters ? <button className="clear-button" onClick={clearFilters} type="button"><X size={15} />Clear</button> : null}
            </div>
          </div>
        </section>

        <section className="workspace">
          <div className="summary-strip">
            <span><strong>{stats?.activeJobs ?? 0}</strong> active roles</span>
            <span><strong>{stats?.remoteJobs ?? 0}</strong> fully remote</span>
            <span><strong>{stats?.sources ?? 0}</strong> active sources</span>
          </div>

          {error ? (
            <div className="error-state" role="alert">
              <WifiOff size={24} />
              <div><strong>Feed unavailable</strong><p>{error}</p></div>
              <button onClick={() => setRefreshToken((value) => value + 1)} type="button">Try again</button>
            </div>
          ) : (
            <div className="results-layout">
              <section className="results-list" aria-label="Job results">
                <div className="results-toolbar">
                  <div><Filter size={16} /><strong>{jobs?.total ?? 0}</strong> matches</div>
                  <span>Newest first</span>
                </div>
                {loading && !jobs ? <LoadingRows /> : null}
                {!loading && jobs?.items.length === 0 ? (
                  <div className="empty-state"><Search size={28} /><strong>No matching roles</strong><p>Try a broader title or location.</p><button onClick={clearFilters} type="button">Reset filters</button></div>
                ) : null}
                <div className={loading ? "job-list is-refreshing" : "job-list"}>
                  {jobs?.items.map((job) => (
                    <JobListItem job={job} key={job.id} selected={selectedJob?.id === job.id} onSelect={() => setSelectedId(job.id)} />
                  ))}
                </div>
                {jobs && jobs.total > jobs.limit ? (
                  <nav className="pagination" aria-label="Results pages">
                    <button className="icon-button" title="Previous page" aria-label="Previous page" disabled={filters.page <= 1} onClick={() => goToPage(filters.page - 1)}><ArrowLeft size={18} /></button>
                    <span>Page {filters.page} of {totalPages}</span>
                    <button className="icon-button" title="Next page" aria-label="Next page" disabled={filters.page >= totalPages} onClick={() => goToPage(filters.page + 1)}><ArrowRight size={18} /></button>
                  </nav>
                ) : null}
              </section>
              <aside className="detail-pane" aria-live="polite">
                {selectedJob ? <JobDetail job={selectedJob} /> : <div className="detail-placeholder"><BriefcaseBusiness size={30} /><p>Select a role to see its details.</p></div>}
              </aside>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
