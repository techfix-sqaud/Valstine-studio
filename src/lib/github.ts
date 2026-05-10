const GITHUB_API = "https://api.github.com";

async function ghFetch<T>(token: string, path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as any;
    throw new Error(body.message ?? `GitHub API error: ${res.status}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return {} as T;
  return res.json();
}

export interface GHUser {
  login: string;
  name: string | null;
  avatar_url: string;
  public_repos: number;
  total_private_repos?: number;
}

export interface GHRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  clone_url: string;
  ssh_url: string;
  description: string | null;
  updated_at: string;
  language: string | null;
  default_branch: string;
  stargazers_count: number;
}

export interface GHBranch {
  name: string;
  protected: boolean;
}

export interface GHFileContent {
  sha: string;
  content: string; // base64
  encoding: string;
}

export async function ghGetUser(token: string): Promise<GHUser> {
  return ghFetch<GHUser>(token, "/user");
}

export async function ghListRepos(token: string, page = 1): Promise<GHRepo[]> {
  return ghFetch<GHRepo[]>(
    token,
    `/user/repos?sort=updated&per_page=50&page=${page}&affiliation=owner,collaborator`,
  );
}

export async function ghCreateRepo(
  token: string,
  name: string,
  description: string,
  isPrivate: boolean,
  autoInit = true,
): Promise<GHRepo> {
  return ghFetch<GHRepo>(token, "/user/repos", {
    method: "POST",
    body: JSON.stringify({ name, description, private: isPrivate, auto_init: autoInit }),
  });
}

export async function ghDeleteRepo(token: string, owner: string, repo: string): Promise<void> {
  await ghFetch(token, `/repos/${owner}/${repo}`, { method: "DELETE" });
}

export async function ghGetFile(
  token: string,
  owner: string,
  repo: string,
  filePath: string,
  ref?: string,
): Promise<GHFileContent | null> {
  try {
    return await ghFetch<GHFileContent>(
      token,
      `/repos/${owner}/${repo}/contents/${filePath}${ref ? `?ref=${ref}` : ""}`,
    );
  } catch {
    return null;
  }
}

export async function ghPushFile(
  token: string,
  owner: string,
  repo: string,
  filePath: string,
  content: string,
  message: string,
  sha?: string,
): Promise<void> {
  // content must be base64; encode properly (handles Unicode)
  const b64 = btoa(
    encodeURIComponent(content).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16)),
    ),
  );
  await ghFetch(token, `/repos/${owner}/${repo}/contents/${filePath}`, {
    method: "PUT",
    body: JSON.stringify({ message, content: b64, ...(sha ? { sha } : {}) }),
  });
}

export async function ghListBranches(token: string, owner: string, repo: string): Promise<GHBranch[]> {
  return ghFetch<GHBranch[]>(token, `/repos/${owner}/${repo}/branches`);
}

export async function ghSearchRepos(token: string, query: string): Promise<GHRepo[]> {
  const result = await ghFetch<{ items: GHRepo[] }>(
    token,
    `/search/repositories?q=${encodeURIComponent(query)}+user:@me&sort=updated&per_page=20`,
  );
  return result.items ?? [];
}

export function ghParseRepoUrl(url: string): { owner: string; repo: string } | null {
  // https://github.com/owner/repo(.git)
  const httpsMatch = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };
  return null;
}
