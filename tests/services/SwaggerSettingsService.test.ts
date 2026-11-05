import { SwaggerSettingsService } from "@/services/SwaggerSettingsService";
import { __setMockService, __resetMockServices } from "../__mocks__/azure-devops-extension-sdk";
import { CommonServiceIds } from "../__mocks__/azure-devops-extension-api";
import { Severity, ApiVisibility, ApiPublishStatus } from "@/models/interfaces";

describe("SwaggerSettingsService", () => {
  let service: SwaggerSettingsService;
  let mockDocuments: Record<string, any>;
  let mockDataManager: any;

  beforeEach(() => {
    __resetMockServices();
    mockDocuments = {};
    service = new SwaggerSettingsService();

    mockDataManager = {
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

  // ===== Global Settings =====

  describe("getGlobalSettings", () => {
    it("seeds default settings when none exist", async () => {
      const result = await service.getGlobalSettings();
      expect(result.apiKey).toBe("");
      expect(result.authHeaderName).toBe("X-API-Key");
      expect(result.autoScanOnLoad).toBe(true);
      expect(result.refreshIntervalMinutes).toBe(5);
    });

    it("returns existing settings", async () => {
      mockDocuments["global-settings"] = {
        id: "global-settings",
        apiKey: "test-key",
        authHeaderName: "Authorization",
        autoScanOnLoad: true,
        version: 1,
      };
      const result = await service.getGlobalSettings();
      expect(result.apiKey).toBe("test-key");
      expect(result.authHeaderName).toBe("Authorization");
    });
  });

  describe("saveGlobalSettings", () => {
    it("updates the API key", async () => {
      const result = await service.saveGlobalSettings({ apiKey: "new-key" });
      expect(result.apiKey).toBe("new-key");
    });

    it("preserves unchanged fields", async () => {
      await service.saveGlobalSettings({ apiKey: "my-key" });
      const result = await service.saveGlobalSettings({ autoScanOnLoad: true });
      expect(result.apiKey).toBe("my-key");
      expect(result.autoScanOnLoad).toBe(true);
    });
  });

  // ===== Swagger APIs =====

  describe("getSwaggerApis", () => {
    it("seeds empty list when none exist", async () => {
      const result = await service.getSwaggerApis();
      expect(result.apis).toEqual([]);
    });
  });

  describe("addSwaggerApi", () => {
    it("adds a new API", async () => {
      const result = await service.addSwaggerApi({
        id: "api-1",
        name: "Test API",
        url: "https://api.example.com/swagger.json",
        addedAt: "2026-01-01",
        addedBy: "user-1",
        visibility: ApiVisibility.Private,
        publishStatus: ApiPublishStatus.Unpublished,
      });
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].name).toBe("Test API");
      expect(result.apis[0].visibility).toBe(ApiVisibility.Private);
      expect(result.apis[0].publishStatus).toBe(ApiPublishStatus.Unpublished);
    });

    it("rejects duplicate URLs", async () => {
      await service.addSwaggerApi({
        id: "api-1",
        name: "Test API",
        url: "https://api.example.com/swagger.json",
        addedAt: "2026-01-01",
        addedBy: "user-1",
        visibility: ApiVisibility.Private,
        publishStatus: ApiPublishStatus.Unpublished,
      });
      await expect(
        service.addSwaggerApi({
          id: "api-2",
          name: "Duplicate",
          url: "https://api.example.com/swagger.json",
          addedAt: "2026-01-01",
          addedBy: "user-1",
          visibility: ApiVisibility.Private,
          publishStatus: ApiPublishStatus.Unpublished,
        })
      ).rejects.toThrow("already exists");
    });
  });

  describe("removeSwaggerApi", () => {
    it("removes an existing API", async () => {
      await service.addSwaggerApi({
        id: "api-1",
        name: "Test API",
        url: "https://api.example.com/swagger.json",
        addedAt: "2026-01-01",
        addedBy: "user-1",
        visibility: ApiVisibility.Private,
        publishStatus: ApiPublishStatus.Unpublished,
      });
      const result = await service.removeSwaggerApi("api-1");
      expect(result.apis).toHaveLength(0);
    });

    it("throws for non-existent API", async () => {
      await expect(service.removeSwaggerApi("nonexistent")).rejects.toThrow("not found");
    });
  });

  describe("updateSwaggerApi", () => {
    it("updates API metadata", async () => {
      await service.addSwaggerApi({
        id: "api-1",
        name: "Test API",
        url: "https://api.example.com/swagger.json",
        addedAt: "2026-01-01",
        addedBy: "user-1",
        visibility: ApiVisibility.Private,
        publishStatus: ApiPublishStatus.Unpublished,
      });
      const result = await service.updateSwaggerApi("api-1", {
        lastScannedAt: "2026-03-06",
        lastFindingCount: 5,
        lastEndpointCount: 20,
      });
      expect(result.apis[0].lastScannedAt).toBe("2026-03-06");
      expect(result.apis[0].lastFindingCount).toBe(5);
    });

    it("updates visibility and publish status", async () => {
      await service.addSwaggerApi({
        id: "api-1",
        name: "Test API",
        url: "https://api.example.com/swagger.json",
        addedAt: "2026-01-01",
        addedBy: "user-1",
        visibility: ApiVisibility.Private,
        publishStatus: ApiPublishStatus.Unpublished,
      });
      const result = await service.updateSwaggerApi("api-1", {
        visibility: ApiVisibility.Public,
        publishStatus: ApiPublishStatus.Published,
      });
      expect(result.apis[0].visibility).toBe(ApiVisibility.Public);
      expect(result.apis[0].publishStatus).toBe(ApiPublishStatus.Published);
    });

    it("updates API name", async () => {
      await service.addSwaggerApi({
        id: "api-1",
        name: "Old Name",
        url: "https://api.example.com/swagger.json",
        addedAt: "2026-01-01",
        addedBy: "user-1",
        visibility: ApiVisibility.Private,
        publishStatus: ApiPublishStatus.Unpublished,
      });
      const result = await service.updateSwaggerApi("api-1", { name: "New Name" });
      expect(result.apis[0].name).toBe("New Name");
    });
  });

  // ===== Lint Overrides =====

  describe("getLintOverrides", () => {
    it("seeds empty overrides when none exist", async () => {
      const result = await service.getLintOverrides();
      expect(result.overrides).toEqual([]);
    });
  });

  describe("saveLintOverrides", () => {
    it("saves overrides", async () => {
      const result = await service.saveLintOverrides([
        { ruleId: "naming-camelcase-params", enabled: false },
        { ruleId: "rest-versioning", enabled: true, severity: Severity.Critical },
      ]);
      expect(result.overrides).toHaveLength(2);
      expect(result.overrides[0].ruleId).toBe("naming-camelcase-params");
    });

    it("replaces existing overrides", async () => {
      await service.saveLintOverrides([{ ruleId: "naming-camelcase-params", enabled: false }]);
      const result = await service.saveLintOverrides([
        { ruleId: "rest-versioning", enabled: true },
      ]);
      expect(result.overrides).toHaveLength(1);
      expect(result.overrides[0].ruleId).toBe("rest-versioning");
    });
  });

  describe("when a read fails", () => {
    const offline = {
      name: "NetworkException",
      message: "TF400893: Unable to contact the server.",
    };
    const stored = {
      id: "swagger-apis",
      apis: [
        {
          id: "api-1",
          name: "Stored API",
          url: "https://api.example.com/swagger.json",
          addedAt: "2026-01-01",
          addedBy: "user-1",
          visibility: ApiVisibility.Private,
          publishStatus: ApiPublishStatus.Unpublished,
        },
      ],
      version: 1,
    };

    it("does not re-seed global settings over the stored ones", async () => {
      mockDocuments["global-settings"] = { id: "global-settings", apiKey: "kept", version: 1 };
      mockDataManager.getDocument.mockRejectedValueOnce(offline);
      await expect(service.getGlobalSettings()).rejects.toMatchObject(offline);
      expect(mockDataManager.setDocument).not.toHaveBeenCalled();
      expect(mockDocuments["global-settings"].apiKey).toBe("kept");
    });

    it("does not wipe the stored API list on read", async () => {
      mockDocuments["swagger-apis"] = stored;
      mockDataManager.getDocument.mockRejectedValueOnce(offline);
      await expect(service.getSwaggerApis()).rejects.toMatchObject(offline);
      expect(mockDataManager.setDocument).not.toHaveBeenCalled();
    });

    it("does not wipe the stored API list when adding one", async () => {
      mockDocuments["swagger-apis"] = stored;
      mockDataManager.getDocument.mockRejectedValueOnce(offline);
      await expect(
        service.addSwaggerApi({ ...stored.apis[0], id: "api-2", url: "https://b.example.com/" })
      ).rejects.toMatchObject(offline);
      expect(mockDocuments["swagger-apis"].apis).toHaveLength(1);
      expect(mockDataManager.setDocument).not.toHaveBeenCalled();
    });

    it("still seeds defaults on a genuine first run (404)", async () => {
      const result = await service.getSwaggerApis();
      expect(result.apis).toEqual([]);
      expect(mockDataManager.setDocument).toHaveBeenCalledTimes(1);
    });
  });
});
