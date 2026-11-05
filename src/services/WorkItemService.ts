import * as SDK from "azure-devops-extension-sdk";

interface JsonPatchOperation {
  op: string;
  path: string;
  value: any;
}

export interface CreateBugParams {
  title: string;
  description: string;
  areaPath?: string;
  parentId?: number;
  severity?: string;
  priority?: number;
  tags?: string;
}

export interface CreatedWorkItem {
  id: number;
  url: string;
}

export class WorkItemService {
  async getProjectName(): Promise<string> {
    const projectService = await SDK.getService<any>("ms.vss-tfs-web.tfs-page-data-service");
    const projectInfo = await projectService.getProject();
    return projectInfo.name;
  }

  async createBug(params: CreateBugParams): Promise<CreatedWorkItem> {
    const project = await this.getProjectName();
    const accessToken = await SDK.getAccessToken();

    const hostUrl = await this.getHostUrl();

    const patchDocument: JsonPatchOperation[] = [
      {
        op: "add",
        path: "/fields/System.Title",
        value: params.title,
      },
      {
        op: "add",
        path: "/fields/System.Description",
        value: params.description,
      },
    ];

    if (params.areaPath) {
      patchDocument.push({
        op: "add",
        path: "/fields/System.AreaPath",
        value: params.areaPath,
      });
    }

    if (params.severity) {
      patchDocument.push({
        op: "add",
        path: "/fields/Microsoft.VSTS.Common.Severity",
        value: params.severity,
      });
    }

    if (params.priority) {
      patchDocument.push({
        op: "add",
        path: "/fields/Microsoft.VSTS.Common.Priority",
        value: params.priority,
      });
    }

    if (params.tags) {
      patchDocument.push({
        op: "add",
        path: "/fields/System.Tags",
        value: params.tags,
      });
    }

    if (params.parentId) {
      patchDocument.push({
        op: "add",
        path: "/relations/-",
        value: {
          rel: "System.LinkTypes.Hierarchy-Reverse",
          url: `${hostUrl}/_apis/wit/workItems/${params.parentId}`,
          attributes: { name: "Parent" },
        },
      });
    }

    const apiUrl = `${hostUrl}/${encodeURIComponent(project)}/_apis/wit/workitems/$Bug?api-version=7.1`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json-patch+json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(patchDocument),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to create work item: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const result = await response.json();
    return {
      id: result.id,
      url: result._links?.html?.href || result.url,
    };
  }

  async getAreaPaths(): Promise<string[]> {
    const project = await this.getProjectName();
    const accessToken = await SDK.getAccessToken();
    const hostUrl = await this.getHostUrl();

    const apiUrl = `${hostUrl}/${encodeURIComponent(project)}/_apis/wit/classificationnodes/areas?$depth=5&api-version=7.1`;

    const response = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) return [];

    const result = await response.json();
    const paths: string[] = [];
    this.collectAreaPaths(result, paths);
    return paths;
  }

  private collectAreaPaths(node: any, paths: string[]): void {
    if (node.path) {
      // Convert the classification node path format to area path format
      // API returns paths like \Project\Area1\Area2, we need Project\Area1\Area2
      paths.push(node.path.replace(/^\\/, ""));
    }
    if (node.children) {
      for (const child of node.children) {
        this.collectAreaPaths(child, paths);
      }
    }
  }

  private async getHostUrl(): Promise<string> {
    try {
      // Prefer the page-context collection URI when available
      const pageService = await SDK.getService<any>("ms.vss-tfs-web.tfs-page-data-service");
      const pageData = await pageService.getProject();
      if (pageData?.collection?.uri) {
        // collection URI typically ends with '/' — strip it for consistent joining
        return pageData.collection.uri.replace(/\/+$/, "");
      }
    } catch {
      // Fall through to host-based fallback
    }

    const hostContext = SDK.getHost();
    // SDK.getHost() may expose a `uri` property in some environments
    if ((hostContext as any).uri) {
      return (hostContext as any).uri.replace(/\/+$/, "");
    }

    // Ultimate fallback – dev.azure.com
    return `https://dev.azure.com/${hostContext.name}`;
  }
}
