import * as SDK from "azure-devops-extension-sdk";
import {
  CommonServiceIds,
  IExtensionDataService,
  IExtensionDataManager,
} from "azure-devops-extension-api";
import { AdminDocument, AdminEntry } from "../models/interfaces";
import { SETTINGS_COLLECTION, ADMIN_DOC_ID, SETTINGS_VERSION } from "../utils/constants";
import { isNotFound } from "../utils/extensionData";

export class AdminService {
  private dataManagerPromise: Promise<IExtensionDataManager> | null = null;

  private async getDataManager(): Promise<IExtensionDataManager> {
    if (!this.dataManagerPromise) {
      this.dataManagerPromise = (async () => {
        const service = await SDK.getService<IExtensionDataService>(
          CommonServiceIds.ExtensionDataService
        );
        const accessToken = await SDK.getAccessToken();
        return service.getExtensionDataManager(SDK.getExtensionContext().id, accessToken);
      })();
    }
    return this.dataManagerPromise;
  }

  /** The admin document, or null when it has never been claimed. Any other failure rethrows. */
  async getAdminDocument(): Promise<AdminDocument | null> {
    const manager = await this.getDataManager();
    try {
      return (await manager.getDocument(SETTINGS_COLLECTION, ADMIN_DOC_ID)) as AdminDocument;
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async claimAdmin(userId: string, displayName: string): Promise<AdminDocument> {
    const existing = await this.getAdminDocument();
    if (existing) {
      throw new Error("Admin has already been claimed. Contact an existing admin for access.");
    }

    const doc: AdminDocument = {
      id: ADMIN_DOC_ID,
      claimedBy: userId,
      claimedAt: new Date().toISOString(),
      admins: [
        {
          userId,
          displayName,
          addedAt: new Date().toISOString(),
          addedBy: userId,
        },
      ],
      version: SETTINGS_VERSION,
    };

    // createDocument, not setDocument: the server refuses it when the document already
    // exists, so a stale "unclaimed" page can never overwrite the stored admin list.
    const manager = await this.getDataManager();
    try {
      await manager.createDocument(SETTINGS_COLLECTION, doc);
    } catch (err) {
      if (await this.getAdminDocument()) {
        throw new Error("Admin has already been claimed. Contact an existing admin for access.");
      }
      throw err;
    }
    return doc;
  }

  async addAdmin(entry: AdminEntry): Promise<AdminDocument> {
    const doc = await this.getAdminDocument();
    if (!doc) throw new Error("Admin not yet claimed.");

    if (doc.admins.some((a) => a.userId === entry.userId)) {
      throw new Error(`User "${entry.displayName}" is already an admin.`);
    }

    doc.admins.push(entry);
    const manager = await this.getDataManager();
    await manager.setDocument(SETTINGS_COLLECTION, doc);
    return doc;
  }

  async removeAdmin(userId: string): Promise<AdminDocument> {
    const doc = await this.getAdminDocument();
    if (!doc) throw new Error("Admin not yet claimed.");

    if (doc.claimedBy === userId) {
      throw new Error("Cannot remove the original admin who claimed the extension.");
    }

    const idx = doc.admins.findIndex((a) => a.userId === userId);
    if (idx === -1) throw new Error("User is not an admin.");
    doc.admins.splice(idx, 1);

    const manager = await this.getDataManager();
    await manager.setDocument(SETTINGS_COLLECTION, doc);
    return doc;
  }

  isAdmin(doc: AdminDocument | null, userId: string): boolean {
    if (!doc) return false;
    return doc.admins.some((a) => a.userId === userId);
  }

  isUnclaimed(doc: AdminDocument | null): boolean {
    return doc === null;
  }
}
