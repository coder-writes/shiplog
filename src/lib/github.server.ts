// Server-only GitHub client and sync. Never log or return the token.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { addDays, dateInTz } from "./dates";
import { ACTIVITY_TYPES, type ActivityType } from "./constants";
import { decryptToken } from "./crypto.server";

const API = "https://api.github.com";
const MAX_SEARCH_PAGES = 5; // 500 results per query
const MAX_THREADS_PER_TYPE = 80; // bound per-issue follow-up calls
const CONCURRENCY = 4; // Workers allow 6 outbound requests in flight

export class GitHubError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type ActivityRow = Database["public"]["Tables"]["github_activity"]["Insert"];
export type SyncCounts = Record<ActivityType, number>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function excerpt(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.trim();
  return t ? t.slice(0, 300) : null;
}

/** Turn a GitHub failure into a message the user can act on. */
function explain(status: number, body: string, headers: Headers): string {
  const lower = body.toLowerCase();
  if (status === 401) return "GitHub rejected the token. It may be invalid or expired. Create a new token in Settings.";
  if (status === 403 && (headers.get("x-github-sso") || lower.includes("saml"))) {
    return "Your token is not authorized for an organization that uses SSO. On GitHub, open the token and click Configure SSO to authorize it for that organization.";
  }
  if (status === 403 && lower.includes("resource not accessible")) {
    return "The token is missing access. Give it read access to metadata, contents, issues and pull requests.";
  }
  if (status === 404) return "GitHub could not find that resource. The token may not have access to the repository.";
  if (status === 422) return "GitHub could not run the search. Check that the GitHub username in Settings is correct.";
  return `GitHub returned an error (${status}).`;
}

/** Sliding window limiter for the search API (30 requests per minute). */
class SearchLimiter {
  private stamps: number[] = [];
  async wait() {
    const now = Date.now();
    this.stamps = this.stamps.filter((t) => now - t < 60_000);
    if (this.stamps.length >= 28) {
      const waitMs = 60_000 - (now - (this.stamps[0] ?? now)) + 250;
      await sleep(waitMs);
    }
    this.stamps.push(Date.now());
  }
}

class GitHub {
  private search = new SearchLimiter();
  constructor(private token: string) {}

  async request<T>(path: string, opts: { search?: boolean } = {}): Promise<{ data: T; headers: Headers }> {
    for (let attempt = 0; attempt < 4; attempt++) {
      if (opts.search) await this.search.wait();
      const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "ShipLog",
        },
      });
      if (res.ok) return { data: (await res.json()) as T, headers: res.headers };

      const body = await res.text();
      const remaining = res.headers.get("x-ratelimit-remaining");
      const retryAfter = Number(res.headers.get("retry-after") ?? "");
      const isRateLimit =
        res.status === 429 ||
        (res.status === 403 && (remaining === "0" || /rate limit/i.test(body)));
      if (isRateLimit && attempt < 3) {
        let waitMs = 0;
        if (retryAfter > 0) waitMs = retryAfter * 1000;
        else if (remaining === "0") {
          const reset = Number(res.headers.get("x-ratelimit-reset") ?? "0") * 1000;
          waitMs = Math.max(1000, reset - Date.now() + 500);
        } else waitMs = 2 ** attempt * 15_000; // secondary rate limit: back off
        if (waitMs > 65_000) {
          throw new GitHubError("GitHub rate limit reached. Try syncing again in a few minutes.", 429);
        }
        await sleep(waitMs);
        continue;
      }
      // Status code and a trimmed message only: never include request headers.
      console.error(`GitHub request failed [${res.status}] ${path.split("?")[0]}`);
      throw new GitHubError(explain(res.status, body, res.headers), res.status);
    }
    throw new GitHubError("GitHub rate limit reached. Try syncing again in a few minutes.", 429);
  }

  async searchAll<T>(kind: "commits" | "issues", q: string): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; page <= MAX_SEARCH_PAGES; page++) {
      const { data } = await this.request<{ items: T[]; total_count: number }>(
        `/search/${kind}?q=${encodeURIComponent(q)}&per_page=100&page=${page}`,
        { search: true },
      );
      out.push(...data.items);
      if (data.items.length < 100 || out.length >= data.total_count) break;
    }
    return out;
  }

  async listAll<T>(path: string): Promise<T[]> {
    const out: T[] = [];
    let url: string | null = `${path}${path.includes("?") ? "&" : "?"}per_page=100`;
    let pages = 0;
    while (url && pages < 10) {
      const { data, headers }: { data: T[]; headers: Headers } = await this.request<T[]>(url);
      out.push(...data);
      const link = headers.get("link") ?? "";
      const next = /<([^>]+)>;\s*rel="next"/.exec(link);
      url = next?.[1] ?? null;
      pages++;
    }
    return out;
  }

  async me(): Promise<{ login: string }> {
    return (await this.request<{ login: string }>("/user")).data;
  }
}

