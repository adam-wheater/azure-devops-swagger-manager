import * as React from "react";
import { render, act } from "@testing-library/react";
import { useAdmin } from "@/hooks/useAdmin";
import { __setMockService, __resetMockServices } from "../__mocks__/azure-devops-extension-sdk";
import { CommonServiceIds } from "../__mocks__/azure-devops-extension-api";

// Test component that exposes hook state
const TestComponent: React.FC<{ onState: (state: ReturnType<typeof useAdmin>) => void }> = ({
  onState,
}) => {
  const state = useAdmin();
  React.useEffect(() => {
    onState(state);
  });
  return (
    <div>
      <span data-testid="loading">{String(state.loading)}</span>
      <span data-testid="isAdmin">{String(state.isAdmin)}</span>
      <span data-testid="isUnclaimed">{String(state.isUnclaimed)}</span>
      <span data-testid="error">{state.error ?? "none"}</span>
      <span data-testid="userId">{state.currentUserId}</span>
    </div>
  );
};

describe("useAdmin hook", () => {
  let mockDocuments: Record<string, any>;
  let mockDataManager: any;

  beforeEach(() => {
    __resetMockServices();
    mockDocuments = {};

    mockDataManager = {
      getDocument: jest.fn((_collection: string, id: string) => {
        if (mockDocuments[id]) return Promise.resolve(mockDocuments[id]);
        return Promise.reject({ status: 404, message: "Document not found" });
      }),
      setDocument: jest.fn((_collection: string, doc: any) => {
        mockDocuments[doc.id] = doc;
        return Promise.resolve(doc);
      }),
      createDocument: jest.fn((_collection: string, doc: any) => {
        if (mockDocuments[doc.id]) {
          return Promise.reject({ status: 409, message: "Document already exists" });
        }
        mockDocuments[doc.id] = doc;
        return Promise.resolve(doc);
      }),
    };

    const mockDataService = {
      getExtensionDataManager: jest.fn(() => Promise.resolve(mockDataManager)),
    };

    __setMockService(CommonServiceIds.ExtensionDataService, mockDataService);
  });

  it("starts in loading state", async () => {
    let latestState: ReturnType<typeof useAdmin> | undefined;
    await act(async () => {
      render(
        <TestComponent
          onState={(s) => {
            latestState = s;
          }}
        />
      );
    });
    // After initial render + effect, loading should be false
    expect(latestState).toBeDefined();
    expect(latestState!.loading).toBe(false);
  });

  it("reports unclaimed when no admin doc exists", async () => {
    let latestState: ReturnType<typeof useAdmin> | undefined;
    await act(async () => {
      render(
        <TestComponent
          onState={(s) => {
            latestState = s;
          }}
        />
      );
    });
    expect(latestState!.isUnclaimed).toBe(true);
    expect(latestState!.isAdmin).toBe(false);
  });

  it("reports admin when user is in admin list", async () => {
    mockDocuments["admin"] = {
      id: "admin",
      claimedBy: "mock-user-id",
      claimedAt: "2026-01-01T00:00:00Z",
      admins: [
        {
          userId: "mock-user-id",
          displayName: "Test User",
          addedAt: "2026-01-01T00:00:00Z",
          addedBy: "mock-user-id",
        },
      ],
      version: 1,
    };

    let latestState: ReturnType<typeof useAdmin> | undefined;
    await act(async () => {
      render(
        <TestComponent
          onState={(s) => {
            latestState = s;
          }}
        />
      );
    });
    expect(latestState!.isAdmin).toBe(true);
    expect(latestState!.isUnclaimed).toBe(false);
  });

  it("gets current user info from SDK", async () => {
    let latestState: ReturnType<typeof useAdmin> | undefined;
    await act(async () => {
      render(
        <TestComponent
          onState={(s) => {
            latestState = s;
          }}
        />
      );
    });
    expect(latestState!.currentUserId).toBe("mock-user-id");
    expect(latestState!.currentUserName).toBe("Test User");
  });

  it("does not offer the claim page when the admin read fails", async () => {
    mockDataManager.getDocument.mockRejectedValueOnce({
      name: "NetworkException",
      message: "TF400893: Unable to contact the server.",
    });
    let latestState: ReturnType<typeof useAdmin> | undefined;
    await act(async () => {
      render(
        <TestComponent
          onState={(s) => {
            latestState = s;
          }}
        />
      );
    });
    expect(latestState!.isUnclaimed).toBe(false);
    expect(latestState!.isAdmin).toBe(false);
    expect(latestState!.error).toMatch(/Unable to contact the server/);
  });
});
