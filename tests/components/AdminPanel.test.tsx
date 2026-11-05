import * as React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import { AdminPanel } from "@/components/AdminPanel";
import { AdminDocument } from "@/models/interfaces";

const adminDoc: AdminDocument = {
  id: "admin",
  claimedBy: "owner-1",
  claimedAt: "2026-01-01T00:00:00Z",
  version: 1,
  admins: [
    {
      userId: "owner-1",
      displayName: "Olive Owner",
      addedAt: "2026-01-01T00:00:00Z",
      addedBy: "owner-1",
    },
    {
      userId: "admin-2",
      displayName: "Alex Admin",
      addedAt: "2026-02-01T00:00:00Z",
      addedBy: "owner-1",
    },
    {
      userId: "admin-3",
      displayName: "Sam Admin",
      addedAt: "2026-02-02T00:00:00Z",
      addedBy: "admin-2",
    },
  ],
};

type Props = React.ComponentProps<typeof AdminPanel>;

function renderPanel(overrides: Partial<Props> = {}) {
  const props: Props = {
    adminDoc,
    currentUserId: "admin-2",
    onAddAdmin: jest.fn().mockResolvedValue(undefined),
    onRemoveAdmin: jest.fn().mockResolvedValue(undefined),
    error: null,
    ...overrides,
  };
  render(<AdminPanel {...props} />);
  return props;
}

describe("AdminPanel", () => {
  it("lists admins, marks the owner and the current user", () => {
    renderPanel();
    expect(screen.getByText("Olive Owner", { selector: "td:not(.ax-muted)" })).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("(you)")).toBeInTheDocument();
    expect(screen.getByText("Self")).toBeInTheDocument();
  });

  it("names who added each admin, not their user id", () => {
    renderPanel();
    // admin-2 was added by owner-1 and admin-3 by admin-2.
    expect(screen.getByText("Olive Owner", { selector: "td.ax-muted" })).toBeInTheDocument();
    expect(screen.getByText("Alex Admin", { selector: "td.ax-muted" })).toBeInTheDocument();
    expect(screen.queryByText("owner-1")).toBeNull();
  });

  it("only offers Remove for admins other than the owner and yourself", () => {
    renderPanel();
    expect(screen.getAllByRole("button", { name: /^Remove/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Remove Sam Admin" })).toBeInTheDocument();
  });

  it("confirms before removing an admin", async () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Remove Sam Admin" }));
    expect(screen.getByRole("dialog", { name: "Remove admin" })).toBeInTheDocument();
    expect(props.onRemoveAdmin).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Remove" }).pop()!);
    });
    expect(props.onRemoveAdmin).toHaveBeenCalledWith("admin-3");
  });

  it("does not remove anyone when the dialog is cancelled", () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Remove Sam Admin" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onRemoveAdmin).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("requires both a user id and a display name to add an admin", async () => {
    const props = renderPanel();
    fireEvent.change(screen.getByLabelText("User ID"), { target: { value: "new-user" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Admin" }));
    expect(
      await screen.findByText("Both User ID and Display Name are required.")
    ).toBeInTheDocument();
    expect(props.onAddAdmin).not.toHaveBeenCalled();
  });

  it("adds an admin and clears the form", async () => {
    const props = renderPanel();
    fireEvent.change(screen.getByLabelText("User ID"), { target: { value: " new-user " } });
    fireEvent.change(screen.getByLabelText("Display Name"), { target: { value: " Nina New " } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add Admin" }));
    });
    expect(props.onAddAdmin).toHaveBeenCalledWith("new-user", "Nina New");
    expect(screen.getByLabelText("User ID")).toHaveValue("");
  });

  it("shows an error handed down from the admin hook", () => {
    renderPanel({ error: 'User "Sam Admin" is already an admin.' });
    expect(screen.getByRole("alert")).toHaveTextContent('User "Sam Admin" is already an admin.');
  });

  describe("identity search", () => {
    const realFetch = global.fetch;
    afterEach(() => {
      global.fetch = realFetch;
    });

    it("searches the identity API after a pause and fills the form from a result", async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          value: [
            {
              id: "id-9",
              providerDisplayName: "Nina New",
              properties: { Account: { $value: "nina@contoso.example" } },
            },
          ],
        }),
      });
      global.fetch = fetchMock as unknown as typeof fetch;
      renderPanel();

      fireEvent.change(screen.getByLabelText("Search for a user"), { target: { value: "nin" } });
      const result = await screen.findByRole("button", { name: /Nina New/ });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain("filterValue=nin");
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer mock-access-token");
      expect(result).toHaveTextContent("nina@contoso.example");

      fireEvent.click(result);
      expect(screen.getByLabelText("User ID")).toHaveValue("id-9");
      expect(screen.getByLabelText("Display Name")).toHaveValue("Nina New");
      expect(screen.getByLabelText("Search for a user")).toHaveValue("");
    });

    it("does not search for fewer than two characters", async () => {
      const fetchMock = jest.fn();
      global.fetch = fetchMock as unknown as typeof fetch;
      renderPanel();
      fireEvent.change(screen.getByLabelText("Search for a user"), { target: { value: "n" } });
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
