// ===== Severity & Rule Categories =====

export enum Severity {
  Critical = "critical",
  High = "high",
  Medium = "medium",
  Low = "low",
}

export enum RuleCategory {
  Naming = "naming",
  RestPractices = "rest-practices",
  Documentation = "documentation",
  Policy = "policy",
}

// ===== OpenAPI Spec Types =====

export interface OpenApiSpec {
  openapi?: string;
  swagger?: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, SchemaObject>;
  };
  definitions?: Record<string, SchemaObject>; // Swagger 2.0
}

export interface PathItem {
  get?: OperationObject;
  post?: OperationObject;
  put?: OperationObject;
  patch?: OperationObject;
  delete?: OperationObject;
  options?: OperationObject;
  head?: OperationObject;
  [key: string]: any;
}

export interface OperationObject {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject;
  responses?: Record<string, ResponseObject>;
  [key: string]: any;
}

export interface ParameterObject {
  name: string;
  in: string;
  description?: string;
  required?: boolean;
  schema?: SchemaObject;
  [key: string]: any;
}

export interface RequestBodyObject {
  description?: string;
  required?: boolean;
  content?: Record<string, MediaTypeObject>;
}

export interface MediaTypeObject {
  schema?: SchemaObject;
  example?: any;
}

export interface ResponseObject {
  description?: string;
  content?: Record<string, MediaTypeObject>;
}

export interface SchemaObject {
  type?: string;
  properties?: Record<string, SchemaObject>;
  description?: string;
  example?: any;
  [key: string]: any;
}

// ===== Lint Finding =====

export interface LintFinding {
  ruleId: string;
  ruleName: string;
  category: RuleCategory;
  severity: Severity;
  path: string;
  method?: string;
  message: string;
  suggestion?: string;
}

// ===== Lint Rule Definition =====

export interface LintRule {
  id: string;
  name: string;
  description: string;
  category: RuleCategory;
  defaultSeverity: Severity;
}

export interface LintRuleOverride {
  ruleId: string;
  enabled: boolean;
  severity?: Severity;
  order?: number;
}

// ===== API Key Source =====

export enum ApiKeySource {
  Direct = "direct",
  VariableGroup = "variableGroup",
}

export interface VariableGroupRef {
  groupId: number;
  groupName: string;
  variableName: string;
}

// ===== API Registration =====

export enum ApiVisibility {
  Public = "public",
  Private = "private",
}

export enum ApiPublishStatus {
  Published = "published",
  Unpublished = "unpublished",
}

export interface SwaggerApiEntry {
  id: string;
  name: string;
  url: string;
  addedAt: string;
  addedBy: string;
  visibility: ApiVisibility;
  publishStatus: ApiPublishStatus;
  lastScannedAt?: string;
  lastFindingCount?: number;
  lastEndpointCount?: number;
  /** Per-API authentication key — overrides the global API key when set. */
  apiKey?: string;
  /** Per-API auth header name — overrides the global auth header when set. */
  authHeaderName?: string;
}

// ===== Scan Result =====

export interface ApiScanResult {
  api: SwaggerApiEntry;
  spec: OpenApiSpec;
  findings: LintFinding[];
  endpointCount: number;
  scannedAt: Date;
}

export interface ScanProgress {
  phase: string;
  current: number;
  total: number;
}

export interface ApiScanSummary {
  apiId: string;
  scannedAt: string;
  endpointCount: number;
  findingCounts: { critical: number; high: number; medium: number; low: number; info: number };
  totalFindings: number;
}

// ===== Bug Mapping =====

export interface BugMappingEntry {
  findingKey: string; // ruleId::path::method
  bugId: number;
  bugUrl: string;
}

// ===== Persisted Scan Findings =====

export interface PersistedScanFindings {
  apiId: string;
  findings: LintFinding[];
  scannedAt: string;
}

// ===== Bug Mapping Document =====

export interface BugMappingDocument {
  id: string;
  mappings: BugMappingEntry[];
  version: number;
}

// ===== Persisted Scan Findings Document =====

export interface PersistedScanFindingsDocument {
  id: string;
  findings: Record<string, PersistedScanFindings>;
  version: number;
}

// ===== Identity Picker =====

export interface IdentitySearchResult {
  id: string;
  displayName: string;
  uniqueName?: string;
  imageUrl?: string;
}

// ===== Admin =====

export interface AdminEntry {
  userId: string;
  displayName: string;
  addedAt: string;
  addedBy: string;
}

export interface AdminDocument {
  id: string;
  claimedBy: string;
  claimedAt: string;
  admins: AdminEntry[];
  version: number;
}

// ===== Settings Documents =====

export interface GlobalSettingsDocument {
  id: string;
  apiKey: string;
  authHeaderName: string;
  autoScanOnLoad: boolean;
  /** Periodic refresh interval in minutes (0 = disabled). */
  refreshIntervalMinutes: number;
  apiKeySource: ApiKeySource;
  variableGroupRef?: VariableGroupRef;
  version: number;
}

export interface SwaggerApisDocument {
  id: string;
  apis: SwaggerApiEntry[];
  version: number;
}

export interface LintRuleOverridesDocument {
  id: string;
  overrides: LintRuleOverride[];
  version: number;
}
