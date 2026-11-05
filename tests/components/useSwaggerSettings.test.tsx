import * as React from "react";
import { render, act } from "@testing-library/react";
import { useSwaggerSettings } from "@/hooks/useSwaggerSettings";
import { __setMockService, __resetMockServices } from "../__mocks__/azure-devops-extension-sdk";
import { CommonServiceIds } from "../__mocks__/azure-devops-extension-api";

const TestComponent: React.FC<{
  onState: (state: ReturnType<typeof useSwaggerSettings>) => void;
}> = ({ onState }) => {
  const state = useSwaggerSettings();
  React.useEffect(() => {
    onState(state);
  });
  return (
    <div>
      <span data-testid="loading">{String(state.loading)}</span>
      <span data-testid="apiCount">{state.apis.length}</span>
      <span data-testid="overrideCount">{state.lintOverrides.length}</span>
    </div>
  );
};

describe("useSwaggerSettings hook", () => {
  let mockDocuments: Record<string, any>;

  beforeEach(() => {
    __resetMockServices();
    mockDocuments = {};

    const mockDataManager = {
      getDocument: jest.fn((_collection: string, id: string) => {
        if (mockDocuments[id]) return Promise.resolve(mockDocuments[id]);
        return Promise.reject({ status: 404, message: "Document not found" });
      }),
      setDocument: jest.fn((_collection: string, doc: any) => {
        mockDocuments[doc.id] = doc;
        return Promise.resolve(doc);
      }),
    };

    const mockDataService = {
      getExtensionDataManager: jest.fn(() => Promise.resolve(mockDataManager)),
    };

    __setMockService(CommonServiceIds.ExtensionDataService, mockDataService);
  });

  it("initialises with empty apis and overrides", async () => {
    let latestState: ReturnType<typeof useSwaggerSettings> | undefined;
    await act(async () => {
      render(
        <TestComponent
          onState={(s) => {
            latestState = s;
          }}
        />
      );
    });
    expect(latestState!.loading).toBe(false);
    expect(latestState!.apis).toEqual([]);
    expect(latestState!.lintOverrides).toEqual([]);
  });

  it("loads existing global settings", async () => {
    mockDocuments["global-settings"] = {
      id: "global-settings",
      apiKey: "my-key",
      authHeaderName: "Authorization",
      autoScanOnLoad: true,
      version: 1,
    };

    let latestState: ReturnType<typeof useSwaggerSettings> | undefined;
    await act(async () => {
      render(
        <TestComponent
          onState={(s) => {
            latestState = s;
          }}
        />
      );
    });
    expect(latestState!.globalSettings?.apiKey).toBe("my-key");
    expect(latestState!.globalSettings?.authHeaderName).toBe("Authorization");
  });

  it("loads existing APIs", async () => {
    mockDocuments["swagger-apis"] = {
      id: "swagger-apis",
      apis: [
        {
          id: "api-1",
          name: "Test API",
          url: "https://example.com/swagger.json",
          addedAt: "2026-01-01",
          addedBy: "user-1",
          visibility: "private",
          publishStatus: "unpublished",
        },
      ],
      version: 1,
    };

    let latestState: ReturnType<typeof useSwaggerSettings> | undefined;
    await act(async () => {
      render(
        <TestComponent
          onState={(s) => {
            latestState = s;
          }}
        />
      );
    });
    expect(latestState!.apis).toHaveLength(1);
    expect(latestState!.apis[0].name).toBe("Test API");
  });

  it("loads existing lint overrides", async () => {
    mockDocuments["lint-rule-overrides"] = {
      id: "lint-rule-overrides",
      overrides: [{ ruleId: "naming-camelcase-params", enabled: false }],
      version: 1,
    };

    let latestState: ReturnType<typeof useSwaggerSettings> | undefined;
    await act(async () => {
      render(
        <TestComponent
          onState={(s) => {
            latestState = s;
          }}
        />
      );
    });
    expect(latestState!.lintOverrides).toHaveLength(1);
    expect(latestState!.lintOverrides[0].ruleId).toBe("naming-camelcase-params");
  });

  it("provides addApi callback", async () => {
    let latestState: ReturnType<typeof useSwaggerSettings> | undefined;
    await act(async () => {
      render(
        <TestComponent
          onState={(s) => {
            latestState = s;
          }}
        />
      );
    });
    expect(typeof latestState!.addApi).toBe("function");
  });

  it("provides removeApi callback", async () => {
    let latestState: ReturnType<typeof useSwaggerSettings> | undefined;
    await act(async () => {
      render(
        <TestComponent
          onState={(s) => {
            latestState = s;
          }}
        />
      );
    });
    expect(typeof latestState!.removeApi).toBe("function");
  });

  it("provides saveLintOverrides callback", async () => {
    let latestState: ReturnType<typeof useSwaggerSettings> | undefined;
    await act(async () => {
      render(
        <TestComponent
          onState={(s) => {
            latestState = s;
          }}
        />
      );
    });
    expect(typeof latestState!.saveLintOverrides).toBe("function");
  });
});
