import {
  ApiPublishStatus,
  ApiScanResult,
  ApiVisibility,
  LintFinding,
  RuleCategory,
  Severity,
  SwaggerApiEntry,
} from "@/models/interfaces";

export const usersApi: SwaggerApiEntry = {
  id: "api-users",
  name: "Users API",
  url: "https://api.contoso.example/swagger/v1/swagger.json",
  addedAt: "2026-01-01T00:00:00Z",
  addedBy: "mock-user-id",
  visibility: ApiVisibility.Public,
  publishStatus: ApiPublishStatus.Published,
};

export const paymentsApi: SwaggerApiEntry = {
  id: "api-payments",
  name: "Payments API",
  url: "https://payments.fabrikam.example/openapi.yaml",
  addedAt: "2026-01-02T00:00:00Z",
  addedBy: "mock-user-id",
  visibility: ApiVisibility.Private,
  publishStatus: ApiPublishStatus.Unpublished,
};

export const verbFinding: LintFinding = {
  ruleId: "naming-no-verbs-in-paths",
  ruleName: "No Verbs in Paths",
  category: RuleCategory.Naming,
  severity: Severity.High,
  path: "/users/getAll",
  method: "GET",
  message: 'Path segment "getAll" contains a verb.',
  suggestion: "Use GET /users instead.",
};

export const docsFinding: LintFinding = {
  ruleId: "docs-missing-tags",
  ruleName: "Missing Tags",
  category: RuleCategory.Documentation,
  severity: Severity.Low,
  path: "/users/{id}",
  method: "DELETE",
  message: "Operation has no tags.",
};

export const globalFinding: LintFinding = {
  ruleId: "policy-missing-api-description",
  ruleName: "Missing API Description",
  category: RuleCategory.Policy,
  severity: Severity.Critical,
  path: "(global)",
  message: "The API has no description.",
};

export function makeScanResult(
  api: SwaggerApiEntry = usersApi,
  findings: LintFinding[] = [verbFinding, docsFinding, globalFinding]
): ApiScanResult {
  return {
    api,
    findings,
    endpointCount: 3,
    scannedAt: new Date("2026-03-08T09:14:00Z"),
    spec: {
      openapi: "3.0.1",
      info: { title: "Users Service", version: "1.2.0", description: "Manages user accounts." },
      paths: {
        "/users/getAll": {
          get: {
            operationId: "getAllUsers",
            summary: "List users",
            tags: ["users"],
            parameters: [{ name: "page", in: "query", required: true, description: "Page number" }],
            responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
          },
        },
        "/users/{id}": {
          delete: { summary: "Delete a user", responses: { "204": { description: "Gone" } } },
        },
      },
      components: { schemas: { User: { type: "object" } } },
    },
  };
}
