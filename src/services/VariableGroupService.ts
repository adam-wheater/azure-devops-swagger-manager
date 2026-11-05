import * as SDK from "azure-devops-extension-sdk";
import { getClient } from "azure-devops-extension-api";
import { TaskAgentRestClient, VariableGroup } from "azure-devops-extension-api/TaskAgent";
import { CommonServiceIds, IProjectPageService } from "azure-devops-extension-api";

export interface VariableGroupSummary {
  id: number;
  name: string;
  variableNames: string[];
}

export class VariableGroupService {
  private client: TaskAgentRestClient | null = null;

  private getClient(): TaskAgentRestClient {
    if (!this.client) {
      this.client = getClient(TaskAgentRestClient);
    }
    return this.client;
  }

  async getProjectName(): Promise<string> {
    const projectService = await SDK.getService<IProjectPageService>(
      CommonServiceIds.ProjectPageService
    );
    const project = await projectService.getProject();
    if (!project) throw new Error("Unable to determine current project.");
    return project.name;
  }

  /** List all variable groups in the current project (id, name, variable names). */
  async listVariableGroups(): Promise<VariableGroupSummary[]> {
    const project = await this.getProjectName();
    const groups: VariableGroup[] = await this.getClient().getVariableGroups(project);

    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      variableNames: g.variables ? Object.keys(g.variables) : [],
    }));
  }

  /**
   * Fetch the value of a specific variable from a variable group.
   * Returns `undefined` if the variable is secret (value is null) or not found.
   */
  async getVariableValue(groupId: number, variableName: string): Promise<string | undefined> {
    const project = await this.getProjectName();
    const group: VariableGroup = await this.getClient().getVariableGroup(project, groupId);

    if (!group || !group.variables) return undefined;

    const variable = group.variables[variableName];
    if (!variable) return undefined;

    // Secret variables have null/undefined value — cannot be read via API
    return variable.value ?? undefined;
  }
}
