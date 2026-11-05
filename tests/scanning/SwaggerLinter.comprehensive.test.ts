import { SwaggerLinter } from "@/scanning/SwaggerLinter";
import {
  OpenApiSpec,
  Severity,
  RuleCategory,
  SwaggerApiEntry,
  ApiVisibility,
  ApiPublishStatus,
  LintRuleOverride,
} from "@/models/interfaces";

function makeSpec(paths: Record<string, any>, extras?: Partial<OpenApiSpec>): OpenApiSpec {
  return {
    openapi: "3.0.0",
    info: { title: "Test API", version: "1.0.0" },
    paths,
    ...extras,
  };
}

function makeApiEntry(overrides?: Partial<SwaggerApiEntry>): SwaggerApiEntry {
  return {
    id: "test-api",
    name: "Test API",
    url: "https://example.com/swagger.json",
    addedAt: "2026-01-01",
    addedBy: "user-1",
    visibility: ApiVisibility.Public,
    publishStatus: ApiPublishStatus.Published,
    ...overrides,
  };
}

describe("SwaggerLinter — comprehensive tests", () => {
  let linter: SwaggerLinter;

  beforeEach(() => {
    linter = new SwaggerLinter();
  });

  // ==========================
  // isLikelyPlural edge cases
  // ==========================
  describe("isLikelyPlural blocklist — singular words ending in 's'", () => {
    const singularWords = [
      "status",
      "address",
      "access",
      "process",
      "progress",
      "canvas",
      "atlas",
      "bus",
      "corpus",
      "campus",
      "consensus",
      "diagnosis",
      "analysis",
      "basis",
      "crisis",
      "emphasis",
      "genesis",
      "hypothesis",
      "oasis",
      "synopsis",
      "synthesis",
      "thesis",
      "alias",
      "class",
      "focus",
      "gas",
      "index",
      "lens",
      "mass",
      "virus",
      "series",
      "species",
    ];

    for (const word of singularWords) {
      it(`does not flag "${word}" as needing pluralisation`, () => {
        const spec = makeSpec({
          [`/${word}`]: { get: { responses: { "200": { description: "OK" } } } },
        });
        const findings = linter.lint(spec, []);
        const plural = findings.filter((f) => f.ruleId === "naming-plural-resources");
        expect(plural).toHaveLength(0);
      });
    }

    it("still flags true singular words not in the blocklist", () => {
      const spec = makeSpec({ "/user": { get: { responses: { "200": { description: "OK" } } } } });
      const findings = linter.lint(spec, []);
      const plural = findings.filter((f) => f.ruleId === "naming-plural-resources");
      expect(plural.length).toBeGreaterThan(0);
    });

    it("treats words ending in 's' that are actual plurals correctly", () => {
      const spec = makeSpec({ "/users": { get: { responses: { "200": { description: "OK" } } } } });
      const findings = linter.lint(spec, []);
      const plural = findings.filter((f) => f.ruleId === "naming-plural-resources");
      expect(plural).toHaveLength(0);
    });

    it("does not flag known plural-form words like data, media, criteria", () => {
      for (const word of ["data", "media", "criteria", "people", "children"]) {
        const spec = makeSpec({
          [`/${word}`]: { get: { responses: { "200": { description: "OK" } } } },
        });
        const findings = linter.lint(spec, []);
        const plural = findings.filter((f) => f.ruleId === "naming-plural-resources");
        expect(plural).toHaveLength(0);
      }
    });

    it("does not flag known exceptions like auth, login, health, search", () => {
      for (const word of ["auth", "login", "logout", "health", "status", "search", "me", "info"]) {
        const spec = makeSpec({
          [`/${word}`]: { get: { responses: { "200": { description: "OK" } } } },
        });
        const findings = linter.lint(spec, []);
        const plural = findings.filter((f) => f.ruleId === "naming-plural-resources");
        expect(plural).toHaveLength(0);
      }
    });
  });

  // ==========================
  // rest-correct-http-verbs — all segments
  // ==========================
  describe("rest-correct-http-verbs — checks all path segments", () => {
    it("flags creation verb in a middle segment", () => {
      const spec = makeSpec({
        "/api/create/resources": {
          get: { responses: { "200": { description: "OK" } } },
        },
      });
      const findings = linter.lint(spec, []);
      const verbFindings = findings.filter((f) => f.ruleId === "rest-correct-http-verbs");
      expect(verbFindings.length).toBeGreaterThan(0);
      expect(verbFindings[0].message).toContain("create");
    });

    it("flags deletion verb in first segment", () => {
      const spec = makeSpec({
        "/delete/items": {
          get: { responses: { "200": { description: "OK" } } },
        },
      });
      const findings = linter.lint(spec, []);
      const verbFindings = findings.filter((f) => f.ruleId === "rest-correct-http-verbs");
      expect(verbFindings.length).toBeGreaterThan(0);
    });

    it("flags update verb in any segment", () => {
      const spec = makeSpec({
        "/v1/update/records": {
          get: { responses: { "200": { description: "OK" } } },
        },
      });
      const findings = linter.lint(spec, []);
      const verbFindings = findings.filter((f) => f.ruleId === "rest-correct-http-verbs");
      expect(verbFindings.length).toBeGreaterThan(0);
    });

    it("does not flag clean resource paths", () => {
      const spec = makeSpec({
        "/v1/users/{id}/profiles": {
          get: { responses: { "200": { description: "OK" } } },
        },
      });
      const findings = linter.lint(spec, []);
      const verbFindings = findings.filter((f) => f.ruleId === "rest-correct-http-verbs");
      expect(verbFindings).toHaveLength(0);
    });
  });

  // ==========================
  // Deduplication
  // ==========================
  describe("deduplication", () => {
    it("deduplicates across all rule categories", () => {
      // A spec that generates multiple findings per path — deduplication should remove exact duplicates
      const spec = makeSpec({
        "/users": { get: { responses: { "200": { description: "OK" } } } },
        "/users/": { get: { responses: { "200": { description: "OK" } } } },
      });
      const findings = linter.lint(spec, []);
      const keys = findings.map((f) => `${f.ruleId}::${f.path}::${f.method ?? ""}::${f.message}`);
      const uniqueKeys = new Set(keys);
      expect(keys.length).toBe(uniqueKeys.size);
    });

    it("does not deduplicate different rules on the same path", () => {
      const spec = makeSpec({
        "/getUser": { get: { responses: { "200": { description: "OK" } } } },
      });
      const findings = linter.lint(spec, []);
      // Should have both naming-no-verbs-in-paths AND rest-correct-http-verbs or similar
      const ruleIds = new Set(findings.map((f) => f.ruleId));
      expect(ruleIds.size).toBeGreaterThan(1);
    });
  });

  // ==========================
  // Severity override
  // ==========================
  describe("severity override", () => {
    it("overrides to Critical", () => {
      const spec = makeSpec({
        "/users/{User_Id}": { get: { responses: { "200": { description: "OK" } } } },
      });
      const overrides: LintRuleOverride[] = [
        { ruleId: "naming-camelcase-params", enabled: true, severity: Severity.Critical },
      ];
      const findings = linter.lint(spec, overrides);
      const paramFindings = findings.filter((f) => f.ruleId === "naming-camelcase-params");
      expect(paramFindings.length).toBeGreaterThan(0);
      expect(paramFindings[0].severity).toBe(Severity.Critical);
    });

    it("overrides to Low", () => {
      const spec = makeSpec({
        "/getUsers": { get: { responses: { "200": { description: "OK" } } } },
      });
      const overrides: LintRuleOverride[] = [
        { ruleId: "naming-no-verbs-in-paths", enabled: true, severity: Severity.Low },
      ];
      const findings = linter.lint(spec, overrides);
      const verbFindings = findings.filter((f) => f.ruleId === "naming-no-verbs-in-paths");
      expect(verbFindings[0].severity).toBe(Severity.Low);
    });

    it("uses default severity when override has no severity field", () => {
      const spec = makeSpec({
        "/getUsers": { get: { responses: { "200": { description: "OK" } } } },
      });
      const overrides: LintRuleOverride[] = [{ ruleId: "naming-no-verbs-in-paths", enabled: true }];
      const findings = linter.lint(spec, overrides);
      const verbFindings = findings.filter((f) => f.ruleId === "naming-no-verbs-in-paths");
      expect(verbFindings[0].severity).toBe(Severity.High); // default
    });
  });

  // ==========================
  // Disabled rules
  // ==========================
  describe("disabled rules", () => {
    it("suppresses all findings from a disabled rule", () => {
      const spec = makeSpec({
        "/users": { get: { responses: { "200": { description: "OK" } } } },
      });
      const overrides: LintRuleOverride[] = [
        { ruleId: "docs-missing-operation-description", enabled: false },
      ];
      const findings = linter.lint(spec, overrides);
      const suppressed = findings.filter((f) => f.ruleId === "docs-missing-operation-description");
      expect(suppressed).toHaveLength(0);
    });

    it("does not affect other rules when one is disabled", () => {
      const spec = makeSpec({
        "/users": { get: { responses: { "200": { description: "OK" } } } },
      });
      const allFindings = linter.lint(spec, []);
      const withDisabled = linter.lint(spec, [
        { ruleId: "docs-missing-operation-description", enabled: false },
      ]);
      // Should have fewer findings
      expect(withDisabled.length).toBeLessThan(allFindings.length);
      // All other rules should still fire
      const otherRules = allFindings.filter(
        (f) => f.ruleId !== "docs-missing-operation-description"
      );
      expect(withDisabled.length).toBe(otherRules.length);
    });

    it("supports disabling multiple rules", () => {
      const spec = makeSpec({
        "/users": { get: { responses: { "200": { description: "OK" } } } },
      });
      const overrides: LintRuleOverride[] = [
        { ruleId: "docs-missing-operation-description", enabled: false },
        { ruleId: "docs-missing-tags", enabled: false },
        { ruleId: "rest-pagination-on-lists", enabled: false },
        { ruleId: "rest-versioning", enabled: false },
      ];
      const findings = linter.lint(spec, overrides);
      for (const o of overrides) {
        expect(findings.filter((f) => f.ruleId === o.ruleId)).toHaveLength(0);
      }
    });
  });

  // ==========================
  // Rule categories
  // ==========================
  describe("rule categories", () => {
    it("naming rules produce naming category", () => {
      const spec = makeSpec({
        "/users/{User_Id}": { get: { responses: { "200": { description: "OK" } } } },
      });
      const findings = linter.lint(spec, []);
      const naming = findings.filter((f) => f.category === RuleCategory.Naming);
      expect(naming.length).toBeGreaterThan(0);
    });

    it("rest rules produce rest-practices category", () => {
      const spec = makeSpec({
        "/users": {
          get: {
            requestBody: { content: { "application/json": { schema: {} } } },
            responses: { "200": { description: "OK" } },
          },
        },
      });
      const findings = linter.lint(spec, []);
      const rest = findings.filter((f) => f.category === RuleCategory.RestPractices);
      expect(rest.length).toBeGreaterThan(0);
    });

    it("docs rules produce documentation category", () => {
      const spec = makeSpec({
        "/users": { get: { responses: { "200": { description: "OK" } } } },
      });
      const findings = linter.lint(spec, []);
      const docs = findings.filter((f) => f.category === RuleCategory.Documentation);
      expect(docs.length).toBeGreaterThan(0);
    });

    it("policy rules produce policy category", () => {
      const spec = makeSpec({}, { info: { title: "Test", version: "0.0.1" } });
      const api = makeApiEntry({ visibility: ApiVisibility.Public });
      const findings = linter.lint(spec, [], api);
      const policy = findings.filter((f) => f.category === RuleCategory.Policy);
      expect(policy.length).toBeGreaterThan(0);
    });
  });

  // ==========================
  // rest-content-type-defined
  // ==========================
  describe("rest-content-type-defined", () => {
    it("flags POST with requestBody but no content", () => {
      const spec = makeSpec({
        "/items": {
          post: {
            requestBody: { description: "no content field" },
            responses: { "201": { description: "Created" } },
          },
        },
      });
      const findings = linter.lint(spec, []);
      const ct = findings.filter((f) => f.ruleId === "rest-content-type-defined");
      expect(ct.length).toBeGreaterThan(0);
    });

    it("passes POST with requestBody that has content", () => {
      const spec = makeSpec({
        "/items": {
          post: {
            requestBody: { content: { "application/json": { schema: {} } } },
            responses: { "201": { description: "Created" } },
          },
        },
      });
      const findings = linter.lint(spec, []);
      const ct = findings.filter((f) => f.ruleId === "rest-content-type-defined");
      expect(ct).toHaveLength(0);
    });
  });

  // ==========================
  // rest-consistent-error-format
  // ==========================
  describe("rest-consistent-error-format", () => {
    it("flags when more than 3 different error schemas", () => {
      const paths: Record<string, any> = {};
      for (let i = 0; i < 5; i++) {
        paths[`/v1/resource-${i}`] = {
          get: {
            responses: {
              "200": { description: "OK" },
              "400": {
                description: "Bad",
                content: {
                  "application/json": {
                    schema: { type: "object", properties: { [`field${i}`]: { type: "string" } } },
                  },
                },
              },
            },
          },
        };
      }
      const spec = makeSpec(paths);
      const findings = linter.lint(spec, []);
      const errorFormat = findings.filter((f) => f.ruleId === "rest-consistent-error-format");
      expect(errorFormat.length).toBeGreaterThan(0);
    });

    it("passes when all error schemas are the same", () => {
      const sharedSchema = { type: "object", properties: { message: { type: "string" } } };
      const paths: Record<string, any> = {};
      for (let i = 0; i < 5; i++) {
        paths[`/v1/resource-${i}`] = {
          get: {
            responses: {
              "200": { description: "OK" },
              "400": {
                description: "Bad",
                content: { "application/json": { schema: sharedSchema } },
              },
            },
          },
        };
      }
      const spec = makeSpec(paths);
      const findings = linter.lint(spec, []);
      const errorFormat = findings.filter((f) => f.ruleId === "rest-consistent-error-format");
      expect(errorFormat).toHaveLength(0);
    });
  });

  // ==========================
  // naming-no-crud-operation-ids
  // ==========================
  describe("naming-no-crud-operation-ids", () => {
    it("flags operationId starting with CRUD verb", () => {
      const spec = makeSpec({
        "/v1/items": {
          get: {
            operationId: "getItems",
            responses: { "200": { description: "OK" } },
          },
        },
      });
      const findings = linter.lint(spec, []);
      const crudIds = findings.filter((f) => f.ruleId === "naming-no-crud-operation-ids");
      expect(crudIds.length).toBeGreaterThan(0);
    });

    it("passes operationId that does not start with CRUD verb", () => {
      const spec = makeSpec({
        "/v1/items": {
          get: {
            operationId: "itemsList",
            responses: { "200": { description: "OK" } },
          },
        },
      });
      const findings = linter.lint(spec, []);
      const crudIds = findings.filter((f) => f.ruleId === "naming-no-crud-operation-ids");
      expect(crudIds).toHaveLength(0);
    });
  });

  // ==========================
  // docs-empty-summary
  // ==========================
  describe("docs-empty-summary", () => {
    it("flags operations with empty string summary", () => {
      const spec = makeSpec({
        "/users": {
          get: {
            summary: "",
            responses: { "200": { description: "OK" } },
          },
        },
      });
      const findings = linter.lint(spec, []);
      const empty = findings.filter((f) => f.ruleId === "docs-empty-summary");
      expect(empty.length).toBeGreaterThan(0);
    });

    it("flags operations with whitespace-only summary", () => {
      const spec = makeSpec({
        "/users": {
          get: {
            summary: "   ",
            responses: { "200": { description: "OK" } },
          },
        },
      });
      const findings = linter.lint(spec, []);
      const empty = findings.filter((f) => f.ruleId === "docs-empty-summary");
      expect(empty.length).toBeGreaterThan(0);
    });

    it("does not flag operations with no summary field at all", () => {
      const spec = makeSpec({
        "/users": {
          get: { responses: { "200": { description: "OK" } } },
        },
      });
      const findings = linter.lint(spec, []);
      const empty = findings.filter((f) => f.ruleId === "docs-empty-summary");
      expect(empty).toHaveLength(0);
    });
  });

  // ==========================
  // docs-missing-examples
  // ==========================
  describe("docs-missing-examples", () => {
    it("flags operations with no response examples", () => {
      const spec = makeSpec({
        "/v1/items": {
          get: {
            responses: {
              "200": {
                description: "OK",
                content: { "application/json": { schema: { type: "object" } } },
              },
            },
          },
        },
      });
      const findings = linter.lint(spec, []);
      const examples = findings.filter((f) => f.ruleId === "docs-missing-examples");
      expect(examples.length).toBeGreaterThan(0);
    });

    it("passes operations with response examples", () => {
      const spec = makeSpec({
        "/v1/items": {
          get: {
            responses: {
              "200": {
                description: "OK",
                content: {
                  "application/json": {
                    schema: { type: "object" },
                    example: { id: 1, name: "test" },
                  },
                },
              },
            },
          },
        },
      });
      const findings = linter.lint(spec, []);
      const examples = findings.filter((f) => f.ruleId === "docs-missing-examples");
      expect(examples).toHaveLength(0);
    });
  });

  // ==========================
  // docs-missing-response-description
  // ==========================
  describe("docs-missing-response-description", () => {
    it("flags responses without descriptions", () => {
      const spec = makeSpec({
        "/v1/items": {
          get: {
            responses: { "200": {} },
          },
        },
      });
      const findings = linter.lint(spec, []);
      const resp = findings.filter((f) => f.ruleId === "docs-missing-response-description");
      expect(resp.length).toBeGreaterThan(0);
    });

    it("passes responses with descriptions", () => {
      const spec = makeSpec({
        "/v1/items": {
          get: {
            responses: { "200": { description: "Returns list of items" } },
          },
        },
      });
      const findings = linter.lint(spec, []);
      const resp = findings.filter((f) => f.ruleId === "docs-missing-response-description");
      expect(resp).toHaveLength(0);
    });
  });

  // ==========================
  // Sorting
  // ==========================
  describe("sorting by severity", () => {
    it("critical findings appear before high", () => {
      const spec = makeSpec(
        {
          "/getUser": {
            get: {
              requestBody: { content: { "application/json": { schema: {} } } },
              responses: { "200": { description: "Success" } },
            },
          },
        },
        { info: { title: "Test", version: "0.0.1" } }
      );
      const api = makeApiEntry({
        visibility: ApiVisibility.Public,
        publishStatus: ApiPublishStatus.Published,
      });
      const findings = linter.lint(spec, [], api);
      const severityOrder = ["critical", "high", "medium", "low"];
      for (let i = 1; i < findings.length; i++) {
        const prev = severityOrder.indexOf(findings[i - 1].severity);
        const curr = severityOrder.indexOf(findings[i].severity);
        expect(prev).toBeLessThanOrEqual(curr);
      }
    });
  });

  // ==========================
  // Empty spec
  // ==========================
  describe("edge cases", () => {
    it("handles spec with no paths gracefully", () => {
      const spec = makeSpec({});
      const findings = linter.lint(spec, []);
      // Should only have spec-level findings (like versioning)
      const pathFindings = findings.filter(
        (f) => f.path !== "(global)" && !f.path.startsWith("#/")
      );
      expect(pathFindings).toHaveLength(0);
    });

    it("handles spec with multiple methods on same path", () => {
      const spec = makeSpec({
        "/v1/items": {
          get: { responses: { "200": { description: "OK" } } },
          post: {
            requestBody: { content: { "application/json": { schema: {} } } },
            responses: { "201": { description: "Created" } },
          },
          delete: { responses: { "204": { description: "No Content" } } },
        },
      });
      const findings = linter.lint(spec, []);
      // At minimum GET, POST and DELETE should generate some findings
      expect(findings.length).toBeGreaterThan(0);
    });

    it("handles Swagger 2.x body parameters", () => {
      const spec: OpenApiSpec = {
        swagger: "2.0",
        info: { title: "Test", version: "1.0.0" },
        paths: {
          "/v1/items": {
            get: {
              parameters: [{ name: "body", in: "body", schema: { type: "object" } }],
              responses: { "200": { description: "OK" } },
            },
          },
        },
      };
      const findings = linter.lint(spec, []);
      const bodyFinding = findings.filter((f) => f.ruleId === "rest-no-body-on-get-delete");
      expect(bodyFinding.length).toBeGreaterThan(0);
    });
  });
});
