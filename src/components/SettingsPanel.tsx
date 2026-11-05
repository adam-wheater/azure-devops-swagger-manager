import * as React from "react";
import {
  GlobalSettingsDocument,
  SwaggerApiEntry,
  ApiVisibility,
  ApiPublishStatus,
  ApiKeySource,
} from "../models/interfaces";
import { generateId } from "../utils/idUtils";
import { VariableGroupService, VariableGroupSummary } from "../services/VariableGroupService";
import {
  Banner,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  IconCheck,
  IconRefresh,
  IconTrash,
  IconX,
  Pill,
} from "./ui";

interface SettingsPanelProps {
  globalSettings: GlobalSettingsDocument | null;
  apis: SwaggerApiEntry[];
  currentUserId: string;
  onSaveSettings: (
    updates: Partial<
      Pick<
        GlobalSettingsDocument,
        | "apiKey"
        | "authHeaderName"
        | "autoScanOnLoad"
        | "refreshIntervalMinutes"
        | "apiKeySource"
        | "variableGroupRef"
      >
    >
  ) => Promise<void>;
  onAddApi: (api: SwaggerApiEntry) => Promise<void>;
  onRemoveApi: (apiId: string) => Promise<void>;
  onUpdateApi: (
    apiId: string,
    updates: Partial<
      Pick<
        SwaggerApiEntry,
        "name" | "url" | "visibility" | "publishStatus" | "apiKey" | "authHeaderName"
      >
    >
  ) => Promise<void>;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  globalSettings,
  apis,
  currentUserId,
  onSaveSettings,
  onAddApi,
  onRemoveApi,
  onUpdateApi,
}) => {
  const [apiKey, setApiKey] = React.useState(globalSettings?.apiKey ?? "");
  const [authHeaderName, setAuthHeaderName] = React.useState(
    globalSettings?.authHeaderName ?? "X-API-Key"
  );
  const [autoScan, setAutoScan] = React.useState(globalSettings?.autoScanOnLoad ?? false);
  const [refreshInterval, setRefreshInterval] = React.useState<number>(
    globalSettings?.refreshIntervalMinutes ?? 5
  );
  const [apiKeySource, setApiKeySource] = React.useState<ApiKeySource>(
    globalSettings?.apiKeySource ?? ApiKeySource.Direct
  );
  const [variableGroups, setVariableGroups] = React.useState<VariableGroupSummary[]>([]);
  const [selectedGroupId, setSelectedGroupId] = React.useState<number | undefined>(
    globalSettings?.variableGroupRef?.groupId
  );
  const [selectedVariableName, setSelectedVariableName] = React.useState(
    globalSettings?.variableGroupRef?.variableName ?? ""
  );
  const [loadingGroups, setLoadingGroups] = React.useState(false);
  const [groupError, setGroupError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const [newApiName, setNewApiName] = React.useState("");
  const [newApiUrl, setNewApiUrl] = React.useState("");
  const [addingApi, setAddingApi] = React.useState(false);
  const [apiError, setApiError] = React.useState<string | null>(null);

  const [pendingRemoveId, setPendingRemoveId] = React.useState<string | null>(null);
  const [editingApiId, setEditingApiId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const varGroupServiceRef = React.useRef(new VariableGroupService());

  React.useEffect(() => {
    if (globalSettings) {
      setApiKey(globalSettings.apiKey);
      setAuthHeaderName(globalSettings.authHeaderName);
      setAutoScan(globalSettings.autoScanOnLoad);
      setRefreshInterval(globalSettings.refreshIntervalMinutes ?? 5);
      setApiKeySource(globalSettings.apiKeySource ?? ApiKeySource.Direct);
      setSelectedGroupId(globalSettings.variableGroupRef?.groupId);
      setSelectedVariableName(globalSettings.variableGroupRef?.variableName ?? "");
    }
  }, [globalSettings]);

  const handleSaveSettings = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const updates: Partial<
        Pick<
          GlobalSettingsDocument,
          | "apiKey"
          | "authHeaderName"
          | "autoScanOnLoad"
          | "refreshIntervalMinutes"
          | "apiKeySource"
          | "variableGroupRef"
        >
      > = {
        authHeaderName,
        autoScanOnLoad: autoScan,
        refreshIntervalMinutes: refreshInterval,
        apiKeySource,
      };
      if (apiKeySource === ApiKeySource.Direct) {
        updates.apiKey = apiKey;
        updates.variableGroupRef = undefined;
      } else {
        updates.apiKey = "";
        const group = variableGroups.find((g) => g.id === selectedGroupId);
        updates.variableGroupRef =
          selectedGroupId && selectedVariableName
            ? {
                groupId: selectedGroupId,
                groupName: group?.name ?? "",
                variableName: selectedVariableName,
              }
            : undefined;
      }
      await onSaveSettings(updates);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const loadVariableGroups = React.useCallback(async () => {
    setLoadingGroups(true);
    setGroupError(null);
    try {
      const groups = await varGroupServiceRef.current.listVariableGroups();
      setVariableGroups(groups);
    } catch (err) {
      setGroupError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  // Load variable groups when source changes to VariableGroup
  React.useEffect(() => {
    if (apiKeySource === ApiKeySource.VariableGroup && variableGroups.length === 0) {
      loadVariableGroups();
    }
  }, [apiKeySource, loadVariableGroups, variableGroups.length]);

  const selectedGroup = variableGroups.find((g) => g.id === selectedGroupId);

  const handleAddApi = async () => {
    if (!newApiName.trim() || !newApiUrl.trim()) {
      setApiError("Both name and URL are required.");
      return;
    }
    try {
      new URL(newApiUrl.trim());
    } catch {
      setApiError("Invalid URL format.");
      return;
    }
    setAddingApi(true);
    setApiError(null);
    try {
      await onAddApi({
        id: generateId(),
        name: newApiName.trim(),
        url: newApiUrl.trim(),
        addedAt: new Date().toISOString(),
        addedBy: currentUserId,
        visibility: ApiVisibility.Private,
        publishStatus: ApiPublishStatus.Unpublished,
      });
      setNewApiName("");
      setNewApiUrl("");
    } catch (err) {
      setApiError(err instanceof Error ? err.message : String(err));
    } finally {
      setAddingApi(false);
    }
  };

  const handleRemoveApi = async (apiId: string) => {
    setPendingRemoveId(null);
    await onRemoveApi(apiId);
  };

  const handleToggleVisibility = async (api: SwaggerApiEntry) => {
    const newVisibility =
      api.visibility === ApiVisibility.Public ? ApiVisibility.Private : ApiVisibility.Public;
    await onUpdateApi(api.id, { visibility: newVisibility });
  };

  const handleTogglePublish = async (api: SwaggerApiEntry) => {
    const newStatus =
      api.publishStatus === ApiPublishStatus.Published
        ? ApiPublishStatus.Unpublished
        : ApiPublishStatus.Published;
    await onUpdateApi(api.id, { publishStatus: newStatus });
  };

  const handleStartRename = (api: SwaggerApiEntry) => {
    setEditingApiId(api.id);
    setEditName(api.name);
  };

  const handleSaveRename = async (apiId: string) => {
    if (!editName.trim()) return;
    await onUpdateApi(apiId, { name: editName.trim() });
    setEditingApiId(null);
    setEditName("");
  };

  const handleCancelRename = () => {
    setEditingApiId(null);
    setEditName("");
  };

  const pendingRemoveApi = apis.find((a) => a.id === pendingRemoveId);

  return (
    <div className="ax-stack">
      <Card
        title="Global settings"
        hint="How specs are fetched and when they are scanned. Applies to every registered API."
      >
        <div className="ax-field">
          <span className="ax-label" id="api-key-source-label">
            API Key Source
          </span>
          <div className="ax-row" role="radiogroup" aria-labelledby="api-key-source-label">
            <label className="ax-check">
              <input
                type="radio"
                name="apiKeySource"
                checked={apiKeySource === ApiKeySource.Direct}
                onChange={() => setApiKeySource(ApiKeySource.Direct)}
              />
              Direct
            </label>
            <label className="ax-check">
              <input
                type="radio"
                name="apiKeySource"
                checked={apiKeySource === ApiKeySource.VariableGroup}
                onChange={() => setApiKeySource(ApiKeySource.VariableGroup)}
              />
              Library Variable Group
            </label>
          </div>
        </div>

        {apiKeySource === ApiKeySource.Direct && (
          <div className="ax-field">
            <label className="ax-label" htmlFor="settings-api-key">
              API Key
            </label>
            <input
              id="settings-api-key"
              className="ax-input"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter API key for authenticating to Swagger endpoints"
              style={{ width: 420, maxWidth: "100%" }}
            />
          </div>
        )}

        {apiKeySource === ApiKeySource.VariableGroup && (
          <div className="ax-field">
            {groupError && <Banner tone="error">{groupError}</Banner>}
            <div className="ax-row" style={{ alignItems: "flex-end" }}>
              <div className="ax-field" style={{ marginBottom: 0 }}>
                <label className="ax-label" htmlFor="settings-var-group">
                  Variable Group
                </label>
                <select
                  id="settings-var-group"
                  className="ax-select"
                  value={selectedGroupId ?? ""}
                  onChange={(e) => {
                    const id = e.target.value ? Number(e.target.value) : undefined;
                    setSelectedGroupId(id);
                    setSelectedVariableName("");
                  }}
                  disabled={loadingGroups}
                  style={{ width: 280 }}
                >
                  <option value="">
                    {loadingGroups ? "Loading..." : "-- Select a variable group --"}
                  </option>
                  {variableGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ax-field" style={{ marginBottom: 0 }}>
                <label className="ax-label" htmlFor="settings-var-name">
                  Variable Name
                </label>
                <select
                  id="settings-var-name"
                  className="ax-select"
                  value={selectedVariableName}
                  onChange={(e) => setSelectedVariableName(e.target.value)}
                  disabled={!selectedGroup}
                  style={{ width: 220 }}
                >
                  <option value="">-- Select a variable --</option>
                  {(selectedGroup?.variableNames ?? []).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                icon={<IconRefresh />}
                onClick={loadVariableGroups}
                busy={loadingGroups}
                title="Refresh variable groups"
              >
                {loadingGroups ? "Loading..." : "Refresh"}
              </Button>
            </div>
            <p className="ax-help">
              The API key will be read from the selected variable at scan time. Secret variables
              cannot be read via the API.
            </p>
          </div>
        )}

        <div className="ax-field">
          <label className="ax-label" htmlFor="settings-auth-header">
            Auth Header Name
          </label>
          <input
            id="settings-auth-header"
            className="ax-input"
            type="text"
            value={authHeaderName}
            onChange={(e) => setAuthHeaderName(e.target.value)}
            placeholder="X-API-Key"
            style={{ width: 260 }}
          />
          <span className="ax-help">
            The HTTP header name used to send the API key (e.g. X-API-Key, Authorization, api-key)
          </span>
        </div>

        <div className="ax-field">
          <label className="ax-check">
            <input
              type="checkbox"
              checked={autoScan}
              onChange={(e) => setAutoScan(e.target.checked)}
            />
            Auto-scan APIs when opening the extension
          </label>
        </div>

        <div className="ax-field">
          <label className="ax-label" htmlFor="settings-refresh">
            Auto-refresh Interval (minutes)
          </label>
          <div className="ax-row">
            <input
              id="settings-refresh"
              className="ax-input ax-input--num"
              type="number"
              min={0}
              max={60}
              value={refreshInterval}
              onChange={(e) =>
                setRefreshInterval(Math.max(0, Math.min(60, Number(e.target.value))))
              }
            />
            <span className="ax-help">
              {refreshInterval === 0
                ? "Disabled. APIs will not auto-refresh"
                : `APIs will be re-scanned every ${refreshInterval} minute${refreshInterval !== 1 ? "s" : ""}`}
            </span>
          </div>
        </div>

        <div className="ax-row">
          <Button variant="primary" onClick={handleSaveSettings} busy={saving}>
            {saving ? "Saving..." : "Save Settings"}
          </Button>
          {saved && <Pill tone="success">Saved!</Pill>}
        </div>
      </Card>

      {apiError && (
        <Banner tone="error" onDismiss={() => setApiError(null)}>
          {apiError}
        </Banner>
      )}

      <Card title="Registered Swagger APIs" hint={`${apis.length} registered`} flush>
        {apis.length === 0 ? (
          <EmptyState title="No APIs registered yet">
            Add one below, or discover specs from the Dashboard tab.
          </EmptyState>
        ) : (
          <div className="ax-table-wrap">
            <table className="ax-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>URL</th>
                  <th>Visibility</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {apis.map((api) => (
                  <tr key={api.id}>
                    <td>
                      {editingApiId === api.id ? (
                        <div className="ax-row">
                          <input
                            className="ax-input ax-input--sm"
                            type="text"
                            aria-label={`New name for ${api.name}`}
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveRename(api.id);
                              if (e.key === "Escape") handleCancelRename();
                            }}
                            autoFocus
                            style={{ width: 160 }}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="ax-btn--icon"
                            icon={<IconCheck />}
                            onClick={() => handleSaveRename(api.id)}
                            aria-label="Save name"
                            title="Save"
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="ax-btn--icon"
                            icon={<IconX />}
                            onClick={handleCancelRename}
                            aria-label="Cancel rename"
                            title="Cancel"
                          />
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleStartRename(api)}
                          title="Click to rename"
                        >
                          {api.name}
                        </Button>
                      )}
                    </td>
                    <td className="ax-mono ax-truncate" title={api.url}>
                      {api.url}
                    </td>
                    <td>
                      <Button
                        size="sm"
                        onClick={() => handleToggleVisibility(api)}
                        title={
                          api.visibility === ApiVisibility.Public
                            ? "Click to make private"
                            : "Click to make public"
                        }
                      >
                        {api.visibility === ApiVisibility.Public ? "Public" : "Private"}
                      </Button>
                    </td>
                    <td>
                      <Button
                        size="sm"
                        onClick={() => handleTogglePublish(api)}
                        title={
                          api.publishStatus === ApiPublishStatus.Published
                            ? "Click to unpublish"
                            : "Click to publish"
                        }
                      >
                        {api.publishStatus === ApiPublishStatus.Published
                          ? "Published"
                          : "Unpublished"}
                      </Button>
                    </td>
                    <td className="ax-num">
                      <Button
                        size="sm"
                        variant="danger"
                        icon={<IconTrash />}
                        onClick={() => setPendingRemoveId(api.id)}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title="Add an API"
        hint="New APIs are added as Private and Unpublished. Use the toggles above to change visibility and publish status."
      >
        <div className="ax-row" style={{ alignItems: "flex-end" }}>
          <div className="ax-field" style={{ marginBottom: 0 }}>
            <label className="ax-label" htmlFor="settings-new-name">
              API Name
            </label>
            <input
              id="settings-new-name"
              className="ax-input"
              type="text"
              value={newApiName}
              onChange={(e) => setNewApiName(e.target.value)}
              placeholder="e.g. Users API"
              style={{ width: 200 }}
            />
          </div>
          <div className="ax-field" style={{ marginBottom: 0 }}>
            <label className="ax-label" htmlFor="settings-new-url">
              Swagger URL
            </label>
            <input
              id="settings-new-url"
              className="ax-input"
              type="text"
              value={newApiUrl}
              onChange={(e) => setNewApiUrl(e.target.value)}
              placeholder="https://api.example.com/swagger/v1/swagger.json"
              style={{ width: 400, maxWidth: "100%" }}
            />
          </div>
          <Button variant="primary" onClick={handleAddApi} busy={addingApi}>
            {addingApi ? "Adding..." : "Add API"}
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        isOpen={pendingRemoveId !== null}
        title="Remove API"
        message={`Are you sure you want to remove ${pendingRemoveApi ? `"${pendingRemoveApi.name}"` : "this API"}?`}
        confirmLabel="Remove"
        danger
        onConfirm={() => pendingRemoveId && handleRemoveApi(pendingRemoveId)}
        onCancel={() => setPendingRemoveId(null)}
      />
    </div>
  );
};
