import { Severity, RuleCategory, LintRule } from "../models/interfaces";
import type { Tone } from "../components/ui";

// ===== Storage Constants =====

export const SETTINGS_COLLECTION = "SwaggerManagerSettings";
export const GLOBAL_SETTINGS_DOC_ID = "global-settings";
export const SWAGGER_APIS_DOC_ID = "swagger-apis";
export const LINT_OVERRIDES_DOC_ID = "lint-rule-overrides";
export const SCAN_SUMMARIES_DOC_ID = "scan-summaries";
export const ADMIN_DOC_ID = "admin";
export const BUG_MAPPING_DOC_ID = "bug-mapping";
export const SCAN_FINDINGS_DOC_ID = "scan-findings";
export const SETTINGS_VERSION = 1;

// ===== Severity Helpers =====

export const SEVERITY_ORDER: Record<Severity, number> = {
  [Severity.Critical]: 0,
  [Severity.High]: 1,
  [Severity.Medium]: 2,
  [Severity.Low]: 3,
};

/** Pill tone per severity. Critical is red, High amber, Medium blue, Low neutral. */
export const SEVERITY_TONE: Record<Severity, Tone> = {
  [Severity.Critical]: "critical",
  [Severity.High]: "warn",
  [Severity.Medium]: "info",
  [Severity.Low]: "neutral",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  [Severity.Critical]: "Critical",
  [Severity.High]: "High",
  [Severity.Medium]: "Medium",
  [Severity.Low]: "Low",
};

export const CATEGORY_LABEL: Record<RuleCategory, string> = {
  [RuleCategory.Naming]: "Naming",
  [RuleCategory.RestPractices]: "REST Practices",
  [RuleCategory.Documentation]: "Documentation",
  [RuleCategory.Policy]: "Policy",
};

// ===== Default Generated Description Patterns =====

export const DEFAULT_DESCRIPTION_PATTERNS: RegExp[] = [
  /^Success$/i,
  /^OK$/i,
  /^successful operation$/i,
  /^Returns? a list of/i,
  /^Returns? the/i,
  /^Gets? the/i,
  /^Gets? a list of/i,
  /^Creates? a new/i,
  /^Updates? an? existing/i,
  /^Deletes? an? existing/i,
  /^No content$/i,
  /^Bad request$/i,
  /^Not found$/i,
  /^Unauthorized$/i,
  /^Forbidden$/i,
  /^Internal server error$/i,
  /^Server error$/i,
  /^Error$/i,
  /^Default response$/i,
  // NSwag / Swashbuckle auto-generated
  /^A server side error occurred\.?$/i,
  /^Success\s*$/,
  /^$/, // empty string
];

// ===== Built-In Lint Rules =====