async function inBatches<T>(items: T[], fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    await Promise.all(items.slice(i, i + CONCURRENCY).map(fn));
  }
}

type SearchIssue = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: string;
  created_at: string;
  updated_at: string;
  repository_url: string;
  user: { login: string } | null;
  pull_request?: { merged_at: string | null };
};
type SearchCommit = {
  sha: string;
  html_url: string;
  commit: { message: string; author: { date: string } | null; committer: { date: string } | null };
  repository: { full_name: string };
};
type Comment = { id: number; html_url: string; body: string | null; created_at: string; user: { login: string } | null };
type Review = { id: number; html_url: string; body: string | null; state: string; submitted_at: string | null; user: { login: string } | null };

const repoFromUrl = (u: string) => u.replace("https://api.github.com/repos/", "");

export async function verifyToken(token: string): Promise<string> {
  const gh = new GitHub(token);
  const me = await gh.me();
  return me.login;
}

/**
 * Fetch all seven activity types for [start, end] (dates in the user's timezone)
 * and upsert them on (user_id, external_id). Uses the service-role client.
 */
export async function syncGithubForUser(
  admin: SupabaseClient<Database>,
  userId: string,
  start: string,
  end: string,
): Promise<SyncCounts> {
  const { data: conn, error: connErr } = await admin
    .from("github_connections")
    .select("github_username, token")
    .eq("user_id", userId)
    .maybeSingle();
  if (connErr) throw new Error("Could not read your GitHub connection.");
  if (!conn) throw new GitHubError("Connect GitHub in Settings before syncing.", 400);

  const { data: profile } = await admin.from("profiles").select("timezone").eq("id", userId).maybeSingle();
  const tz = profile?.timezone || "Asia/Kolkata";

  const token = await decryptToken(conn.token);
  const gh = new GitHub(token);
  const login = conn.github_username;
  const me = login.toLowerCase();

  // GitHub date qualifiers are UTC; widen by a day and filter by the user's local day.
  const qStart = addDays(start, -1);
  const qEnd = addDays(end, 1);
  const range = `${qStart}..${qEnd}`;
  const sinceIso = `${qStart}T00:00:00Z`;
  const localDay = (iso: string) => dateInTz(iso, tz);
  const inRange = (iso: string | null | undefined) => {
    if (!iso) return false;
    const d = localDay(iso);
    return d >= start && d <= end;
  };

  const rows = new Map<string, ActivityRow>();
  const add = (r: Omit<ActivityRow, "user_id" | "activity_date"> & { occurred_at: string }) => {
    if (!inRange(r.occurred_at)) return;
    rows.set(r.external_id, { ...r, user_id: userId, activity_date: localDay(r.occurred_at) });
  };

  // 1. Commits
  const commits = await gh.searchAll<SearchCommit>("commits", `author:${login} author-date:${range}`);
  for (const c of commits) {
    const message = c.commit.message ?? "";
    if (/^Merge (pull request|branch)/.test(message)) continue;
    const when = c.commit.author?.date ?? c.commit.committer?.date;
    if (!when) continue;
    add({
      external_id: `commit:${c.sha}`,
      type: "commit",
      repo: c.repository.full_name,
      title: (message.split("\n")[0] ?? "").slice(0, 300),
      body_excerpt: excerpt(message.split("\n").slice(1).join("\n")),
      url: c.html_url,
      sha: c.sha,
      state: null,
      occurred_at: when,
    });
  }

  // 2. PRs opened
  const opened = await gh.searchAll<SearchIssue>("issues", `type:pr author:${login} created:${range}`);
  for (const p of opened) {
    add({
      external_id: `pr_opened:${p.id}`,
      type: "pr_opened",
      repo: repoFromUrl(p.repository_url),
      title: p.title,
      body_excerpt: excerpt(p.body),
      url: p.html_url,
      sha: null,
      state: p.state,
      occurred_at: p.created_at,
    });
  }

  // 3. PRs merged (with line counts from the PR detail)
  const merged = await gh.searchAll<SearchIssue>("issues", `type:pr author:${login} is:merged merged:${range}`);
  await inBatches(merged.slice(0, MAX_THREADS_PER_TYPE), async (p) => {
    const repo = repoFromUrl(p.repository_url);
    const { data: pr } = await gh.request<{ additions: number; deletions: number; merged_at: string | null }>(
      `/repos/${repo}/pulls/${p.number}`,
    );
    const when = pr.merged_at ?? p.pull_request?.merged_at;
    if (!when) return;
    add({
      external_id: `pr_merged:${p.id}`,
      type: "pr_merged",
      repo,
      title: p.title,
      body_excerpt: excerpt(p.body),
      url: p.html_url,
      sha: null,
      state: "merged",
      occurred_at: when,
      additions: pr.additions,
      deletions: pr.deletions,
    });
  });

  // 4. Issues opened
  const issues = await gh.searchAll<SearchIssue>("issues", `type:issue author:${login} created:${range}`);
  for (const i of issues) {
    add({
      external_id: `issue_opened:${i.id}`,
      type: "issue_opened",
      repo: repoFromUrl(i.repository_url),
      title: i.title,
      body_excerpt: excerpt(i.body),
      url: i.html_url,
      sha: null,
      state: i.state,
      occurred_at: i.created_at,
    });
  }

  // 5. Comments on issues
  const commentedIssues = await gh.searchAll<SearchIssue>("issues", `commenter:${login} updated:${range} type:issue`);
  await inBatches(commentedIssues.slice(0, MAX_THREADS_PER_TYPE), async (i) => {
    const repo = repoFromUrl(i.repository_url);
    const comments = await gh.listAll<Comment>(`/repos/${repo}/issues/${i.number}/comments?since=${sinceIso}`);
    for (const c of comments) {
      if (c.user?.login.toLowerCase() !== me) continue;
      add({
        external_id: `issue_comment:${c.id}`,
        type: "issue_comment",
        repo,
        title: i.title,
        body_excerpt: excerpt(c.body),
        url: c.html_url,
        sha: null,
        state: i.state,
        occurred_at: c.created_at,
      });
    }
  });

  // 6. Comments on PRs (conversation comments + inline review comments)
  const commentedPrs = await gh.searchAll<SearchIssue>("issues", `commenter:${login} updated:${range} type:pr`);
  await inBatches(commentedPrs.slice(0, MAX_THREADS_PER_TYPE), async (p) => {
    const repo = repoFromUrl(p.repository_url);
    const [conversation, inline] = await Promise.all([
      gh.listAll<Comment>(`/repos/${repo}/issues/${p.number}/comments?since=${sinceIso}`),
      gh.listAll<Comment>(`/repos/${repo}/pulls/${p.number}/comments?since=${sinceIso}`),
    ]);
    for (const [prefix, list] of [
      ["pr_comment", conversation],
      ["pr_review_comment", inline],
    ] as const) {
      for (const c of list) {
        if (c.user?.login.toLowerCase() !== me) continue;
        add({
          external_id: `${prefix}:${c.id}`,
          type: "pr_comment",
          repo,
          title: p.title,
          body_excerpt: excerpt(c.body),
          url: c.html_url,
          sha: null,
          state: p.state,
          occurred_at: c.created_at,
        });
      }
    }
  });

  // 7. Reviews on other people's PRs
  const reviewed = await gh.searchAll<SearchIssue>(
    "issues",
    `type:pr reviewed-by:${login} -author:${login} updated:${range}`,
  );
  const others = reviewed.filter((p) => p.user?.login.toLowerCase() !== me);
  await inBatches(others.slice(0, MAX_THREADS_PER_TYPE), async (p) => {
    const repo = repoFromUrl(p.repository_url);
    const reviews = await gh.listAll<Review>(`/repos/${repo}/pulls/${p.number}/reviews`);
    for (const r of reviews) {
      if (r.user?.login.toLowerCase() !== me || !r.submitted_at) continue;
      add({
        external_id: `review:${r.id}`,
        type: "review",
        repo,
        title: p.title,
        body_excerpt: excerpt(r.body),
        url: r.html_url,
        sha: null,
        state: r.state.toLowerCase(),
        occurred_at: r.submitted_at,
      });
    }
  });

  const all = Array.from(rows.values());
  for (let i = 0; i < all.length; i += 200) {
    const { error } = await admin
      .from("github_activity")
      .upsert(all.slice(i, i + 200), { onConflict: "user_id,external_id" });
    if (error) {
      console.error("github_activity upsert failed:", error.message);
      throw new Error("Could not save GitHub activity.");
    }
  }

  await admin.from("github_connections").update({ last_synced_at: new Date().toISOString() }).eq("user_id", userId);

  const counts = Object.fromEntries(ACTIVITY_TYPES.map((t) => [t, 0])) as SyncCounts;
  for (const r of all) counts[r.type as ActivityType]++;
  return counts;
}
