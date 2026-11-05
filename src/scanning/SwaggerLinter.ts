import {
  OpenApiSpec,
  LintFinding,
  LintRuleOverride,
  Severity,
  RuleCategory,
  OperationObject,
  SwaggerApiEntry,
  ApiVisibility,
  ApiPublishStatus,
} from "../models/interfaces";
import { BUILT_IN_RULES, DEFAULT_DESCRIPTION_PATTERNS, SEVERITY_ORDER } from "../utils/constants";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "options", "head"] as const;

const CRUD_VERBS = [
  "get",
  "list",
  "fetch",
  "retrieve",
  "read",
  "create",
  "add",
  "insert",
  "post",
  "update",
  "edit",
  "modify",
  "put",
  "patch",
  "delete",
  "remove",
  "destroy",
];

const SINGULAR_EXCEPTIONS = new Set([
  "auth",
  "login",
  "logout",
  "health",
  "status",
  "search",
  "me",
  "info",
  "config",
  "metadata",
  "graphql",
  "batch",
  "bulk",
  "export",
  "import",
  "register",
  "verify",
  "confirm",
  "reset",
  "refresh",
  "callback",
]);

/** Words ending in 's' that are actually singular — prevents false-positive plural detection. */
const SINGULAR_WORDS_ENDING_IN_S = new Set([
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
  "parenthesis",
  "synopsis",
  "synthesis",
  "thesis",
  "alias",
  "axis",
  "bonus",
  "census",
  "chaos",
  "christmas",
  "class",
  "compass",
  "congress",
  "cross",
  "davis",
  "debris",
  "dress",
  "excess",
  "express",
  "focus",
  "fungus",
  "gas",
  "glass",
  "grass",
  "guess",
  "illness",
  "index",
  "kiss",
  "lens",
  "loss",
  "mass",
  "mess",
  "miss",
  "minus",
  "moss",
  "mucus",
  "nervous",
  "nexus",
  "octopus",
  "pass",
  "plus",
  "press",
  "previous",
  "radius",
  "rss",
  "series",
  "species",
  "success",
  "surplus",
  "terminus",
  "this",
  "thus",
  "virus",
  "versus",
  "wireless",
  "witness",
]);

function isCamelCase(str: string): boolean {
  return /^[a-z][a-zA-Z0-9]*$/.test(str);
}

function isKebabCase(str: string): boolean {
  return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(str);
}

function isLikelyPlural(word: string): boolean {
  const lower = word.toLowerCase();
  if (SINGULAR_EXCEPTIONS.has(lower)) return true;
  // Singular words ending in 's' — treat as acceptable (don't flag for pluralisation).
  if (SINGULAR_WORDS_ENDING_IN_S.has(lower)) return true;
  if (lower.endsWith("s")) return true;
  // Words like "data", "media", "criteria" are already plural
  if (["data", "media", "criteria", "people", "children"].includes(lower)) return true;
  return false;
}

function isDefaultDescription(text: string): boolean {
  if (!text || text.trim() === "") return true;
  return DEFAULT_DESCRIPTION_PATTERNS.some((pat) => pat.test(text.trim()));
}

function getLastPathSegment(path: string): string {
  const segments = path.split("/").filter((s) => s && !s.startsWith("{"));
  return segments[segments.length - 1] || "";
}

function getResourceSegments(path: string): string[] {
  return path.split("/").filter((s) => s && !s.startsWith("{"));
}

function getPathParams(path: string): string[] {
  const matches = path.match(/\{([^}]+)\}/g) || [];
  return matches.map((m) => m.slice(1, -1));
}

function hasRequestBody(op: OperationObject): boolean {
  // OpenAPI 3.x
  if (op.requestBody) return true;
  // Swagger 2.x
  if (op.parameters?.some((p) => p.in === "body")) return true;
  return false;
}

function getResponseCodes(op: OperationObject): string[] {
  if (!op.responses) return [];
  return Object.keys(op.responses);
}

