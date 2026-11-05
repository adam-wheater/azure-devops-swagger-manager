import * as React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { App } from "@/components/App";
import { ThemeProvider } from "@/utils/theme";
import { ADMIN_DOC_ID, GLOBAL_SETTINGS_DOC_ID, SWAGGER_APIS_DOC_ID } from "@/utils/constants";
import { __setMockService, __resetMockServices } from "../__mocks__/azure-devops-extension-sdk";
import { CommonServiceIds } from "../__mocks__/azure-devops-extension-api";
import { usersApi } from "./fixtures";

let documents: Record<string, any> = {};

const dataManager = {
  getDocument: jest.fn(async (_collection: string, id: string) => {
    if (documents[id]) return JSON.parse(JSON.stringify(documents[id]));
    throw { status: 404, message: "Document not found" };
  }),
  setDocument: jest.fn(async (_collection: string, doc: any) => {
    documents[doc.id] = JSON.parse(JSON.stringify(doc));
    return doc;
  }),
  createDocument: jest.fn(async (_collection: string, doc: any) => {
    if (documents[doc.id]) throw { status: 409, message: "Document already exists" };
    documents[doc.id] = JSON.parse(JSON.stringify(doc));
    return doc;
  }),
};

const adminDoc = (userId: string) => ({
  id: ADMIN_DOC_ID,
  claimedBy: userId,
  claimedAt: "2026-01-01T00:00:00Z",
  version: 1,
  admins: [{ userId, displayName: "Test User", addedAt: "2026-01-01T00:00:00Z", addedBy: userId }],
});

function renderApp() {
  return render(
    <ThemeProvider>
      <App />
    </ThemeProvider>
  );
}

beforeEach(() => {
  documents = {};
  __resetMockServices();
  __setMockService(CommonServiceIds.ExtensionDataService, {
    getExtensionDataManager: async () => dataManager,
  });
  // A first-time read seeds auto-scan on, which would start fetching the fixture URLs.
  documents[GLOBAL_SETTINGS_DOC_ID] = {
    id: GLOBAL_SETTINGS_DOC_ID,
    apiKey: "",
    authHeaderName: "X-API-Key",
    autoScanOnLoad: false,
    refreshIntervalMinutes: 0,
    apiKeySource: "direct",
    version: 1,
  };
  jest.clearAllMocks();
});

describe("App", () => {
  it("shows a loading gate while access and settings load", async () => {
    renderApp();
    expect(screen.getByText("Loading Swagger Manager")).toBeInTheDocument();
    // Let the loads settle so no state update lands after the test ends.
    expect(await screen.findByRole("button", { name: "Claim Admin" })).toBeInTheDocument();
  });

  it("shows the claim page when nobody has claimed the extension, then opens the app", async () => {
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Claim Admin" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Swagger Manager" })
    ).toBeInTheDocument();
    expect(documents[ADMIN_DOC_ID].claimedBy).toBe("mock-user-id");
    expect(screen.getByRole("tab", { name: "Admin" })).toBeInTheDocument();
  });

  it("gives an admin every tab, with the API count on the dashboard", async () => {
    documents[ADMIN_DOC_ID] = adminDoc("mock-user-id");
    documents[SWAGGER_APIS_DOC_ID] = { id: SWAGGER_APIS_DOC_ID, apis: [usersApi], version: 1 };
    renderApp();

    expect(await screen.findByRole("tab", { name: /API Dashboard/ })).toHaveTextContent("1");
    for (const name of ["API Analysis", "Lint Rules", "Settings", "Admin"]) {
      expect(screen.getByRole("tab", { name })).toBeInTheDocument();
    }
    expect(screen.getByText("Admin", { selector: ".ax-pill" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scan All APIs" })).toBeInTheDocument();
    expect(screen.queryByText("Read-only access")).not.toBeInTheDocument();
  });

  it("gives a non-admin a read-only view without Settings or Admin", async () => {
    documents[ADMIN_DOC_ID] = adminDoc("someone-else");
    renderApp();

    expect(await screen.findByText("Read-only access")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Lint Rules" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Admin" })).not.toBeInTheDocument();
    expect(
      screen.getByText("Contact an admin to register Swagger API endpoints.")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Read-only access")).not.toBeInTheDocument();
  });

  it("switches between tabs", async () => {
    documents[ADMIN_DOC_ID] = adminDoc("mock-user-id");
    renderApp();

    fireEvent.click(await screen.findByRole("tab", { name: "Lint Rules" }));
    expect(screen.getByText(/^Lint Rules \(\d+\)$/)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Lint Rules" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
    expect(screen.getByText("Global settings")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Admin" }));
    await waitFor(() => expect(screen.getByText("Add an admin")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("tab", { name: "API Analysis" }));
    expect(screen.getByText("No scan results yet.")).toBeInTheDocument();
  });
});
