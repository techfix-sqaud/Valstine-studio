const AZURE_DEVOPS_API = "https://dev.azure.com";
const AZURE_DEVOPS_PROFILE_API = "https://vssps.dev.azure.com";

function authHeader(token: string) {
  return `Basic ${btoa(`:${token}`)}`;
}

async function adoFetch<T>(
  token: string,
  organization: string,
  path: string,
  opts: RequestInit = {},
  baseUrl = AZURE_DEVOPS_API,
): Promise<T> {
  const res = await fetch(`${baseUrl}/${organization}${path}`, {
    ...opts,
    headers: {
      Authorization: authHeader(token),
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Azure DevOps API error: ${res.status}`);
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return {} as T;
  }

  return res.json() as Promise<T>;
}

export interface ADOProfile {
  id: string;
  displayName: string;
  publicAlias?: string;
  emailAddress?: string;
  coreRevision?: number;
}

interface ADOProjectRef {
  id: string;
  name: string;
}

export interface ADORepository {
  id: string;
  name: string;
  remoteUrl: string;
  webUrl: string;
  defaultBranch?: string;
  project?: ADOProjectRef;
  size?: number;
}

export async function adoGetProfile(
  token: string,
  organization: string,
): Promise<ADOProfile> {
  return adoFetch<ADOProfile>(
    token,
    organization,
    "/_apis/profile/profiles/me?api-version=7.1-preview.3",
    {},
    AZURE_DEVOPS_PROFILE_API,
  );
}

export async function adoListRepos(
  token: string,
  organization: string,
): Promise<ADORepository[]> {
  const response = await adoFetch<{ value: ADORepository[] }>(
    token,
    organization,
    "/_apis/git/repositories?api-version=7.1-preview.1",
  );
  return response.value ?? [];
}

export async function adoCreateRepo(
  token: string,
  organization: string,
  project: string,
  name: string,
): Promise<ADORepository> {
  return adoFetch<ADORepository>(
    token,
    organization,
    `/${encodeURIComponent(project)}/_apis/git/repositories?api-version=7.1-preview.1`,
    {
      method: "POST",
      body: JSON.stringify({ name }),
    },
  );
}