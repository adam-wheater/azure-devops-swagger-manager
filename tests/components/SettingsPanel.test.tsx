import * as React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ApiKeySource, GlobalSettingsDocument } from "@/models/interfaces";
import { paymentsApi, usersApi } from "./fixtures";

const mockListGroups = jest.fn();

jest.mock("@/services/VariableGroupService", () => ({
  VariableGroupService: jest.fn().mockImplementation(() => ({
    listVariableGroups: (...args: unknown[]) => mockListGroups(...args),
  })),
}));

const settingsDoc: GlobalSettingsDocument = {
  id: "global-settings",
  apiKey: "k-123",
  authHeaderName: "X-API-Key",
  autoScanOnLoad: false,
  refreshIntervalMinutes: 5,
  apiKeySource: ApiKeySource.Direct,
  version: 1,
};

type Props = React.ComponentProps<typeof SettingsPanel>;

function renderPanel(overrides: Partial<Props> = {}) {
  const props: Props = {
    globalSettings: settingsDoc,
    apis: [usersApi, paymentsApi],
    currentUserId: "user-1",
    onSaveSettings: jest.fn().mockResolvedValue(undefined),
    onAddApi: jest.fn().mockResolvedValue(undefined),
    onRemoveApi: jest.fn().mockResolvedValue(undefined),
    onUpdateApi: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<SettingsPanel {...props} />);
  return props;
}

beforeEach(() => {
  mockListGroups
    .mockReset()
    .mockResolvedValue([
      { id: 7, name: "Swagger Keys", variableNames: ["UsersKey", "PaymentsKey"] },
    ]);
});

describe("SettingsPanel global settings", () => {
  it("loads the current values and hides the key", () => {
    renderPanel();
    expect(screen.getByLabelText("API Key")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("API Key")).toHaveValue("k-123");
    expect(screen.getByLabelText("Auth Header Name")).toHaveValue("X-API-Key");
    expect(screen.getByLabelText("Auto-refresh Interval (minutes)")).toHaveValue(5);
  });

  it("saves a direct key and clears any variable group reference", async () => {
    const props = renderPanel();
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "new-key" } });
    fireEvent.click(screen.getByLabelText("Auto-scan APIs when opening the extension"));
    fireEvent.change(screen.getByLabelText("Auto-refresh Interval (minutes)"), {
      target: { value: "90" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));
    });

    expect(props.onSaveSettings).toHaveBeenCalledWith({
      authHeaderName: "X-API-Key",
      autoScanOnLoad: true,
      refreshIntervalMinutes: 60,
      apiKeySource: ApiKeySource.Direct,
      apiKey: "new-key",
      variableGroupRef: undefined,
    });
    expect(await screen.findByText("Saved!")).toBeInTheDocument();
  });

  it("reads the key from a library variable group when asked", async () => {
    const props = renderPanel();
    fireEvent.click(screen.getByLabelText("Library Variable Group"));
    expect(screen.queryByLabelText("API Key")).not.toBeInTheDocument();

    const group = await screen.findByLabelText("Variable Group");
    await waitFor(() => expect(group).toBeEnabled());
    fireEvent.change(group, { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Variable Name"), { target: { value: "UsersKey" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));
    });

    expect(props.onSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeySource: ApiKeySource.VariableGroup,
        apiKey: "",
        variableGroupRef: { groupId: 7, groupName: "Swagger Keys", variableName: "UsersKey" },
      })
    );
  });

  it("shows why variable groups could not be loaded", async () => {
    mockListGroups.mockRejectedValue(new Error("TF400813: not authorized"));
    renderPanel();
    fireEvent.click(screen.getByLabelText("Library Variable Group"));
    expect(await screen.findByText("TF400813: not authorized")).toBeInTheDocument();
  });
});

describe("SettingsPanel registered APIs", () => {
  it("lists the APIs with their visibility and status", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "Users API" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Public" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Published" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Private" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unpublished" })).toBeInTheDocument();
  });

  it("toggles visibility and publish status", () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Public" }));
    expect(props.onUpdateApi).toHaveBeenCalledWith(usersApi.id, { visibility: "private" });
    fireEvent.click(screen.getByRole("button", { name: "Unpublished" }));
    expect(props.onUpdateApi).toHaveBeenCalledWith(paymentsApi.id, { publishStatus: "published" });
  });

  it("renames an API inline and cancels on Escape", async () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Users API" }));
    const input = screen.getByLabelText("New name for Users API");
    fireEvent.change(input, { target: { value: "Accounts API" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(props.onUpdateApi).toHaveBeenCalledWith(usersApi.id, { name: "Accounts API" });

    fireEvent.click(screen.getByRole("button", { name: "Payments API" }));
    fireEvent.keyDown(screen.getByLabelText("New name for Payments API"), { key: "Escape" });
    expect(screen.queryByLabelText("New name for Payments API")).not.toBeInTheDocument();
  });

  it("asks for confirmation before removing an API", async () => {
    const props = renderPanel();
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    expect(screen.getByRole("dialog", { name: "Remove API" })).toBeInTheDocument();
    expect(props.onRemoveApi).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onRemoveApi).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Remove" }).pop()!);
    });
    expect(props.onRemoveApi).toHaveBeenCalledWith(usersApi.id);
  });

  it("validates the new API before adding it", async () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Add API" }));
    expect(await screen.findByText("Both name and URL are required.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("API Name"), { target: { value: "Orders" } });
    fireEvent.change(screen.getByLabelText("Swagger URL"), { target: { value: "not a url" } });
    fireEvent.click(screen.getByRole("button", { name: "Add API" }));
    expect(await screen.findByText("Invalid URL format.")).toBeInTheDocument();
    expect(props.onAddApi).not.toHaveBeenCalled();
  });

  it("adds a valid API as private and unpublished, then clears the form", async () => {
    const props = renderPanel({ apis: [] });
    fireEvent.change(screen.getByLabelText("API Name"), { target: { value: " Orders " } });
    fireEvent.change(screen.getByLabelText("Swagger URL"), {
      target: { value: "https://orders.contoso.example/swagger.json" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add API" }));
    });

    expect(props.onAddApi).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Orders",
        url: "https://orders.contoso.example/swagger.json",
        addedBy: "user-1",
        visibility: "private",
        publishStatus: "unpublished",
      })
    );
    expect(screen.getByLabelText("API Name")).toHaveValue("");
  });

  it("shows the service error when adding fails", async () => {
    renderPanel({
      apis: [],
      onAddApi: jest.fn().mockRejectedValue(new Error('API with URL "x" already exists.')),
    });
    fireEvent.change(screen.getByLabelText("API Name"), { target: { value: "Orders" } });
    fireEvent.change(screen.getByLabelText("Swagger URL"), {
      target: { value: "https://orders.contoso.example/swagger.json" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add API" }));
    });
    expect(await screen.findByText('API with URL "x" already exists.')).toBeInTheDocument();
  });
});