function hasPaginationParams(op: OperationObject): boolean {
  if (!op.parameters) return false;
  const paginationNames = [
    "page",
    "pagesize",
    "page_size",
    "limit",
    "offset",
    "skip",
    "take",
    "cursor",
    "per_page",
    "perpage",
  ];
  // A `$ref` parameter has no name until it is resolved, and refs are not resolved here.
  return op.parameters.some((p) => paginationNames.includes((p.name ?? "").toLowerCase()));
}

function isListEndpoint(path: string, method: string): boolean {
  if (method !== "get") return false;
  // Ends with a resource (no path param at end) → likely a list
  const segments = path.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  return !!last && !last.startsWith("{");
}

function isPreReleaseVersion(version: string): boolean {
  // Matches 0.x.x, 0.0.x, or any version starting with 0
  const parts = version.replace(/^v/i, "").split(".");
  if (parts.length === 0) return false;
  const major = parseInt(parts[0], 10);
  return major === 0;
}

export class SwaggerLinter {
  lint(
    spec: OpenApiSpec,
    overrides: LintRuleOverride[],
    apiEntry?: SwaggerApiEntry
  ): LintFinding[] {
    const findings: LintFinding[] = [];
    const enabledRules = this.getEnabledRules(overrides);

    for (const [path, pathItem] of Object.entries(spec.paths)) {
      for (const method of HTTP_METHODS) {
        const op = pathItem[method] as OperationObject | undefined;
        if (!op) continue;

        for (const rule of enabledRules) {
          const severity = this.getEffectiveSeverity(rule.id, overrides);
          const ruleFindings = this.runRule(rule.id, path, method, op, spec, severity);
          findings.push(...ruleFindings);
        }
      }

      // Path-level checks (not operation-specific)
      for (const rule of enabledRules) {
        const severity = this.getEffectiveSeverity(rule.id, overrides);
        const pathFindings = this.runPathLevelRule(rule.id, path, spec, severity);
        findings.push(...pathFindings);
      }
    }

    // Spec-level checks
    for (const rule of enabledRules) {
      const severity = this.getEffectiveSeverity(rule.id, overrides);
      const specFindings = this.runSpecLevelRule(rule.id, spec, severity);
      findings.push(...specFindings);
    }

    // Policy-level checks (require API context)
    if (apiEntry) {
      for (const rule of enabledRules) {
        const severity = this.getEffectiveSeverity(rule.id, overrides);
        const policyFindings = this.runPolicyRule(rule.id, spec, apiEntry, severity);
        findings.push(...policyFindings);
      }
    }

    // Sort by severity
    findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

    return this.deduplicateFindings(findings);
  }

  private getEnabledRules(overrides: LintRuleOverride[]) {
    const overrideMap = new Map(overrides.map((o) => [o.ruleId, o]));
    return BUILT_IN_RULES.filter((rule) => {
      const override = overrideMap.get(rule.id);
      return override ? override.enabled : true;
    });
  }

  private getEffectiveSeverity(ruleId: string, overrides: LintRuleOverride[]): Severity {
    const override = overrides.find((o) => o.ruleId === ruleId);
    if (override?.severity) return override.severity;
    const rule = BUILT_IN_RULES.find((r) => r.id === ruleId);
    return rule?.defaultSeverity ?? Severity.Medium;
  }

