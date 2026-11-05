const mockClients: Record<string, any> = {};

export const CommonServiceIds = {
  ProjectPageService: "ms.vss-tfs-web.tfs-page-data-service",
  ExtensionDataService: "ms.vss-features.extension-data-service",
};

export interface IExtensionDataService {
  getExtensionDataManager(extensionId: string, accessToken: string): Promise<IExtensionDataManager>;
}

export interface IExtensionDataManager {
  getDocument(collectionName: string, id: string): Promise<any>;
  setDocument(collectionName: string, doc: any): Promise<any>;
}

export function getClient(clientClass: any): any {
  if (!clientClass) return {};
  const name = clientClass._mockName || clientClass.name || "unknown";
  if (!mockClients[name]) {
    mockClients[name] = {};
  }
  return mockClients[name];
}

export function __setMockClient(name: string, client: any): void {
  mockClients[name] = client;
}

export function __resetMockClients(): void {
  for (const key of Object.keys(mockClients)) {
    delete mockClients[key];
  }
}

// Stub class so getClient(TaskAgentRestClient) resolves to the right mock bucket
export class TaskAgentRestClient {
  static _mockName = "TaskAgentRestClient";
}

// Stub classes so getClient(GitRestClient) resolves to the right mock bucket
export class GitRestClient {
  static _mockName = "GitRestClient";
}

export const VersionControlRecursionType = { None: 0, OneLevel: 1, Full: 120 };
