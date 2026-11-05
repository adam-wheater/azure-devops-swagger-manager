import * as React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { CreateBugDialog } from "@/components/CreateBugDialog";
import { ThemeProvider } from "@/utils/theme";
import { LintFinding, Severity, RuleCategory } from "@/models/interfaces";

const mockCreateBug = jest.fn();
const mockGetAreaPaths = jest.fn();

jest.mock("@/services/WorkItemService", () => ({
  WorkItemService: jest.fn().mockImplementation(() => ({
    getAreaPaths: (...args: unknown[]) => mockGetAreaPaths(...args),
    createBug: (...args: unknown[]) => mockCreateBug(...args),
  })),
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const mockFinding: LintFinding = {
  ruleId: "naming-camelcase-params",
  ruleName: "camelCase Path Parameters",
  category: RuleCategory.Naming,
  severity: Severity.Medium,
  path: "/users/{User_Id}",
  method: "GET",
  message: 'Path parameter "{User_Id}" is not camelCase.',
  suggestion: 'Rename to "{userId}".',
};

function renderDialog(overrides: Partial<React.ComponentProps<typeof CreateBugDialog>> = {}) {
  const props = {
    finding: mockFinding,
    apiName: "Test API",
    onClose: jest.fn(),
    onCreated: jest.fn(),
    ...overrides,
  };
  renderWithTheme(<CreateBugDialog {...props} />);
  return props;
}

beforeEach(() => {
  mockGetAreaPaths.mockReset().mockResolvedValue([]);
  mockCreateBug.mockReset().mockResolvedValue({
    id: 123,
    url: "https://dev.azure.com/contoso/project/_workitems/edit/123",
  });
});

describe("CreateBugDialog", () => {
  it("renders the dialog with finding info", async () => {
    renderDialog();
    expect(
      screen.getByRole("dialog", { name: "Create Bug from Lint Finding" })
    ).toBeInTheDocument();
    expect(screen.getByText(mockFinding.ruleName)).toBeInTheDocument();
    expect(screen.getByText(mockFinding.message)).toBeInTheDocument();
    await waitFor(() => expect(mockGetAreaPaths).toHaveBeenCalled());
  });

  it("pre-fills the title with finding info", async () => {
    renderDialog();
    expect(screen.getByLabelText("Title")).toHaveValue(
      "[Swagger Lint] camelCase Path Parameters: /users/{User_Id} (GET)"
    );
    await waitFor(() => expect(mockGetAreaPaths).toHaveBeenCalled());
  });

  it("calls onClose when Cancel is clicked", async () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockGetAreaPaths).toHaveBeenCalled());
  });

  it("calls onClose when the close button is clicked", async () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockGetAreaPaths).toHaveBeenCalled());
  });

  it("calls onClose when Escape is pressed", async () => {
    const { onClose } = renderDialog();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockGetAreaPaths).toHaveBeenCalled());
  });

  it("shows error when title is empty and Create Bug is clicked", async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Bug" }));
    expect(await screen.findByText("Title is required.")).toBeInTheDocument();
    expect(mockCreateBug).not.toHaveBeenCalled();
  });

  it("shows the severity label", async () => {
    renderDialog();
    expect(screen.getByText("Medium")).toBeInTheDocument();
    await waitFor(() => expect(mockGetAreaPaths).toHaveBeenCalled());
  });

  it("rejects a non-numeric parent id", async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/Parent Work Item ID/), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Bug" }));
    expect(await screen.findByText("Parent ID must be a number.")).toBeInTheDocument();
    expect(mockCreateBug).not.toHaveBeenCalled();
  });

  it("creates the bug with mapped severity, priority, area and parent", async () => {
    mockGetAreaPaths.mockResolvedValue(["Contoso\\Platform", "Contoso\\Web"]);
    const { onCreated } = renderDialog();

    const areaSelect = await screen.findByLabelText("Area Path");
    expect(areaSelect).toHaveValue("Contoso\\Platform");
    fireEvent.change(areaSelect, { target: { value: "Contoso\\Web" } });
    fireEvent.change(screen.getByLabelText(/Parent Work Item ID/), { target: { value: "42" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Bug" }));

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 123 }))
    );
    expect(mockCreateBug).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "3 - Medium",
        priority: 3,
        tags: "swagger-lint",
        areaPath: "Contoso\\Web",
        parentId: 42,
      })
    );
  });

  it("escapes spec text in the HTML description", async () => {
    renderDialog({
      finding: { ...mockFinding, message: "Bad <script>alert(1)</script> path" },
      apiName: "R&D <API>",
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Bug" }));

    await waitFor(() => expect(mockCreateBug).toHaveBeenCalled());
    const { description } = mockCreateBug.mock.calls[0][0];
    expect(description).toContain("R&amp;D &lt;API&gt;");
    expect(description).toContain("&lt;script&gt;");
    expect(description).not.toContain("<script>");
  });

  it("shows the service error when creation fails", async () => {
    mockCreateBug.mockRejectedValue(new Error("TF401019: no permission"));
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Create Bug" }));
    expect(await screen.findByText("TF401019: no permission")).toBeInTheDocument();
  });
});