  private runRule(
    ruleId: string,
    path: string,
    method: string,
    op: OperationObject,
    _spec: OpenApiSpec,
    severity: Severity
  ): LintFinding[] {
    const rule = BUILT_IN_RULES.find((r) => r.id === ruleId)!;
    const findings: LintFinding[] = [];
    const makeFinding = (message: string, suggestion?: string): LintFinding => ({
      ruleId,
      ruleName: rule.name,
      category: rule.category,
      severity,
      path,
      method: method.toUpperCase(),
      message,
      suggestion,
    });

    switch (ruleId) {
      case "naming-no-verbs-in-paths": {
        const segments = getResourceSegments(path);
        for (const segment of segments) {
          const lower = segment.toLowerCase();
          for (const verb of CRUD_VERBS) {
            if (
              lower === verb ||
              (lower.startsWith(verb) && /^[A-Z]/.test(segment.slice(verb.length)))
            ) {
              findings.push(
                makeFinding(
                  `Path segment "${segment}" contains verb "${verb}". Use HTTP methods instead.`,
                  `Remove the verb and rely on ${method.toUpperCase()} to convey intent.`
                )
              );
            }
          }
        }
        break;
      }

      case "rest-no-body-on-get-delete": {
        if ((method === "get" || method === "delete") && hasRequestBody(op)) {
          findings.push(
            makeFinding(
              `${method.toUpperCase()} ${path} should not have a request body.`,
              "Use query parameters or path parameters instead."
            )
          );
        }
        break;
      }

      case "rest-body-on-post-put-patch": {
        if ((method === "post" || method === "put" || method === "patch") && !hasRequestBody(op)) {
          findings.push(
            makeFinding(
              `${method.toUpperCase()} ${path} should have a request body.`,
              "Define a requestBody with the expected schema."
            )
          );
        }
        break;
      }

      case "rest-proper-status-codes": {
        const codes = getResponseCodes(op);
        if (method === "post" && !codes.includes("201") && !codes.includes("202")) {
          findings.push(
            makeFinding(
              `POST ${path} should return 201 (Created) or 202 (Accepted).`,
              "Add a 201 or 202 response code."
            )
          );
        }
        if (method === "delete" && !codes.includes("204") && !codes.includes("200")) {
          findings.push(
            makeFinding(
              `DELETE ${path} should return 204 (No Content) or 200 (OK).`,
              "Add a 204 or 200 response code."
            )
          );
        }
        break;
      }

      case "rest-pagination-on-lists": {
        if (isListEndpoint(path, method) && !hasPaginationParams(op)) {
          findings.push(
            makeFinding(
              `GET ${path} appears to be a list endpoint but has no pagination parameters.`,
              "Add page/pageSize, limit/offset, or cursor parameters."
            )
          );
        }
        break;
      }

      case "rest-content-type-defined": {
        if ((method === "post" || method === "put" || method === "patch") && hasRequestBody(op)) {
          const rb = op.requestBody;
          if (rb && !rb.content) {
            findings.push(
              makeFinding(
                `${method.toUpperCase()} ${path} has a request body but no content type defined.`,
                "Add content type (e.g. application/json) to the request body."
              )
            );
          }
        }
        break;
      }

      case "docs-default-descriptions": {
        if (op.description && isDefaultDescription(op.description)) {
          findings.push(
            makeFinding(
              `Operation description "${op.description}" appears to be auto-generated.`,
              "Write a meaningful description of what this endpoint does."
            )
          );
        }
        if (op.summary && isDefaultDescription(op.summary)) {
          findings.push(
            makeFinding(
              `Operation summary "${op.summary}" appears to be auto-generated.`,
              "Write a meaningful summary."
            )
          );
        }
        if (op.responses) {
          for (const [code, resp] of Object.entries(op.responses)) {
            if (resp.description && isDefaultDescription(resp.description)) {
              findings.push(
                makeFinding(
                  `Response ${code} description "${resp.description}" appears to be auto-generated.`,
                  "Describe what this response means in context."
                )
              );
            }
          }
        }
        break;
      }

      case "docs-missing-operation-description": {
        if (!op.description && !op.summary) {
          findings.push(
            makeFinding(
              `${method.toUpperCase()} ${path} has no description or summary.`,
              "Add a description explaining what this endpoint does."
            )
          );
        }
        break;
      }

      case "docs-missing-parameter-description": {
        if (op.parameters) {
          for (const param of op.parameters) {
            if (param.$ref) continue; // unresolved reference: nothing to judge
            if (!param.description) {
              findings.push(
                makeFinding(
                  `Parameter "${param.name}" on ${method.toUpperCase()} ${path} has no description.`,
                  `Describe what "${param.name}" is used for.`
                )
              );
            }
          }
        }
        break;
      }

      case "docs-missing-response-description": {
        if (op.responses) {
          for (const [code, resp] of Object.entries(op.responses)) {
            if (!resp.description) {
              findings.push(
                makeFinding(
                  `Response ${code} on ${method.toUpperCase()} ${path} has no description.`,
                  "Add a description for this response code."
                )
              );
            }
          }
        }
        break;
      }

      case "docs-missing-tags": {
        if (!op.tags || op.tags.length === 0) {
          findings.push(
            makeFinding(
              `${method.toUpperCase()} ${path} has no tags.`,
              "Add at least one tag to group related operations."
            )
          );
        }
        break;
      }

      case "docs-empty-summary": {
        if (op.summary !== undefined && (!op.summary || op.summary.trim() === "")) {
          findings.push(
            makeFinding(
              `${method.toUpperCase()} ${path} has an empty summary.`,
              "Add a meaningful summary."
            )
          );
        }
        break;
      }

      case "docs-missing-examples": {
        let hasExamples = false;
        if (op.responses) {
          for (const resp of Object.values(op.responses)) {
            if (resp.content) {
              for (const mediaType of Object.values(resp.content)) {
                if (mediaType.example || (mediaType.schema as any)?.example) {
                  hasExamples = true;
                }
              }
            }
          }
        }
        if (!hasExamples && op.responses && Object.keys(op.responses).length > 0) {
          findings.push(
            makeFinding(
              `${method.toUpperCase()} ${path} has no response examples.`,
              "Add example responses to help consumers understand the API."
            )
          );
        }
        break;
      }

      case "rest-correct-http-verbs": {
        const segments = getResourceSegments(path);
        for (const segment of segments) {
          const seg = segment.toLowerCase();
          if (method === "get" && (seg === "create" || seg === "add" || seg === "insert")) {
            findings.push(
              makeFinding(
                `GET ${path} contains creation verb "${segment}". Use POST instead.`,
                "Use POST for creating resources."
              )
            );
          }
          if (method === "get" && (seg === "delete" || seg === "remove")) {
            findings.push(
              makeFinding(
                `GET ${path} contains deletion verb "${segment}". Use DELETE instead.`,
                "Use DELETE for removing resources."
              )
            );
          }
          if (method === "get" && (seg === "update" || seg === "edit" || seg === "modify")) {
            findings.push(
              makeFinding(
                `GET ${path} contains update verb "${segment}". Use PUT or PATCH instead.`,
                "Use PUT/PATCH for updating resources."
              )
            );
          }
        }
        break;
      }
    }

    return findings;
  }

