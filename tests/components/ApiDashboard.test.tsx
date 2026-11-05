import * as React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ApiDashboard } from "@/components/ApiDashboard";
import { ApiScanSummary } from "@/models/interfaces";
import { DiscoveredApi } from "@/services/SwaggerDiscoveryService";
import { makeScanResult, paymentsApi, usersApi } from "./fixtures";

type Props = React.ComponentProps<typeof ApiDashboard>;

function renderDashboard(overrides: Partial<Props> = {}) {
  const props: Props = {
    apis: [usersApi, paymentsApi],
    scanResults: new Map(),
    persistedSummaries: {},
    scanning: false,
    progress: null,
    scanErrors: new Map(),
    onScanAll: jest.fn(),
    onCancelScan: jest.fn(),
    onScanOne: jest.fn(),
    onSelectApi: jest.fn(),
    isAdmin: true,
    onDiscover: jest.fn(),
    discovering: false,
    discoveredApis: [],
    onImportDiscovered: jest.fn(),
    discoveryError: null,
    ...overrides,
  };
  render(<ApiDashboard {...props} />);
  return props;
}

const summary = (apiId: string, scannedAt: string): ApiScanSummary => ({
  apiId,
  scannedAt,
  endpointCount: 18,
  findingCounts: { critical: 1, high: 2, medium: 0, low: 0, info: 0 },
  totalFindings: 3,
});

const discovered: DiscoveredApi = {
  repoId: "repo-1",
  repoName: "orders-service",
  filePath: "/docs/openapi.yaml",
  rawUrl: "https://dev.azure.com/contoso/proj/_apis/git/repos/repo-1/items?path=/docs/openapi.yaml",
  suggestedName: "Orders Service",
  branch: "main",
};

describe("ApiDashboard", () => {
  describe("with no registered APIs", () => {
    it("offers discovery to admins", () => {
      const props = renderDashboard({ apis: [] });
      expect(screen.getByText("No Swagger APIs registered yet.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Discover APIs in Repositories" }));
      expect(props.onDiscover).toHaveBeenCalledTimes(1);
    });

    it("tells non-admins to contact an admin", () => {
      renderDashboard({ apis: [], isAdmin: false });
      expect(
        screen.getByText("Contact an admin to register Swagger API endpoints.")
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Discover/ })).not.toBeInTheDocument();
    });

    it("shows the discovery error", () => {
      renderDashboard({ apis: [], discoveryError: "No repositories found" });
      expect(screen.getByRole("alert")).toHaveTextContent("No repositories found");
    });
  });

  describe("with live scan results", () => {
    it("shows summary metrics and per-API issue counts", () => {
      renderDashboard({ scanResults: new Map([[usersApi.id, makeScanResult()]]) });
      expect(screen.getByText("APIs Scanned")).toBeInTheDocument();
      expect(screen.getByText("Total Issues")).toBeInTheDocument();
      expect(screen.getByText("3 issues")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Rescan" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Scan" })).toBeInTheDocument();
    });

    it("scans one API from its row", () => {
      const props = renderDashboard({ scanResults: new Map([[usersApi.id, makeScanResult()]]) });
      fireEvent.click(screen.getByRole("button", { name: "Scan" }));
      expect(props.onScanOne).toHaveBeenCalledWith(paymentsApi.id);
    });

    it("marks a clean API as Clean", () => {
      renderDashboard({
        scanResults: new Map([[usersApi.id, makeScanResult(usersApi, [])]]),
      });
      expect(screen.getByText("Clean")).toBeInTheDocument();
    });

    it("opens an API when its name is clicked", () => {
      const props = renderDashboard();
      fireEvent.click(screen.getByRole("button", { name: "Payments API" }));
      expect(props.onSelectApi).toHaveBeenCalledWith(paymentsApi.id);
    });
  });

  describe("with persisted summaries", () => {
    it("shows persisted counts without a stale warning for recent data", () => {
      renderDashboard({
        persistedSummaries: { [usersApi.id]: summary(usersApi.id, new Date().toISOString()) },
      });
      expect(screen.getByText("3 issues")).toBeInTheDocument();
      expect(screen.getByText("1 critical · 2 high")).toBeInTheDocument();
      expect(screen.queryByText(/more than 24 hours old/)).not.toBeInTheDocument();
    });

    it("warns when the persisted data is more than 24 hours old", () => {
      renderDashboard({
        persistedSummaries: { [usersApi.id]: summary(usersApi.id, "2020-01-01T00:00:00Z") },
      });
      expect(screen.getByText(/more than 24 hours old/)).toBeInTheDocument();
    });
  });

  describe("while scanning", () => {
    it("shows progress and a Cancel button, and disables per-row scans", () => {
      const props = renderDashboard({
        scanning: true,
        progress: { phase: "Scanning Users API", current: 1, total: 2 },
      });
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
      expect(screen.getByText("Scanning Users API")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Scan All APIs" })).not.toBeInTheDocument();
      screen.getAllByRole("button", { name: "Scan" }).forEach((b) => expect(b).toBeDisabled());
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(props.onCancelScan).toHaveBeenCalledTimes(1);
    });
  });

  it("shows a per-API scan error inline", () => {
    renderDashboard({ scanErrors: new Map([[usersApi.id, "Failed to scan Users API: HTTP 401"]]) });
    expect(screen.getByRole("alert")).toHaveTextContent("Failed to scan Users API: HTTP 401");
  });

  it("starts a full scan", () => {
    const props = renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: "Scan All APIs" }));
    expect(props.onScanAll).toHaveBeenCalledTimes(1);
  });

  describe("discovery", () => {
    it("lists discovered specs and imports one", () => {
      const props = renderDashboard({ discoveredApis: [discovered] });
      const row = screen.getByText("orders-service").closest("tr") as HTMLElement;
      fireEvent.click(within(row).getByRole("button", { name: "Import" }));
      expect(props.onImportDiscovered).toHaveBeenCalledWith(discovered);
    });

    it("disables Import for a spec that is already registered", () => {
      renderDashboard({
        apis: [{ ...usersApi, url: discovered.rawUrl }],
        discoveredApis: [discovered],
      });
      expect(screen.getByRole("button", { name: "Added" })).toBeDisabled();
    });

    it("hides discovery from non-admins", () => {
      renderDashboard({ isAdmin: false, discoveredApis: [discovered] });
      expect(screen.queryByText("orders-service")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Discover More APIs" })).not.toBeInTheDocument();
    });
  });
});
