import * as React from "react";
import { AdminDocument, IdentitySearchResult } from "../models/interfaces";
import * as SDK from "azure-devops-extension-sdk";
import { Banner, Button, Card, ConfirmDialog, IconTrash, Pill } from "./ui";

interface AdminPanelProps {
  adminDoc: AdminDocument;
  currentUserId: string;
  onAddAdmin: (userId: string, displayName: string) => Promise<void>;
  onRemoveAdmin: (userId: string) => Promise<void>;
  error: string | null;
}

async function searchIdentities(query: string): Promise<IdentitySearchResult[]> {
  if (!query || query.trim().length < 2) return [];
  try {
    const accessToken = await SDK.getAccessToken();
    const hostContext = SDK.getHost();
    let baseUrl: string;
    try {
      const pageService = await SDK.getService<any>("ms.vss-tfs-web.tfs-page-data-service");
      const pageData = await pageService.getProject();
      if (pageData?.collection?.uri) {
        baseUrl = pageData.collection.uri.replace(/\/+$/, "");
      } else {
        baseUrl = `https://dev.azure.com/${hostContext.name}`;
      }
    } catch {
      baseUrl = `https://dev.azure.com/${hostContext.name}`;
    }
    const url = `${baseUrl}/_apis/identities?searchFilter=General&filterValue=${encodeURIComponent(query)}&queryMembership=None&api-version=7.1`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return (data.value || []).map((identity: any) => ({
      id: identity.id,
      displayName: identity.providerDisplayName || identity.displayName || identity.id,
      uniqueName: identity.properties?.Account?.$value,
      imageUrl: identity.properties?.Icon?.$value,
    }));
  } catch {
    return [];
  }
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  adminDoc,
  currentUserId,
  onAddAdmin,
  onRemoveAdmin,
  error,
}) => {
  const [newUserId, setNewUserId] = React.useState("");
  const [newDisplayName, setNewDisplayName] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = React.useState<string | null>(null);

  // Identity search state
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<IdentitySearchResult[]>([]);
  const [searching, setSearching] = React.useState(false);
  const searchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    },
    []
  );

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (value.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchIdentities(value.trim());
        setSearchResults(results);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const handleSelectIdentity = (identity: IdentitySearchResult) => {
    setNewUserId(identity.id);
    setNewDisplayName(identity.displayName);
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleAdd = async () => {
    if (!newUserId.trim() || !newDisplayName.trim()) {
      setLocalError("Both User ID and Display Name are required.");
      return;
    }
    setAdding(true);
    setLocalError(null);
    try {
      await onAddAdmin(newUserId.trim(), newDisplayName.trim());
      setNewUserId("");
      setNewDisplayName("");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (userId: string) => {
    setPendingRemove(null);
    try {
      await onRemoveAdmin(userId);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  };

  const displayError = localError || error;
  const pendingAdmin = adminDoc.admins.find((a) => a.userId === pendingRemove);

  return (
    <div className="ax-stack">
      {displayError && (
        <Banner tone="error" onDismiss={localError ? () => setLocalError(null) : undefined}>
          {displayError}
        </Banner>
      )}

      <Card
        title="Admins"
        hint={`${adminDoc.admins.length} listed. The owner who first claimed the extension cannot be removed, and you cannot remove yourself.`}
        flush
      >
        <div className="ax-table-wrap">
          <table className="ax-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Added</th>
                <th>Added by</th>
                <th style={{ width: 120 }} aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {adminDoc.admins.map((admin) => (
                <tr key={admin.userId}>
                  <td>
                    {admin.displayName}
                    {admin.userId === adminDoc.claimedBy && (
                      <span style={{ marginLeft: 8 }}>
                        <Pill tone="accent">Owner</Pill>
                      </span>
                    )}
                    {admin.userId === currentUserId && (
                      <span className="ax-fine" style={{ marginLeft: 8 }}>
                        (you)
                      </span>
                    )}
                  </td>
                  <td className="ax-muted">{new Date(admin.addedAt).toLocaleDateString()}</td>
                  <td className="ax-muted">
                    {admin.addedBy === admin.userId
                      ? "Self"
                      : // Only the adder's user id is stored; show their name while they are still an admin.
                        (adminDoc.admins.find((a) => a.userId === admin.addedBy)?.displayName ??
                        admin.addedBy)}
                  </td>
                  <td className="ax-num">
                    {admin.userId !== adminDoc.claimedBy && admin.userId !== currentUserId && (
                      <Button
                        variant="danger"
                        size="sm"
                        icon={<IconTrash />}
                        onClick={() => setPendingRemove(admin.userId)}
                        aria-label={`Remove ${admin.displayName}`}
                      >
                        Remove
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Add an admin"
        hint="Search by name to fill in the user, or type the Azure DevOps user ID and display name directly."
      >
        <div className="ax-field">
          <label className="ax-label" htmlFor="admin-search">
            Search for a user
          </label>
          <div className="ax-row">
            <input
              id="admin-search"
              className="ax-input"
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Type a name to search..."
              style={{ width: 420, maxWidth: "100%" }}
            />
            {searching && <span className="ax-fine">Searching...</span>}
          </div>
          {searchResults.length > 0 && (
            <div className="ax-picker ax-stack" style={{ maxWidth: 420 }}>
              {searchResults.map((identity) => (
                <Button
                  key={identity.id}
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSelectIdentity(identity)}
                >
                  <strong>{identity.displayName}</strong>
                  {identity.uniqueName && <span className="ax-fine">({identity.uniqueName})</span>}
                </Button>
              ))}
            </div>
          )}
        </div>

        <div className="ax-row" style={{ alignItems: "flex-end" }}>
          <div className="ax-field" style={{ marginBottom: 0 }}>
            <label className="ax-label" htmlFor="admin-user-id">
              User ID
            </label>
            <input
              id="admin-user-id"
              className="ax-input"
              type="text"
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value)}
              placeholder="Azure DevOps User ID"
              style={{ width: 240 }}
            />
          </div>
          <div className="ax-field" style={{ marginBottom: 0 }}>
            <label className="ax-label" htmlFor="admin-display-name">
              Display Name
            </label>
            <input
              id="admin-display-name"
              className="ax-input"
              type="text"
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              placeholder="e.g. Alex Doe"
              style={{ width: 220 }}
            />
          </div>
          <Button variant="primary" onClick={handleAdd} busy={adding}>
            {adding ? "Adding..." : "Add Admin"}
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        isOpen={pendingRemove !== null}
        title="Remove admin"
        message={`Remove ${pendingAdmin?.displayName ?? "this user"} as an admin? They will lose access to settings and bug creation.`}
        confirmLabel="Remove"
        danger
        onConfirm={() => pendingRemove && handleRemove(pendingRemove)}
        onCancel={() => setPendingRemove(null)}
      />
    </div>
  );
};
