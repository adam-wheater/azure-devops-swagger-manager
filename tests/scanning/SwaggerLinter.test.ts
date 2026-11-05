import { SwaggerLinter } from "@/scanning/SwaggerLinter";
import {
  OpenApiSpec,
  Severity,
  RuleCategory,
  SwaggerApiEntry,
  ApiVisibility,
  ApiPublishStatus,
} from "@/models/interfaces";

function makeSpec(paths: Record<string, any>, extras?: Partial<OpenApiSpec>): OpenApiSpec {
  return {
    openapi: "3.0.0",
    info: { title: "Test API", version: "1.0.0" },
    paths,
    ...extras,
  };
}

describe("SwaggerLinter", () => {
  let linter: SwaggerLinter;

  beforeEach(() => {
    linter = new SwaggerLinter();
  });

  // ===== UNRESOLVED REFERENCES =====

  describe("$ref parameters", () => {
    const refSpec = () =>
      makeSpec({
        "/users": {
          get: {
            summary: "List users",
            tags: ["users"],
            parameters: [{ $ref: "#/components/parameters/Page" }],
            responses: { "200": { description: "A page of users" } },
          },
        },
      });

    it("does not crash on a $ref parameter", () => {
      expect(() => linter.lint(refSpec(), [])).not.toThrow();
    });

    it("does not report a $ref parameter as undocumented", () => {
      const findings = linter.lint(refSpec(), []);
      expect(findings.some((f) => f.ruleId === "docs-missing-parameter-description")).toBe(false);
    });
  });

  // ===== NAMING RULES =====

  describe("naming-camelcase-params", () => {
    it("flags non-camelCase path parameters", () => {
      const spec = makeSpec({
        "/users/{User_Id}": { get: { responses: { "200": { description: "OK" } } } },
      });
      const findings = linter.lint(spec, []);
      const paramFindings = findings.filter((f) => f.ruleId === "naming-camelcase-params");
      expect(paramFindings.length).toBeGreaterThan(0);
      expect(paramFindings[0].message).toContain("User_Id");
    });

    it("passes for camelCase parameters", () => {
      const spec = makeSpec({
        "/users/{userId}": { get: { responses: { "200": { description: "OK" } } } },
      });
      const findings = linter.lint(spec, []);
      const paramFindings = findings.filter((f) => f.ruleId === "naming-camelcase-params");
      expect(paramFindings).toHaveLength(0);
    });
  });

  describe("naming-plural-resources", () => {
    it("flags singular resource names", () => {
      const spec = makeSpec({
        "/user/{id}": { get: { responses: { "200": { description: "OK" } } } },
      });
      const findings = linter.lint(spec, []);
      const plural = findings.filter((f) => f.ruleId === "naming-plural-resources");
      expect(plural.length).toBeGreaterThan(0);
    });

    it("passes for plural resource names", () => {
      const spec = makeSpec({
        "/users/{id}": { get: { responses: { "200": { description: "OK" } } } },
      });
      const findings = linter.lint(spec, []);
      const plural = findings.filter((f) => f.ruleId === "naming-plural-resources");
      expect(plural).toHaveLength(0);
    });

    it("allows exceptions like /auth, /login", () => {
      const spec = makeSpec({
        "/auth/login": { post: { responses: { "200": { description: "OK" } } } },
      });
      const findings = linter.lint(spec, []);
      const plural = findings.filter((f) => f.ruleId === "naming-plural-resources");
      expect(plural).toHaveLength(0);
    });
  });

  describe("naming-no-verbs-in-paths", () => {
    it("flags paths containing CRUD verbs", () => {
      const spec = makeSpec({
        "/getUsers": { get: { responses: { "200": { description: "OK" } } } },
      });
      const findings = linter.lint(spec, []);
      const verbs = findings.filter((f) => f.ruleId === "naming-no-verbs-in-paths");
      expect(verbs.length).toBeGreaterThan(0);
      expect(verbs[0].message).toContain("get");
    });

    it("passes for clean paths", () => {
      const spec = makeSpec({ "/users": { get: { responses: { "200": { description: "OK" } } } } });
      const findings = linter.lint(spec, []);
      const verbs = findings.filter((f) => f.ruleId === "naming-no-verbs-in-paths");
      expect(verbs).toHaveLength(0);
    });
  });

  describe("naming-no-trailing-slash", () => {
    it("flags trailing slashes", () => {
      const spec = makeSpec({
        "/users/": { get: { responses: { "200": { description: "OK" } } } },
      });
      const findings = linter.lint(spec, []);
      const trailing = findings.filter((f) => f.ruleId === "naming-no-trailing-slash");
      expect(trailing.length).toBeGreaterThan(0);
    });
  });

  describe("naming-kebab-case-paths", () => {
    it("flags non-kebab-case path segments", () => {
      const spec = makeSpec({
        "/userProfiles": { get: { responses: { "200": { description: "OK" } } } },
      });
      const findings = linter.lint(spec, []);
      const kebab = findings.filter((f) => f.ruleId === "naming-kebab-case-paths");
      expect(kebab.length).toBeGreaterThan(0);
    });

    it("passes for kebab-case paths", () => {
      const spec = makeSpec({
        "/user-profiles": { get: { responses: { "200": { description: "OK" } } } },
      });
      const findings = linter.lint(spec, []);
      const kebab = findings.filter((f) => f.ruleId === "naming-kebab-case-paths");
      expect(kebab).toHaveLength(0);
    });

    it("ignores version segments like v1", () => {
      const spec = makeSpec({
        "/v1/users": { get: { responses: { "200": { description: "OK" } } } },
      });
      const findings = linter.lint(spec, []);
      const kebab = findings.filter((f) => f.ruleId === "naming-kebab-case-paths");
      expect(kebab).toHaveLength(0);
    });
  });

  describe("naming-no-file-extensions", () => {
    it("flags file extensions in paths", () => {
      const spec = makeSpec({
        "/users.json": { get: { responses: { "200": { description: "OK" } } } },
      });
      const findings = linter.lint(spec, []);
      const ext = findings.filter((f) => f.ruleId === "naming-no-file-extensions");
      expect(ext.length).toBeGreaterThan(0);
    });
  });

  describe("naming-consistent-casing", () => {
    it("flags mixed casing in paths", () => {
      const spec = makeSpec({
        "/user-profiles/userSettings": { get: { responses: { "200": { description: "OK" } } } },
      });
      const findings = linter.lint(spec, []);
      const casing = findings.filter((f) => f.ruleId === "naming-consistent-casing");
      expect(casing.length).toBeGreaterThan(0);
    });
  });

  // ===== REST PRACTICES =====

  describe("rest-no-body-on-get-delete", () => {
    it("flags GET with request body", () => {
      const spec = makeSpec({
        "/users": {
          get: {
            requestBody: { content: { "application/json": { schema: {} } } },
            responses: { "200": { description: "OK" } },
          },
        },
      });
      const findings = linter.lint(spec, []);
      const body = findings.filter((f) => f.ruleId === "rest-no-body-on-get-delete");
      expect(body.length).toBeGreaterThan(0);
    });

    it("allows POST with request body", () => {
      const spec = makeSpec({
        "/users": {
          post: {
            requestBody: { content: { "application/json": { schema: {} } } },
            responses: { "201": { description: "Created" } },
          },
        },
      });
      const findings = linter.lint(spec, []);
      const body = findings.filter((f) => f.ruleId === "rest-no-body-on-get-delete");
      expect(body).toHaveLength(0);
    });
  });

  describe("rest-body-on-post-put-patch", () => {
    it("flags POST without request body", () => {
      const spec = makeSpec({
        "/users": {
          post: { responses: { "201": { description: "Created" } } },
        },
      });
      const findings = linter.lint(spec, []);
      const body = findings.filter((f) => f.ruleId === "rest-body-on-post-put-patch");
      expect(body.length).toBeGreaterThan(0);
    });
  });

  describe("rest-proper-status-codes", () => {
    it("flags POST without 201/202", () => {
      const spec = makeSpec({
        "/users": {
          post: {
            requestBody: { content: { "application/json": { schema: {} } } },
            responses: { "200": { description: "OK" } },
          },
        },
      });
      const findings = linter.lint(spec, []);
      const codes = findings.filter((f) => f.ruleId === "rest-proper-status-codes");
      expect(codes.length).toBeGreaterThan(0);
    });

    it("passes POST with 201", () => {
      const spec = makeSpec({
        "/users": {
          post: {
            requestBody: { content: { "application/json": { schema: {} } } },
            responses: { "201": { description: "Created" } },
          },
        },
      });
      const findings = linter.lint(spec, []);
      const codes = findings.filter((f) => f.ruleId === "rest-proper-status-codes");
      expect(codes).toHaveLength(0);
    });
  });

  describe("rest-pagination-on-lists", () => {
    it("flags list endpoints without pagination", () => {
      const spec = makeSpec({
        "/users": {
          get: { responses: { "200": { description: "OK" } } },
        },
      });
      const findings = linter.lint(spec, []);
      const pag = findings.filter((f) => f.ruleId === "rest-pagination-on-lists");
      expect(pag.length).toBeGreaterThan(0);
    });

    it("passes list endpoints with pagination params", () => {
      const spec = makeSpec({
        "/users": {
          get: {
            parameters: [
              { name: "page", in: "query" },
              { name: "pageSize", in: "query" },
            ],
            responses: { "200": { description: "OK" } },
          },
        },
      });
      const findings = linter.lint(spec, []);
      const pag = findings.filter((f) => f.ruleId === "rest-pagination-on-lists");
      expect(pag).toHaveLength(0);
    });
  });

  describe("rest-no-deep-nesting", () => {
    it("flags deeply nested paths", () => {
      const spec = makeSpec({
        "/orgs/teams/members/roles": {
          get: { responses: { "200": { description: "OK" } } },
        },
      });
      const findings = linter.lint(spec, []);
      const nesting = findings.filter((f) => f.ruleId === "rest-no-deep-nesting");
      expect(nesting.length).toBeGreaterThan(0);
    });

    it("passes 3-level paths", () => {
      const spec = makeSpec({
        "/orgs/teams/members": {
          get: { responses: { "200": { description: "OK" } } },
        },
      });
      const findings = linter.lint(spec, []);
      const nesting = findings.filter((f) => f.ruleId === "rest-no-deep-nesting");
      expect(nesting).toHaveLength(0);
    });
  });

  describe("rest-versioning", () => {
    it("flags APIs without versioning", () => {
      const spec = makeSpec({
        "/users": { get: { responses: { "200": { description: "OK" } } } },
      });
      const findings = linter.lint(spec, []);
      const ver = findings.filter((f) => f.ruleId === "rest-versioning");
      expect(ver.length).toBeGreaterThan(0);
    });

    it("passes APIs with versioning", () => {
      const spec = makeSpec({
        "/v1/users": { get: { responses: { "200": { description: "OK" } } } },
      });
      const findings = linter.lint(spec, []);
      const ver = findings.filter((f) => f.ruleId === "rest-versioning");
      expect(ver).toHaveLength(0);
    });
  });

  // ===== DOCUMENTATION RULES =====

  describe("docs-default-descriptions", () => {
    it("flags auto-generated descriptions", () => {
      const spec = makeSpec({
        "/users": {
          get: {
            description: "Success",
            responses: { "200": { description: "Success" } },
          },
        },
      });
      const findings = linter.lint(spec, []);
      const defaults = findings.filter((f) => f.ruleId === "docs-default-descriptions");
      expect(defaults.length).toBeGreaterThan(0);
    });

    it("passes meaningful descriptions", () => {
      const spec = makeSpec({
        "/users": {
          get: {
            description: "Retrieves a paginated list of all active users in the organization",
            responses: {
              "200": {
                description: "A paginated list of users with their profile information",
              },
            },
          },
        },
      });
      const findings = linter.lint(spec, []);
      const defaults = findings.filter((f) => f.ruleId === "docs-default-descriptions");
      expect(defaults).toHaveLength(0);
    });

    it("flags NSwag auto-generated descriptions", () => {
      const spec = makeSpec({
        "/users": {
          get: {
            description: "A server side error occurred.",
            responses: { "200": { description: "OK" } },
          },
        },
      });
      const findings = linter.lint(spec, []);
      const defaults = findings.filter((f) => f.ruleId === "docs-default-descriptions");
      expect(defaults.length).toBeGreaterThan(0);
    });
  });

  describe("docs-missing-operation-description", () => {
    it("flags operations with no description or summary", () => {
      const spec = makeSpec({
        "/users": {
          get: { responses: { "200": { description: "OK" } } },
        },
      });
      const findings = linter.lint(spec, []);
      const missing = findings.filter((f) => f.ruleId === "docs-missing-operation-description");
      expect(missing.length).toBeGreaterThan(0);
    });

    it("passes operations with summary", () => {
      const spec = makeSpec({
        "/users": {
          get: {
            summary: "List all users",
            responses: { "200": { description: "OK" } },
          },
        },
      });
      const findings = linter.lint(spec, []);
      const missing = findings.filter((f) => f.ruleId === "docs-missing-operation-description");
      expect(missing).toHaveLength(0);
    });
  });

  describe("docs-missing-parameter-description", () => {
    it("flags parameters without descriptions", () => {
      const spec = makeSpec({
        "/users": {
          get: {
            parameters: [{ name: "page", in: "query" }],
            responses: { "200": { description: "OK" } },
          },
        },
      });
      const findings = linter.lint(spec, []);
      const params = findings.filter((f) => f.ruleId === "docs-missing-parameter-description");
      expect(params.length).toBeGreaterThan(0);
    });
  });

  describe("docs-missing-tags", () => {
    it("flags operations without tags", () => {
      const spec = makeSpec({
        "/users": {
          get: {
            summary: "List users",
            responses: { "200": { description: "OK" } },
          },
        },
      });
      const findings = linter.lint(spec, []);
      const tags = findings.filter((f) => f.ruleId === "docs-missing-tags");
      expect(tags.length).toBeGreaterThan(0);
    });

    it("passes operations with tags", () => {
      const spec = makeSpec({
        "/users": {
          get: {
            summary: "List users",
            tags: ["Users"],
            responses: { "200": { description: "OK" } },
          },
        },
      });
      const findings = linter.lint(spec, []);
      const tags = findings.filter((f) => f.ruleId === "docs-missing-tags");
      expect(tags).toHaveLength(0);
    });
  });

  describe("docs-missing-schema-description", () => {
    it("flags schemas without descriptions", () => {
      const spec = makeSpec(
        { "/users": { get: { responses: { "200": { description: "OK" } } } } },
        {
          components: {
            schemas: {
              User: { type: "object", properties: { id: { type: "string" } } },
            },
          },
        }
      );
      const findings = linter.lint(spec, []);
      const schemas = findings.filter((f) => f.ruleId === "docs-missing-schema-description");
      expect(schemas.length).toBeGreaterThan(0);
    });
  });

  // ===== RULE OVERRIDES =====

  describe("rule overrides", () => {
    it("respects disabled rules", () => {
      const spec = makeSpec({
        "/getUsers": { get: { responses: { "200": { description: "OK" } } } },
      });

      const allFindings = linter.lint(spec, []);
      const verbFindings = allFindings.filter((f) => f.ruleId === "naming-no-verbs-in-paths");
      expect(verbFindings.length).toBeGreaterThan(0);

      const filteredFindings = linter.lint(spec, [
        { ruleId: "naming-no-verbs-in-paths", enabled: false },
      ]);
      const filteredVerbFindings = filteredFindings.filter(
        (f) => f.ruleId === "naming-no-verbs-in-paths"
      );
      expect(filteredVerbFindings).toHaveLength(0);
    });

    it("respects severity overrides", () => {
      const spec = makeSpec({
        "/getUsers": { get: { responses: { "200": { description: "OK" } } } },
      });
      const findings = linter.lint(spec, [
        { ruleId: "naming-no-verbs-in-paths", enabled: true, severity: Severity.Critical },
      ]);
      const verbFindings = findings.filter((f) => f.ruleId === "naming-no-verbs-in-paths");
      expect(verbFindings.length).toBeGreaterThan(0);
      expect(verbFindings[0].severity).toBe(Severity.Critical);
    });
  });

  // ===== DEDUPLICATION =====

  describe("deduplication", () => {
    it("deduplicates identical findings", () => {
      const spec = makeSpec({
        "/users": { get: { responses: { "200": { description: "OK" } } } },
      });
      const findings = linter.lint(spec, []);
      const keys = findings.map((f) => `${f.ruleId}::${f.path}::${f.method ?? ""}::${f.message}`);
      const uniqueKeys = new Set(keys);
      expect(keys.length).toBe(uniqueKeys.size);
    });
  });

  // ===== SORTING =====

  describe("sorting", () => {
    it("sorts findings by severity (critical first)", () => {
      const spec = makeSpec({
        "/getUser": {
          get: {
            requestBody: { content: { "application/json": { schema: {} } } },
            responses: { "200": { description: "Success" } },
          },
        },
      });
      const findings = linter.lint(spec, []);
      for (let i = 1; i < findings.length; i++) {
        const prevOrder = ["critical", "high", "medium", "low"].indexOf(findings[i - 1].severity);
        const currOrder = ["critical", "high", "medium", "low"].indexOf(findings[i].severity);
        expect(prevOrder).toBeLessThanOrEqual(currOrder);
      }
    });
  });

  // ===== POLICY RULES =====

  describe("policy-version-not-production", () => {
    const makeApiEntry = (
      visibility: ApiVisibility,
      publishStatus: ApiPublishStatus
    ): SwaggerApiEntry => ({
      id: "test-api",
      name: "Test API",
      url: "https://example.com/swagger.json",
      addedAt: "2026-01-01T00:00:00Z",
      addedBy: "user-1",
      visibility,
      publishStatus,
    });

    it("flags 0.0.x versioned API that is public and published", () => {
      const spec = makeSpec({}, { info: { title: "Test", version: "0.0.1" } });
      const api = makeApiEntry(ApiVisibility.Public, ApiPublishStatus.Published);
      const findings = linter.lint(spec, [], api);
      const f = findings.find((f) => f.ruleId === "policy-version-not-production");
      expect(f).toBeDefined();
      expect(f!.severity).toBe(Severity.Critical);
      expect(f!.category).toBe(RuleCategory.Policy);
    });

    it("flags 0.x.x versioned API that is public", () => {
      const spec = makeSpec({}, { info: { title: "Test", version: "0.1.0" } });
      const api = makeApiEntry(ApiVisibility.Public, ApiPublishStatus.Unpublished);
      const findings = linter.lint(spec, [], api);
      const f = findings.find((f) => f.ruleId === "policy-version-not-production");
      expect(f).toBeDefined();
    });

    it("does not flag 0.0.x versioned API that is private and unpublished", () => {
      const spec = makeSpec({}, { info: { title: "Test", version: "0.0.1" } });
      const api = makeApiEntry(ApiVisibility.Private, ApiPublishStatus.Unpublished);
      const findings = linter.lint(spec, [], api);
      const f = findings.find((f) => f.ruleId === "policy-version-not-production");
      expect(f).toBeUndefined();
    });

    it("does not flag production version that is public and published", () => {
      const spec = makeSpec({}, { info: { title: "Test", version: "1.0.0" } });
      const api = makeApiEntry(ApiVisibility.Public, ApiPublishStatus.Published);
      const findings = linter.lint(spec, [], api);
      const f = findings.find((f) => f.ruleId === "policy-version-not-production");
      expect(f).toBeUndefined();
    });

    it("does not flag when no apiEntry is provided", () => {
      const spec = makeSpec({}, { info: { title: "Test", version: "0.0.1" } });
      const findings = linter.lint(spec, []);
      const f = findings.find((f) => f.ruleId === "policy-version-not-production");
      expect(f).toBeUndefined();
    });
  });

  describe("policy-missing-api-description", () => {
    const defaultApi: SwaggerApiEntry = {
      id: "test-api",
      name: "Test API",
      url: "https://example.com/swagger.json",
      addedAt: "2026-01-01T00:00:00Z",
      addedBy: "user-1",
      visibility: ApiVisibility.Public,
      publishStatus: ApiPublishStatus.Published,
    };

    it("flags API with no description", () => {
      const spec = makeSpec({}, { info: { title: "Test", version: "1.0.0" } });
      const findings = linter.lint(spec, [], defaultApi);
      const f = findings.find((f) => f.ruleId === "policy-missing-api-description");
      expect(f).toBeDefined();
      expect(f!.severity).toBe(Severity.High);
      expect(f!.category).toBe(RuleCategory.Policy);
    });

    it("flags API with empty description", () => {
      const spec = makeSpec({}, { info: { title: "Test", version: "1.0.0", description: "   " } });
      const findings = linter.lint(spec, [], defaultApi);
      const f = findings.find((f) => f.ruleId === "policy-missing-api-description");
      expect(f).toBeDefined();
    });

    it("does not flag API with meaningful description", () => {
      const spec = makeSpec(
        {},
        {
          info: {
            title: "Test",
            version: "1.0.0",
            description: "This API provides user management endpoints",
          },
        }
      );
      const findings = linter.lint(spec, [], defaultApi);
      const f = findings.find((f) => f.ruleId === "policy-missing-api-description");
      expect(f).toBeUndefined();
    });
  });
});
