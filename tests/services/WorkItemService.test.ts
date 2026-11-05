import { WorkItemService } from "@/services/WorkItemService";
import { __resetMockServices, __setMockService } from "../__mocks__/azure-devops-extension-sdk";
import { CommonServiceIds } from "../__mocks__/azure-devops-extension-api";

const realFetch = global.fetch;
const fetchMock = jest.fn();

function respond(body: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

beforeEach(() => {
  __resetMockServices();
  __setMockService(CommonServiceIds.ProjectPageService, {
    getProject: async () => ({
      name: "Contoso Web",
      collection: { uri: "https://dev.azure.com/contoso/" },
    }),
  });
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = realFetch;
});

describe("WorkItemService.createBug", () => {
  it("posts a JSON patch to the project's Bug endpoint with the bearer token", async () => {
    fetchMock.mockResolvedValue(
      respond({
        id: 9,
        _links: { html: { href: "https://dev.azure.com/contoso/_workitems/edit/9" } },
      })
    );

    const result = await new WorkItemService().createBug({
      title: "[Swagger Lint] Missing Tags: /users (GET)",
      description: "<p>body</p>",
      areaPath: "Contoso Web\\Platform",
      severity: "2 - High",
      priority: 2,
      tags: "swagger-lint",
      parentId: 42,
    });

    expect(result).toEqual({ id: 9, url: "https://dev.azure.com/contoso/_workitems/edit/9" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://dev.azure.com/contoso/Contoso%20Web/_apis/wit/workitems/$Bug?api-version=7.1"
    );
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json-patch+json");
    expect(init.headers.Authorization).toBe("Bearer mock-access-token");

    const ops = JSON.parse(init.body);
    const byPath = Object.fromEntries(ops.map((o: any) => [o.path, o.value]));
    expect(byPath["/fields/System.Title"]).toBe("[Swagger Lint] Missing Tags: /users (GET)");
    expect(byPath["/fields/System.Description"]).toBe("<p>body</p>");
    expect(byPath["/fields/System.AreaPath"]).toBe("Contoso Web\\Platform");
    expect(byPath["/fields/Microsoft.VSTS.Common.Severity"]).toBe("2 - High");
    expect(byPath["/fields/Microsoft.VSTS.Common.Priority"]).toBe(2);
    expect(byPath["/fields/System.Tags"]).toBe("swagger-lint");
    expect(byPath["/relations/-"]).toEqual({
      rel: "System.LinkTypes.Hierarchy-Reverse",
      url: "https://dev.azure.com/contoso/_apis/wit/workItems/42",
      attributes: { name: "Parent" },
    });
  });

  it("sends only title and description when nothing else is given", async () => {
    fetchMock.mockResolvedValue(
      respond({ id: 1, url: "https://dev.azure.com/contoso/_apis/wit/workItems/1" })
    );

    const result = await new WorkItemService().createBug({ title: "T", description: "D" });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).map((o: any) => o.path)).toEqual([
      "/fields/System.Title",
      "/fields/System.Description",
    ]);
    // No html link in the response: falls back to the REST url.
    expect(result.url).toBe("https://dev.azure.com/contoso/_apis/wit/workItems/1");
  });

  it("throws with the status and server text when creation fails", async () => {
    fetchMock.mockResolvedValue(
      respond("TF401320: rule error", { ok: false, status: 400, statusText: "Bad Request" })
    );
    await expect(new WorkItemService().createBug({ title: "T", description: "D" })).rejects.toThrow(
      "Failed to create work item: 400 Bad Request - TF401320: rule error"
    );
  });
});

describe("WorkItemService.getAreaPaths", () => {
  it("flattens the classification tree and drops the leading backslash", async () => {
    fetchMock.mockResolvedValue(
      respond({
        path: "\\Contoso Web\\Area",
        children: [
          {
            path: "\\Contoso Web\\Area\\Platform",
            children: [{ path: "\\Contoso Web\\Area\\Platform\\Api" }],
          },
        ],
      })
    );

    const paths = await new WorkItemService().getAreaPaths();

    expect(paths).toEqual([
      "Contoso Web\\Area",
      "Contoso Web\\Area\\Platform",
      "Contoso Web\\Area\\Platform\\Api",
    ]);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://dev.azure.com/contoso/Contoso%20Web/_apis/wit/classificationnodes/areas?$depth=5&api-version=7.1"
    );
  });

  it("returns an empty list when the request fails", async () => {
    fetchMock.mockResolvedValue(respond({}, { ok: false, status: 403, statusText: "Forbidden" }));
    expect(await new WorkItemService().getAreaPaths()).toEqual([]);
  });
});
