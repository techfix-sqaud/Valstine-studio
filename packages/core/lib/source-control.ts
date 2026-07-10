import {
  adoCreateRepo,
  adoGetProfile,
  adoListRepos,
  type ADOProfile,
  type ADORepository,
} from "@/lib/azure-devops";
import {
  ghCreateRepo,
  ghGetUser,
  ghListRepos,
  type GHRepo,
  type GHUser,
} from "@/lib/github";

export type SourceControlProvider = "github" | "azure-devops";

export interface SourceControlSettings {
  provider: SourceControlProvider;
  azureOrganization: string;
  azureProject: string;
}

export interface SourceControlConfig extends SourceControlSettings {
  githubToken: string;
  azureDevOpsToken: string;
}

export interface SourceControlProfile {
  id: string;
  provider: SourceControlProvider;
  login: string;
  displayName: string;
  avatarUrl?: string;
}

export interface SourceControlRepo {
  id: string;
  provider: SourceControlProvider;
  name: string;
  fullName: string;
  project?: string;
  private: boolean;
  htmlUrl: string;
  cloneUrl: string;
  description: string | null;
  defaultBranch: string;
}

export function getSourceControlProviderLabel(provider: SourceControlProvider) {
  return provider === "azure-devops" ? "Azure DevOps" : "GitHub";
}

export function getSourceControlToken(config: SourceControlConfig) {
  return config.provider === "azure-devops"
    ? config.azureDevOpsToken
    : config.githubToken;
}

export function sourceControlSupportsSchemaPush(provider: SourceControlProvider) {
  return provider === "github";
}

export function sourceControlSupportsRepoPrivacy(provider: SourceControlProvider) {
  return provider === "github";
}

export function sourceControlRequiresProject(provider: SourceControlProvider) {
  return provider === "azure-devops";
}

export function validateSourceControlConfig(config: SourceControlConfig) {
  if (!getSourceControlToken(config).trim()) {
    return `${getSourceControlProviderLabel(config.provider)} token is required.`;
  }
  if (config.provider === "azure-devops" && !config.azureOrganization.trim()) {
    return "Azure DevOps organization is required.";
  }
  return null;
}

function normalizeGitHubProfile(user: GHUser): SourceControlProfile {
  return {
    id: user.login,
    provider: "github",
    login: user.login,
    displayName: user.name ?? user.login,
    avatarUrl: user.avatar_url,
  };
}

function normalizeGitHubRepo(repo: GHRepo): SourceControlRepo {
  return {
    id: String(repo.id),
    provider: "github",
    name: repo.name,
    fullName: repo.full_name,
    private: repo.private,
    htmlUrl: repo.html_url,
    cloneUrl: repo.clone_url,
    description: repo.description,
    defaultBranch: repo.default_branch,
  };
}

function normalizeAzureProfile(profile: ADOProfile): SourceControlProfile {
  const login = profile.emailAddress || profile.publicAlias || profile.displayName;
  return {
    id: profile.id,
    provider: "azure-devops",
    login,
    displayName: profile.displayName,
  };
}

function normalizeAzureRepo(repo: ADORepository): SourceControlRepo {
  const project = repo.project?.name ?? "";
  return {
    id: repo.id,
    provider: "azure-devops",
    name: repo.name,
    fullName: project ? `${project}/${repo.name}` : repo.name,
    project,
    private: true,
    htmlUrl: repo.webUrl,
    cloneUrl: repo.remoteUrl,
    description: null,
    defaultBranch: repo.defaultBranch?.replace("refs/heads/", "") ?? "main",
  };
}

export async function loadSourceControlAccount(config: SourceControlConfig) {
  const validationError = validateSourceControlConfig(config);
  if (validationError) {
    throw new Error(validationError);
  }

  if (config.provider === "azure-devops") {
    const [profile, repos] = await Promise.all([
      adoGetProfile(config.azureDevOpsToken, config.azureOrganization),
      adoListRepos(config.azureDevOpsToken, config.azureOrganization),
    ]);
    return {
      profile: normalizeAzureProfile(profile),
      repos: repos.map(normalizeAzureRepo),
    };
  }

  const [profile, repos] = await Promise.all([
    ghGetUser(config.githubToken),
    ghListRepos(config.githubToken),
  ]);

  return {
    profile: normalizeGitHubProfile(profile),
    repos: repos.map(normalizeGitHubRepo),
  };
}

export async function createSourceControlRepo(
  config: SourceControlConfig,
  input: { name: string; description: string; isPrivate: boolean },
) {
  const validationError = validateSourceControlConfig(config);
  if (validationError) {
    throw new Error(validationError);
  }

  if (config.provider === "azure-devops") {
    if (!config.azureProject.trim()) {
      throw new Error("Azure DevOps project is required to create a repository.");
    }
    const repo = await adoCreateRepo(
      config.azureDevOpsToken,
      config.azureOrganization,
      config.azureProject,
      input.name,
    );
    return normalizeAzureRepo(repo);
  }

  const repo = await ghCreateRepo(
    config.githubToken,
    input.name,
    input.description,
    input.isPrivate,
  );
  return normalizeGitHubRepo(repo);
}