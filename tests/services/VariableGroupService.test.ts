import { VariableGroupService } from "@/services/VariableGroupService";
import {
  __setMockClient,
  __resetMockClients,
  CommonServiceIds,
} from "../__mocks__/azure-devops-extension-api";
import { __setMockService, __resetMockServices } from "../__mocks__/azure-devops-extension-sdk";

const MOCK_CLIENT_NAME = "TaskAgentRestClient";

function setupProjectService(projectName = "TestProject") {
  __setMockService(CommonServiceIds.ProjectPageService, {
    getProject: jest.fn(() => Promise.resolve({ name: projectName })),
  });
}

describe("VariableGroupService", () => {
  let service: VariableGroupService;
  let mockTaskAgentClient: Record<string, jest.Mock>;

  beforeEach(() => {
    __resetMockClients();
    __resetMockServices();

    mockTaskAgentClient = {
      getVariableGroups: jest.fn(),
      getVariableGroup: jest.fn(),
    };
    __setMockClient(MOCK_CLIENT_NAME, mockTaskAgentClient);
    setupProjectService();

    service = new VariableGroupService();
  });

  // ===== getProjectName =====

  describe("getProjectName", () => {
    it("returns the current project name", async () => {
      const name = await service.getProjectName();
      expect(name).toBe("TestProject");
    });

    it("throws when project is not available", async () => {
      __setMockService(CommonServiceIds.ProjectPageService, {
        getProject: jest.fn(() => Promise.resolve(null)),
      });
      await expect(service.getProjectName()).rejects.toThrow("Unable to determine current project");
    });
  });

  // ===== listVariableGroups =====

  describe("listVariableGroups", () => {
    it("returns mapped variable groups", async () => {
      mockTaskAgentClient.getVariableGroups.mockResolvedValue([
        {
          id: 1,
          name: "Group-A",
          variables: { API_KEY: { value: "abc" }, SECRET: { value: null, isSecret: true } },
        },
        {
          id: 2,
          name: "Group-B",
          variables: { DB_CONN: { value: "conn-string" } },
        },
      ]);

      const result = await service.listVariableGroups();

      expect(result).toEqual([
        { id: 1, name: "Group-A", variableNames: ["API_KEY", "SECRET"] },
        { id: 2, name: "Group-B", variableNames: ["DB_CONN"] },
      ]);
      expect(mockTaskAgentClient.getVariableGroups).toHaveBeenCalledWith("TestProject");
    });

    it("returns empty array when no groups exist", async () => {
      mockTaskAgentClient.getVariableGroups.mockResolvedValue([]);
      const result = await service.listVariableGroups();
      expect(result).toEqual([]);
    });

    it("handles groups with no variables", async () => {
      mockTaskAgentClient.getVariableGroups.mockResolvedValue([
        { id: 3, name: "Empty-Group", variables: null },
      ]);

      const result = await service.listVariableGroups();
      expect(result).toEqual([{ id: 3, name: "Empty-Group", variableNames: [] }]);
    });
  });

  // ===== getVariableValue =====

  describe("getVariableValue", () => {
    it("returns the variable value when found", async () => {
      mockTaskAgentClient.getVariableGroup.mockResolvedValue({
        id: 1,
        name: "Group-A",
        variables: { API_KEY: { value: "my-api-key" } },
      });

      const value = await service.getVariableValue(1, "API_KEY");
      expect(value).toBe("my-api-key");
      expect(mockTaskAgentClient.getVariableGroup).toHaveBeenCalledWith("TestProject", 1);
    });

    it("returns undefined for a secret variable (null value)", async () => {
      mockTaskAgentClient.getVariableGroup.mockResolvedValue({
        id: 1,
        name: "Group-A",
        variables: { SECRET_VAR: { value: null, isSecret: true } },
      });

      const value = await service.getVariableValue(1, "SECRET_VAR");
      expect(value).toBeUndefined();
    });

    it("returns undefined when variable name is not found", async () => {
      mockTaskAgentClient.getVariableGroup.mockResolvedValue({
        id: 1,
        name: "Group-A",
        variables: { OTHER_KEY: { value: "val" } },
      });

      const value = await service.getVariableValue(1, "MISSING_KEY");
      expect(value).toBeUndefined();
    });

    it("returns undefined when group has no variables", async () => {
      mockTaskAgentClient.getVariableGroup.mockResolvedValue({
        id: 1,
        name: "Group-A",
        variables: null,
      });

      const value = await service.getVariableValue(1, "ANY_KEY");
      expect(value).toBeUndefined();
    });
  });
});
