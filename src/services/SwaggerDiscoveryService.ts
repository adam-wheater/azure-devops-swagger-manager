import * as SDK from "azure-devops-extension-sdk";
import { getClient } from "azure-devops-extension-api";
import {
  GitRestClient,
  GitRepository,
  GitItem,
  VersionControlRecursionType,
} from "azure-devops-extension-api/Git";
import { CommonServiceIds, IProjectPageService } from "azure-devops-extension-api";

export interface DiscoveredApi {
  repoName: string;
  repoId: string;
  filePath: string;
  branch: string;
  rawUrl: string;
  /** Friendly name derived from repo + file path */
  suggestedName: string;
}

/** File name patterns that indicate a Swagger / OpenAPI spec. */
const SPEC_PATTERNS = [
  // Any .json/.yaml/.yml whose name contains swagger, openapi, or open-api
  /swagger.*\.(json|ya?ml)$/i,
  /(open[_-]?api).*\.(json|ya?ml)$/i,
];

/** Directories to skip when walking the tree (saves time on large repos). */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "bin",
  "obj",
  "dist",
  "out",
  "packages",
  ".vs",
  ".idea",
  "__pycache__",
  "vendor",
]);

export class SwaggerDiscoveryService {
  private client: GitRestClient | null = null;

  private getClient(): GitRestClient {
    if (!this.client) {
      this.client = getClient(GitRestClient);
    }
    return this.client;
  }

  private async getProjectName(): Promise<string> {
    const projectService = await SDK.getService<IProjectPageService>(
      CommonServiceIds.ProjectPageService
    );
    const project = await projectService.getProject();
    if (!project) throw new Error("Unable to determine current project.");
    return project.name;
  }

  /**
   * Scan all Git repositories in the current project for Swagger/OpenAPI spec files.
   */
  async discoverApis(signal?: AbortSignal): Promise<DiscoveredApi[]> {
    const project = await this.getProjectName();
    const repos = await this.getClient().getRepositories(project);

    if (signal?.aborted) return [];

    const discovered: DiscoveredApi[] = [];

    for (const repo of repos) {
      if (signal?.aborted) break;
      if (repo.isDisabled) continue;

      try {
        const branch = repo.defaultBranch?.replace("refs/heads/", "") ?? "main";
        const items = await this.getRepoItems(repo, project);

        for (const item of items) {
          if (!item.path || item.isFolder) continue;
          if (this.isInSkippedDir(item.path)) continue;
          if (this.isSpecFile(item.path)) {
            discovered.push({
              repoName: repo.name,
              repoId: repo.id,
              filePath: item.path,
              branch,
              rawUrl: this.buildRawUrl(repo, item.path, branch),
              suggestedName: this.deriveName(repo.name, item.path),
            });
          }
        }
      } catch {
        // Skip repos we can't read (permissions, empty repos, etc.)
      }
    }

    return discovered;
  }

  private async getRepoItems(repo: GitRepository, project: string): Promise<GitItem[]> {
    try {
      return await this.getClient().getItems(
        repo.id,
        project,
        "/",
        VersionControlRecursionType.Full,
        true // includeContentMetadata
      );
    } catch {
      return [];
    }
  }

  private isSpecFile(path: string): boolean {
    const fileName = path.split("/").pop() ?? "";
    return SPEC_PATTERNS.some((p) => p.test(fileName));
  }

  private isInSkippedDir(path: string): boolean {
    const parts = path.split("/");
    return parts.some((part) => SKIP_DIRS.has(part));
  }

  private buildRawUrl(repo: GitRepository, filePath: string, branch: string): string {
    // Azure DevOps raw file URL format:
    // {org}/{project}/_apis/git/repositories/{repoId}/items?path={filePath}&versionDescriptor.version={branch}&versionDescriptor.versionType=branch
    const baseUrl = repo.url ? repo.url.replace(/\/_apis\/git\/repositories\/.*$/, "") : "";
    return `${baseUrl}/_apis/git/repositories/${repo.id}/items?path=${encodeURIComponent(filePath)}&versionDescriptor.version=${encodeURIComponent(branch)}&versionDescriptor.versionType=branch&$format=octetStream`;
  }

  private deriveName(repoName: string, filePath: string): string {
    // Strip leading slash and filename
    const parts = filePath.replace(/^\//, "").split("/");
    if (parts.length <= 1) {
      return repoName;
    }
    // Use repo name + parent directory for context
    const parentDir = parts[parts.length - 2];
    if (parentDir.toLowerCase() === "wwwroot" || parentDir === ".") {
      return repoName;
    }
    return `${repoName} - ${parentDir}`;
  }
}
