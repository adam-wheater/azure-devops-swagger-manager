import { SwaggerDiscoveryService } from "@/services/SwaggerDiscoveryService";
import { __resetMockServices, __setMockService } from "../__mocks__/azure-devops-extension-sdk";
import {
  CommonServiceIds,
  __resetMockClients,
  __setMockClient,
} from "../__mocks__/azure-devops-extension-api";

const item = (path: string, isFolder = false) => ({ path, isFolder });

function repo(name: string, extra: Record<string, unknown> = {}) {
  return {
    id: `${name}-id`,
    name,
    defaultBranch: "refs/heads/main",
    url: `https://dev.azure.com/contoso/proj-id/_apis/git/repositories/${name}-id`,
    ...extra,
  };
}

function useRepos(repos: any[], itemsByRepo: Record<string, any[] | Error>) {
  __setMockClient("GitRestClient", {
    getRepositories: jest.fn(async () => repos),
    getItems: jest.fn(async (repoId: string) => {
      const items = itemsByRepo[repoId];
      if (items instanceof Error) throw items;
      return items ?? [];
    }),
  });
}

beforeEach(() => {
  __resetMockServices();
  __resetMockClients();
  __setMockService(CommonServiceIds.ProjectPageService, {
    getProject: async () => ({ name: "Contoso Web" }),
  });
});

describe("SwaggerDiscoveryService.discoverApis", () => {
  it("finds swagger and openapi files in json, yaml and yml", async () => {
    useRepos([repo("orders")], {
      "orders-id": [
        item("/docs/swagger.json"),
        item("/docs/openapi.yaml"),
        item("/specs/open-api-v2.yml"),
        item("/specs/open_api.json"),
        item("/src/Program.cs"),
        item("/docs/readme.md"),
        item("/docs/swagger.txt"),
        item("/docs", true),
      ],
    });

    const found = await new SwaggerDiscoveryService().discoverApis();

    expect(found.map((f) => f.filePath).sort()).toEqual([
      "/docs/openapi.yaml",
      "/docs/swagger.json",
      "/specs/open-api-v2.yml",
      "/specs/open_api.json",
    ]);
  });

  it("skips vendored and build folders", async () => {
    useRepos([repo("orders")], {
      "orders-id": [
        item("/node_modules/pkg/swagger.json"),
        item("/bin/Debug/openapi.json"),
        item("/vendor/lib/swagger.yaml"),
        item("/api/swagger.json"),
      ],
    });

    const found = await new SwaggerDiscoveryService().discoverApis();

    expect(found.map((f) => f.filePath)).toEqual(["/api/swagger.json"]);
  });

  it("builds an Azure DevOps items URL on the default branch and a readable name", async () => {
    useRepos([repo("orders")], {
      "orders-id": [
        item("/swagger.json"),
        item("/docs/payments/openapi.json"),
        item("/wwwroot/swagger.json"),
      ],
    });

    const found = await new SwaggerDiscoveryService().discoverApis();
    const byPath = Object.fromEntries(found.map((f) => [f.filePath, f]));

    expect(byPath["/swagger.json"].suggestedName).toBe("orders");
    expect(byPath["/docs/payments/openapi.json"].suggestedName).toBe("orders - payments");
    expect(byPath["/wwwroot/swagger.json"].suggestedName).toBe("orders");
    expect(byPath["/swagger.json"].branch).toBe("main");
    expect(byPath["/swagger.json"].rawUrl).toBe(
      "https://dev.azure.com/contoso/proj-id/_apis/git/repositories/orders-id/items" +
        "?path=%2Fswagger.json&versionDescriptor.version=main&versionDescriptor.versionType=branch&$format=octetStream"
    );
  });

  it("skips disabled repositories and repositories that cannot be read", async () => {
    useRepos([repo("off", { isDisabled: true }), repo("locked"), repo("ok")], {
      "off-id": [item("/swagger.json")],
      "locked-id": new Error("TF401019: no access"),
      "ok-id": [item("/openapi.json")],
    });

    const found = await new SwaggerDiscoveryService().discoverApis();

    expect(found.map((f) => f.repoName)).toEqual(["ok"]);
  });

  it("returns nothing when already aborted", async () => {
    useRepos([repo("orders")], { "orders-id": [item("/swagger.json")] });
    const controller = new AbortController();
    controller.abort();

    expect(await new SwaggerDiscoveryService().discoverApis(controller.signal)).toEqual([]);
  });

  it("fails clearly when the project cannot be determined", async () => {
    __setMockService(CommonServiceIds.ProjectPageService, { getProject: async () => undefined });
    useRepos([], {});

    await expect(new SwaggerDiscoveryService().discoverApis()).rejects.toThrow(
      "Unable to determine current project."
    );
  });
});