  private runPathLevelRule(
    ruleId: string,
    path: string,
    _spec: OpenApiSpec,
    severity: Severity
  ): LintFinding[] {
    const rule = BUILT_IN_RULES.find((r) => r.id === ruleId)!;
    if (!rule) return [];
    const findings: LintFinding[] = [];
    const makeFinding = (message: string, suggestion?: string): LintFinding => ({
      ruleId,
      ruleName: rule.name,
      category: rule.category,
      severity,
      path,
      message,
      suggestion,
    });

    switch (ruleId) {
      case "naming-camelcase-params": {
        const params = getPathParams(path);
        for (const param of params) {
          if (!isCamelCase(param)) {
            findings.push(
              makeFinding(
                `Path parameter "{${param}}" is not camelCase.`,
                `Rename to "{${param.charAt(0).toLowerCase()}${param.slice(1).replace(/[-_](.)/g, (_, c) => c.toUpperCase())}}".`
              )
            );
          }
        }
        break;
      }

      case "naming-plural-resources": {
        const lastSeg = getLastPathSegment(path);
        if (lastSeg && !isLikelyPlural(lastSeg)) {
          findings.push(
            makeFinding(
              `Resource "${lastSeg}" should be plural.`,
              `Rename to "${lastSeg}s" (or the appropriate plural form).`
            )
          );
        }
        break;
      }

      case "naming-no-trailing-slash": {
        if (path.length > 1 && path.endsWith("/")) {
          findings.push(
            makeFinding(
              `Path "${path}" has a trailing slash.`,
              `Remove the trailing slash: "${path.slice(0, -1)}".`
            )
          );
        }
        break;
      }

      case "naming-kebab-case-paths": {
        const segments = getResourceSegments(path);
        for (const segment of segments) {
          // Skip version segments like v1, v2
          if (/^v\d+$/i.test(segment)) continue;
          if (!isKebabCase(segment)) {
            findings.push(
              makeFinding(
                `Path segment "${segment}" is not kebab-case.`,
                `Rename to "${segment
                  .replace(/([a-z])([A-Z])/g, "$1-$2")
                  .replace(/_/g, "-")
                  .toLowerCase()}".`
              )
            );
          }
        }
        break;
      }

      case "naming-no-file-extensions": {
        const segments = path.split("/").filter(Boolean);
        for (const segment of segments) {
          if (/\.(json|xml|html|yaml|yml|csv|pdf|txt)$/i.test(segment)) {
            findings.push(
              makeFinding(
                `Path segment "${segment}" contains a file extension.`,
                "Use Accept headers for content negotiation instead of file extensions."
              )
            );
          }
        }
        break;
      }

      case "naming-consistent-casing": {
        const segments = getResourceSegments(path);
        if (segments.length < 2) break;
        // Skip version segments
        const nonVersionSegments = segments.filter((s) => !/^v\d+$/i.test(s));
        if (nonVersionSegments.length < 2) break;

        const hasCamel = nonVersionSegments.some((s) => /[a-z][A-Z]/.test(s));
        const hasSnake = nonVersionSegments.some((s) => s.includes("_"));
        const hasKebab = nonVersionSegments.some((s) => s.includes("-"));
        const mixedCount = [hasCamel, hasSnake, hasKebab].filter(Boolean).length;

        if (mixedCount > 1) {
          findings.push(
            makeFinding(
              `Path "${path}" mixes casing conventions (camelCase, snake_case, kebab-case).`,
              "Use a consistent casing convention across all path segments."
            )
          );
        }
        break;
      }

      case "rest-no-deep-nesting": {
        const resourceSegments = getResourceSegments(path);
        if (resourceSegments.length > 3) {
          findings.push(
            makeFinding(
              `Path "${path}" has ${resourceSegments.length} levels of nesting (max recommended: 3).`,
              "Flatten the resource hierarchy or use query parameters."
            )
          );
        }
        break;
      }
    }

    return findings;
  }

