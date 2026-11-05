import { SwaggerFetchService } from "@/services/SwaggerFetchService";
import { OpenApiSpec } from "@/models/interfaces";

describe("SwaggerFetchService", () => {
  let service: SwaggerFetchService;

  beforeEach(() => {
    service = new SwaggerFetchService();
  });

  describe("getSpecVersion", () => {
    it("returns OpenAPI version", () => {
      const spec = { openapi: "3.0.0", info: { title: "Test", version: "1.0" }, paths: {} };
      expect(service.getSpecVersion(spec)).toBe("3.0.0");
    });

    it("returns Swagger version", () => {
      const spec = { swagger: "2.0", info: { title: "Test", version: "1.0" }, paths: {} };
      expect(service.getSpecVersion(spec)).toBe("2.0");
    });

    it("returns unknown for missing version", () => {
      const spec = { info: { title: "Test", version: "1.0" }, paths: {} } as OpenApiSpec;
      expect(service.getSpecVersion(spec)).toBe("unknown");
    });
  });

  describe("countEndpoints", () => {
    it("counts all operations", () => {
      const spec: OpenApiSpec = {
        openapi: "3.0.0",
        info: { title: "Test", version: "1.0" },
        paths: {
          "/users": {
            get: { responses: {} },
            post: { responses: {} },
          },
          "/users/{id}": {
            get: { responses: {} },
            put: { responses: {} },
            delete: { responses: {} },
          },
        },
      };
      expect(service.countEndpoints(spec)).toBe(5);
    });

    it("returns 0 for empty paths", () => {
      const spec: OpenApiSpec = {
        openapi: "3.0.0",
        info: { title: "Test", version: "1.0" },
        paths: {},
      };
      expect(service.countEndpoints(spec)).toBe(0);
    });

    it("ignores non-method keys", () => {
      const spec: OpenApiSpec = {
        openapi: "3.0.0",
        info: { title: "Test", version: "1.0" },
        paths: {
          "/users": {
            get: { responses: {} },
            parameters: [{ name: "id", in: "path" }],
          },
        },
      };
      expect(service.countEndpoints(spec)).toBe(1);
    });
  });
});
