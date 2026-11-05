import * as React from "react";
import * as SDK from "azure-devops-extension-sdk";
import { AdminService } from "../services/AdminService";
import { AdminDocument, AdminEntry } from "../models/interfaces";
import { formatError } from "../utils/formatError";

export interface UseAdminResult {
  loading: boolean;
  error: string | null;
  adminDoc: AdminDocument | null;
  isAdmin: boolean;
  isUnclaimed: boolean;
  currentUserId: string;
  currentUserName: string;
  claimAdmin: () => Promise<void>;
  addAdmin: (userId: string, displayName: string) => Promise<void>;
  removeAdmin: (userId: string) => Promise<void>;
  reload: () => Promise<void>;
}

export function useAdmin(): UseAdminResult {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [adminDoc, setAdminDoc] = React.useState<AdminDocument | null>(null);
  // Only a successful read that found no document means "unclaimed". A failed read
  // must not offer the claim page.
  const [loaded, setLoaded] = React.useState(false);
  const [currentUserId, setCurrentUserId] = React.useState("");
  const [currentUserName, setCurrentUserName] = React.useState("");
  const serviceRef = React.useRef(new AdminService());

  const loadAdmin = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const user = SDK.getUser();
      setCurrentUserId(user.id);
      setCurrentUserName(user.displayName);

      const doc = await serviceRef.current.getAdminDocument();
      setAdminDoc(doc);
      setLoaded(true);
    } catch (err) {
      setLoaded(false);
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadAdmin();
  }, [loadAdmin]);

  const claimAdmin = React.useCallback(async () => {
    try {
      setError(null);
      const doc = await serviceRef.current.claimAdmin(currentUserId, currentUserName);
      setAdminDoc(doc);
    } catch (err) {
      setError(formatError(err));
    }
  }, [currentUserId, currentUserName]);

  const addAdmin = React.useCallback(
    async (userId: string, displayName: string) => {
      try {
        setError(null);
        const entry: AdminEntry = {
          userId,
          displayName,
          addedAt: new Date().toISOString(),
          addedBy: currentUserId,
        };
        const doc = await serviceRef.current.addAdmin(entry);
        setAdminDoc(doc);
      } catch (err) {
        setError(formatError(err));
      }
    },
    [currentUserId]
  );

  const removeAdmin = React.useCallback(async (userId: string) => {
    try {
      setError(null);
      const doc = await serviceRef.current.removeAdmin(userId);
      setAdminDoc(doc);
    } catch (err) {
      setError(formatError(err));
    }
  }, []);

  const isAdminUser = serviceRef.current.isAdmin(adminDoc, currentUserId);
  const isUnclaimed = loaded && serviceRef.current.isUnclaimed(adminDoc);

  return {
    loading,
    error,
    adminDoc,
    isAdmin: isAdminUser,
    isUnclaimed,
    currentUserId,
    currentUserName,
    claimAdmin,
    addAdmin,
    removeAdmin,
    reload: loadAdmin,
  };
}
