import { AdminService } from "@/services/AdminService";
import { __setMockService, __resetMockServices } from "../__mocks__/azure-devops-extension-sdk";
import { CommonServiceIds } from "../__mocks__/azure-devops-extension-api";

describe("AdminService", () => {
  let service: AdminService;
  let mockDocuments: Record<string, any>;
  let mockDataManager: any;

  beforeEach(() => {
    __resetMockServices();
    mockDocuments = {};
    service = new AdminService();

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

  describe("getAdminDocument", () => {
    it("returns null when no admin exists", async () => {
      const result = await service.getAdminDocument();
      expect(result).toBeNull();
    });

    it("returns existing admin document", async () => {
      mockDocuments["admin"] = {
        id: "admin",
        claimedBy: "user-1",
        claimedAt: "2026-01-01T00:00:00.000Z",
        admins: [
          { userId: "user-1", displayName: "Admin", addedAt: "2026-01-01", addedBy: "user-1" },
        ],
        version: 1,
      };
      const result = await service.getAdminDocument();
      expect(result).not.toBeNull();
      expect(result!.claimedBy).toBe("user-1");
    });
  });

  describe("claimAdmin", () => {
    it("creates admin document for first claim", async () => {
      const result = await service.claimAdmin("user-1", "Admin User");
      expect(result.claimedBy).toBe("user-1");
      expect(result.admins).toHaveLength(1);
      expect(result.admins[0].userId).toBe("user-1");
      expect(result.admins[0].displayName).toBe("Admin User");
    });

    it("rejects claim when admin already exists", async () => {
      mockDocuments["admin"] = {
        id: "admin",
        claimedBy: "user-1",
        claimedAt: "2026-01-01T00:00:00.000Z",
        admins: [
          { userId: "user-1", displayName: "Admin", addedAt: "2026-01-01", addedBy: "user-1" },
        ],
        version: 1,
      };
      await expect(service.claimAdmin("user-2", "Other User")).rejects.toThrow(
        "Admin has already been claimed"
      );
    });
  });

  describe("addAdmin", () => {
    it("adds a new admin", async () => {
      await service.claimAdmin("user-1", "Admin User");
      const result = await service.addAdmin({
        userId: "user-2",
        displayName: "Second Admin",
        addedAt: new Date().toISOString(),
        addedBy: "user-1",
      });
      expect(result.admins).toHaveLength(2);
      expect(result.admins[1].userId).toBe("user-2");
    });

    it("rejects duplicate admin", async () => {
      await service.claimAdmin("user-1", "Admin User");
      await expect(
        service.addAdmin({
          userId: "user-1",
          displayName: "Admin User",
          addedAt: new Date().toISOString(),
          addedBy: "user-1",
        })
      ).rejects.toThrow("already an admin");
    });
  });

  describe("removeAdmin", () => {
    it("removes a non-owner admin", async () => {
      await service.claimAdmin("user-1", "Admin User");
      await service.addAdmin({
        userId: "user-2",
        displayName: "Second Admin",
        addedAt: new Date().toISOString(),
        addedBy: "user-1",
      });
      const result = await service.removeAdmin("user-2");
      expect(result.admins).toHaveLength(1);
    });

    it("prevents removing the original owner", async () => {
      await service.claimAdmin("user-1", "Admin User");
      await expect(service.removeAdmin("user-1")).rejects.toThrow(
        "Cannot remove the original admin"
      );
    });
  });

  describe("isAdmin / isUnclaimed", () => {
    it("returns false for non-admin user", async () => {
      const doc = await service.claimAdmin("user-1", "Admin User");
      expect(service.isAdmin(doc, "user-2")).toBe(false);
    });

    it("returns true for admin user", async () => {
      const doc = await service.claimAdmin("user-1", "Admin User");
      expect(service.isAdmin(doc, "user-1")).toBe(true);
    });

    it("isUnclaimed returns true for null", () => {
      expect(service.isUnclaimed(null)).toBe(true);
    });

    it("isUnclaimed returns false for existing doc", async () => {
      const doc = await service.claimAdmin("user-1", "Admin User");
      expect(service.isUnclaimed(doc)).toBe(false);
    });
  });

  describe("when a read fails", () => {
    it("rethrows a network failure instead of reporting unclaimed", async () => {
      mockDataManager.getDocument.mockRejectedValueOnce({
        name: "NetworkException",
        message: "TF400893: Unable to contact the server.",
      });
      await expect(service.getAdminDocument()).rejects.toMatchObject({ name: "NetworkException" });
    });

    it("never overwrites a stored admin list, even after a stale 'not found' read", async () => {
      mockDocuments["admin"] = {
        id: "admin",
        claimedBy: "user-1",
        claimedAt: "2026-01-01T00:00:00.000Z",
        admins: [
          { userId: "user-1", displayName: "Admin", addedAt: "2026-01-01", addedBy: "user-1" },
        ],
        version: 1,
      };
      mockDataManager.getDocument.mockRejectedValueOnce({ status: 404, message: "stale" });

      await expect(service.claimAdmin("user-2", "Someone Else")).rejects.toThrow(
        "already been claimed"
      );
      expect(mockDocuments["admin"].claimedBy).toBe("user-1");
      expect(mockDataManager.setDocument).not.toHaveBeenCalled();
    });
  });
});