  private runSpecLevelRule(ruleId: string, spec: OpenApiSpec, severity: Severity): LintFinding[] {
    const rule = BUILT_IN_RULES.find((r) => r.id === ruleId)!;
    if (!rule) return [];
    const findings: LintFinding[] = [];

    switch (ruleId) {
      case "rest-versioning": {
        const paths = Object.keys(spec.paths);
        const hasVersionInPath = paths.some((p) => /\/v\d+\//i.test(p));
        if (!hasVersionInPath) {
          findings.push({
            ruleId,
            ruleName: rule.name,
            category: rule.category,
            severity,
            path: "(global)",
            message: "API does not appear to have versioning in paths (e.g. /v1/).",
            suggestion: "Add API versioning via path prefix (e.g. /v1/) or via headers.",
          });
        }
        break;
      }

      case "rest-consistent-error-format": {
        const errorSchemas = new Set<string>();
        for (const pathItem of Object.values(spec.paths)) {
          for (const method of HTTP_METHODS) {
            const op = pathItem[method] as OperationObject | undefined;
            if (!op?.responses) continue;
            for (const [code, resp] of Object.entries(op.responses)) {
              const codeNum = parseInt(code, 10);
              if (codeNum >= 400 && resp.content) {
                for (const mediaType of Object.values(resp.content)) {
                  const schema = mediaType.schema;
                  if (schema) {
                    errorSchemas.add(JSON.stringify(schema));
                  }
                }
              }
            }
          }
        }
        if (errorSchemas.size > 3) {
          findings.push({
            ruleId,
            ruleName: rule.name,
            category: rule.category,
            severity,
            path: "(global)",
            message: `Found ${errorSchemas.size} different error response schemas. Error responses should use a consistent format.`,
            suggestion: "Define a shared error schema and reference it across all error responses.",
          });
        }
        break;
      }

      case "docs-missing-schema-description": {
        const schemas = spec.components?.schemas || spec.definitions || {};
        for (const [name, schema] of Object.entries(schemas)) {
          if (!schema.description) {
            findings.push({
              ruleId,
              ruleName: rule.name,
              category: rule.category,
              severity,
              path: `#/schemas/${name}`,
              message: `Schema "${name}" has no description.`,
              suggestion: "Add a description explaining what this schema represents.",
            });
          }
        }
        break;
      }

      case "naming-no-crud-operation-ids": {
        for (const [path, pathItem] of Object.entries(spec.paths)) {
          for (const method of HTTP_METHODS) {
            const op = pathItem[method] as OperationObject | undefined;
            if (!op?.operationId) continue;
            const opId = op.operationId.toLowerCase();
            for (const verb of CRUD_VERBS) {
              if (opId.startsWith(verb)) {
                findings.push({
                  ruleId,
                  ruleName: rule.name,
                  category: RuleCategory.Naming,
                  severity,
                  path,
                  method: method.toUpperCase(),
                  message: `Operation ID "${op.operationId}" starts with CRUD verb "${verb}".`,
                  suggestion: `Use a noun-based ID like "${op.operationId.slice(verb.length)}" and let the HTTP method convey the action.`,
                });
                break;
              }
            }
          }
        }
        break;
      }
    }

    return findings;
  }

  private runPolicyRule(
    ruleId: string,
    spec: OpenApiSpec,
    apiEntry: SwaggerApiEntry,
    severity: Severity
  ): LintFinding[] {
    const rule = BUILT_IN_RULES.find((r) => r.id === ruleId)!;
    if (!rule) return [];
    const findings: LintFinding[] = [];

    switch (ruleId) {
      case "policy-version-not-production": {
        const version = spec.info.version;
        if (isPreReleaseVersion(version)) {
          const isPublic = apiEntry.visibility === ApiVisibility.Public;
          const isPublished = apiEntry.publishStatus === ApiPublishStatus.Published;
          if (isPublic || isPublished) {
            const flags = [isPublic && "public", isPublished && "published"]
              .filter(Boolean)
              .join(" and ");
            findings.push({
              ruleId,
              ruleName: rule.name,
              category: rule.category,
              severity,
              path: "(global)",
              message: `API version "${version}" is pre-release but marked as ${flags}. Pre-release APIs should not be public/published.`,
              suggestion: `Set the API to private and unpublished, or update the version to 1.0.0 or higher.`,
            });
          }
        }
        break;
      }

      case "policy-missing-api-description": {
        const desc = spec.info.description;
        if (
          !desc ||
          desc.trim() === "" ||
          /^(No description|TODO|TBD|Description)\.?$/i.test(desc.trim())
        ) {
          findings.push({
            ruleId,
            ruleName: rule.name,
            category: rule.category,
            severity,
            path: "(global)",
            message: `API "${spec.info.title}" has no meaningful description in info.description.`,
            suggestion: "Add a description explaining the purpose and scope of this API.",
          });
        }
        break;
      }
    }

    return findings;
  }

  private deduplicateFindings(findings: LintFinding[]): LintFinding[] {
    const seen = new Set<string>();
    return findings.filter((f) => {
      const key = `${f.ruleId}::${f.path}::${f.method ?? ""}::${f.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
