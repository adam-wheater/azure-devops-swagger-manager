import * as jsYaml from "js-yaml";
import * as SDK from "azure-devops-extension-sdk";
import { OpenApiSpec, SwaggerApiEntry } from "../models/interfaces";

export class SwaggerFetchService {
  /**
   * Fetch and parse a spec.
   *
   * Per-API auth (`apiEntry.apiKey` / `apiEntry.authHeaderName`) overrides the
   * global values when provided.
   */
  async fetchSpec(
    url: string,
    globalApiKey: string,
    globalAuthHeaderName: string,
    apiEntry?: SwaggerApiEntry,
    signal?: AbortSignal
  ): Promise<OpenApiSpec> {
    const effectiveKey = apiEntry?.apiKey || globalApiKey;
    const effectiveHeader = apiEntry?.authHeaderName || globalAuthHeaderName || "X-API-Key";

    const headers: Record<string, string> = {
      Accept: "application/json, application/x-yaml, text/yaml, text/plain",
    };

    // Azure DevOps internal _apis URLs need SDK bearer-token auth
    if (this.isAzureDevOpsApiUrl(url)) {
      try {
        const token = await SDK.getAccessToken();
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
      } catch {
        // Fall through — the browser session cookie may still work inside the iframe
      }
    } else if (effectiveKey) {
      headers[effectiveHeader] = effectiveKey;
    }

    const response = await fetch(url, { headers, signal });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch Swagger spec from ${url}: ${response.status} ${response.statusText}`
      );
    }

    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();

    let spec: OpenApiSpec;

    if (contentType.includes("application/json") || contentType.includes("text/json")) {
      spec = JSON.parse(text);
    } else if (
      contentType.includes("yaml") ||
      contentType.includes("x-yaml") ||
      contentType.includes("text/plain")
    ) {
      spec = this.parseYamlOrJson(text, url);
    } else {
      // Content-type unknown — try JSON first, then YAML
      spec = this.parseYamlOrJson(text, url);
    }

    if (!spec.paths) {
      throw new Error(
        `Response from ${url} does not appear to be a valid OpenAPI/Swagger spec (no "paths" field).`
      );
    }

    return spec;
  }

  /** Try JSON parse; if it fails, try YAML; if both fail, throw. */
  private parseYamlOrJson(text: string, url: string): OpenApiSpec {
    try {
      return JSON.parse(text) as OpenApiSpec;
    } catch {
      // JSON failed — try YAML
    }

    try {
      const parsed = jsYaml.load(text) as OpenApiSpec;
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // YAML also failed
    }

    throw new Error(`Response from ${url} is not valid JSON or YAML.`);
  }

  /** Returns true when `url` points to an Azure DevOps internal REST API. */
  private isAzureDevOpsApiUrl(url: string): boolean {
    try {
      const u = new URL(url);
      return (
        (u.hostname.endsWith(".visualstudio.com") || u.hostname === "dev.azure.com") &&
        u.pathname.includes("/_apis/")
      );
    } catch {
      return false;
    }
  }

  getSpecVersion(spec: OpenApiSpec): string {
    if (spec.openapi) return spec.openapi;
    if (spec.swagger) return spec.swagger;
    return "unknown";
  }

  countEndpoints(spec: OpenApiSpec): number {
    let count = 0;
    const methods = ["get", "post", "put", "patch", "delete", "options", "head"];
    for (const pathItem of Object.values(spec.paths)) {
      for (const method of methods) {
        if (pathItem[method]) count++;
      }
    }
    return count;
  }
}