export const BUILT_IN_RULES: LintRule[] = [
  // ===== NAMING RULES (8) =====
  {
    id: "naming-camelcase-params",
    name: "camelCase Path Parameters",
    description: "Path parameters should use camelCase (e.g. {userId} not {user_id} or {UserId})",
    category: RuleCategory.Naming,
    defaultSeverity: Severity.Medium,
  },
  {
    id: "naming-plural-resources",
    name: "Plural Resource Names",
    description: "Resource names in paths should be plural (e.g. /users not /user)",
    category: RuleCategory.Naming,
    defaultSeverity: Severity.Medium,
  },
  {
    id: "naming-no-verbs-in-paths",
    name: "No Verbs in Paths",
    description: "Paths should not contain CRUD verbs (e.g. /users not /getUsers or /createUser)",
    category: RuleCategory.Naming,
    defaultSeverity: Severity.High,
  },
  {
    id: "naming-no-trailing-slash",
    name: "No Trailing Slashes",
    description: "Paths should not end with a trailing slash",
    category: RuleCategory.Naming,
    defaultSeverity: Severity.Low,
  },
  {
    id: "naming-kebab-case-paths",
    name: "Kebab-case Paths",
    description:
      "Path segments should use kebab-case (e.g. /user-profiles not /userProfiles or /user_profiles)",
    category: RuleCategory.Naming,
    defaultSeverity: Severity.Medium,
  },
  {
    id: "naming-no-file-extensions",
    name: "No File Extensions in Paths",
    description: "Paths should not contain file extensions (e.g. .json, .xml)",
    category: RuleCategory.Naming,
    defaultSeverity: Severity.Medium,
  },
  {
    id: "naming-no-crud-operation-ids",
    name: "No CRUD in Operation IDs",
    description: "Operation IDs should not start with CRUD verbs like get, create, update, delete",
    category: RuleCategory.Naming,
    defaultSeverity: Severity.Low,
  },
  {
    id: "naming-consistent-casing",
    name: "Consistent Path Casing",
    description: "All path segments (excluding parameters) should use the same casing convention",
    category: RuleCategory.Naming,
    defaultSeverity: Severity.Medium,
  },

  // ===== REST PRACTICES RULES (9) =====
  {
    id: "rest-correct-http-verbs",
    name: "Correct HTTP Verbs",
    description:
      "Endpoints should use appropriate HTTP verbs (GET for reading, POST for creating, PUT/PATCH for updating, DELETE for removing)",
    category: RuleCategory.RestPractices,
    defaultSeverity: Severity.High,
  },
  {
    id: "rest-no-body-on-get-delete",
    name: "No Request Body on GET/DELETE",
    description: "GET and DELETE operations should not define a request body",
    category: RuleCategory.RestPractices,
    defaultSeverity: Severity.High,
  },
  {
    id: "rest-body-on-post-put-patch",
    name: "Request Body on POST/PUT/PATCH",
    description: "POST, PUT and PATCH operations should define a request body",
    category: RuleCategory.RestPractices,
    defaultSeverity: Severity.Medium,
  },
  {
    id: "rest-proper-status-codes",
    name: "Proper Status Codes",
    description:
      "Operations should return appropriate status codes (201 for POST creation, 204 for DELETE, etc.)",
    category: RuleCategory.RestPractices,
    defaultSeverity: Severity.Medium,
  },
  {
    id: "rest-pagination-on-lists",
    name: "Pagination on List Endpoints",
    description:
      "GET endpoints returning collections should have pagination parameters (page, limit, offset, etc.)",
    category: RuleCategory.RestPractices,
    defaultSeverity: Severity.Medium,
  },
  {
    id: "rest-versioning",
    name: "API Versioning",
    description: "API should include versioning in the path (e.g. /v1/) or via headers",
    category: RuleCategory.RestPractices,
    defaultSeverity: Severity.Low,
  },
  {
    id: "rest-no-deep-nesting",
    name: "No Deeply Nested Resources",
    description: "Resource paths should not be nested more than 3 levels deep",
    category: RuleCategory.RestPractices,
    defaultSeverity: Severity.Medium,
  },
  {
    id: "rest-content-type-defined",
    name: "Content-Type Defined",
    description: "Operations with request/response bodies should define content types",
    category: RuleCategory.RestPractices,
    defaultSeverity: Severity.Medium,
  },
  {
    id: "rest-consistent-error-format",
    name: "Consistent Error Responses",
    description: "Error responses (4xx, 5xx) should follow a consistent schema",
    category: RuleCategory.RestPractices,
    defaultSeverity: Severity.Low,
  },

  // ===== DOCUMENTATION RULES (8) =====
  {
    id: "docs-default-descriptions",
    name: "Default/Generated Descriptions",
    description:
      "Detects auto-generated or placeholder descriptions that add no value (e.g. 'Success', 'OK', 'Returns a list of')",
    category: RuleCategory.Documentation,
    defaultSeverity: Severity.High,
  },
  {
    id: "docs-missing-operation-description",
    name: "Missing Operation Description",
    description: "Every operation should have a meaningful description or summary",
    category: RuleCategory.Documentation,
    defaultSeverity: Severity.High,
  },
  {
    id: "docs-missing-parameter-description",
    name: "Missing Parameter Description",
    description: "All parameters should have a description explaining their purpose",
    category: RuleCategory.Documentation,
    defaultSeverity: Severity.Medium,
  },
  {
    id: "docs-missing-response-description",
    name: "Missing Response Description",
    description: "All response codes should have a meaningful description",
    category: RuleCategory.Documentation,
    defaultSeverity: Severity.Medium,
  },
  {
    id: "docs-missing-schema-description",
    name: "Missing Schema Description",
    description: "Schema/model definitions should have descriptions",
    category: RuleCategory.Documentation,
    defaultSeverity: Severity.Low,
  },
  {
    id: "docs-missing-examples",
    name: "Missing Examples",
    description: "Operations should include request/response examples",
    category: RuleCategory.Documentation,
    defaultSeverity: Severity.Low,
  },
  {
    id: "docs-missing-tags",
    name: "Missing Tags",
    description: "Operations should have at least one tag for grouping",
    category: RuleCategory.Documentation,
    defaultSeverity: Severity.Medium,
  },
  {
    id: "docs-empty-summary",
    name: "Empty Summary",
    description: "Operations should have a non-empty summary field",
    category: RuleCategory.Documentation,
    defaultSeverity: Severity.Medium,
  },

  // ===== POLICY RULES (2) =====
  {
    id: "policy-version-not-production",
    name: "Pre-release Version Published",
    description:
      "APIs with pre-release versions (0.0.x, 0.x.x) should not be marked as public or published",
    category: RuleCategory.Policy,
    defaultSeverity: Severity.Critical,
  },
  {
    id: "policy-missing-api-description",
    name: "Missing API Description",
    description:
      "The API info.description field should contain a meaningful description of the API",
    category: RuleCategory.Policy,
    defaultSeverity: Severity.High,
  },
];
