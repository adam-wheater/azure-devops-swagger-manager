// Sample data for the demo build: a fictional "Contoso" project with three
// registered APIs. The hub reads specs with a plain fetch, so window.fetch is
// replaced here with a stub that serves them. See demo/kit.ts for the helpers.
import { CommonServiceIds, clientFactory, delay, extensionDataService, projectPageService } from "./kit";

export { CommonServiceIds };

const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString();

// Alex Morgan is the sample user in demo/sdk.ts, so he is the admin below.
const ALEX = "8d1f2c4e-5b6a-4c7d-9e8f-0a1b2c3d4e5f";
const PRIYA = "2b7e9f10-3c4d-4e5f-8a6b-7c8d9e0f1a2b";
const TOM = "5f6a7b8c-9d0e-4f1a-b2c3-d4e5f6a7b8c9";

// ===== Spec building blocks =====

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: unknown, example: unknown) => ({ "application/json": { schema, example } });
const ok = (description: string, schema: string, example: unknown) => ({
  description,
  content: json(ref(schema), example),
});
const problem = (description: string, status: number, title: string) =>
  ok(description, "Problem", { type: "https://api.contoso.com/problems/" + status, title, status });
const body = (schema: string, example: unknown) => ({
  required: true,
  content: json(ref(schema), example),
});
const param = (name: string, where: "query" | "path", description?: string, type = "string") => ({
  name,
  in: where,
  ...(where === "path" ? { required: true } : {}),
  description,
  schema: { type },
});
const page = [
  param("page", "query", "Page number, starting at 1.", "integer"),
  param("pageSize", "query", "Items per page, up to 100.", "integer"),
];
const string = { type: "string" };
const number = { type: "number" };
const integer = { type: "integer" };
const date = { type: "string", format: "date" };
const dateTime = { type: "string", format: "date-time" };
const obj = (description: string | undefined, properties: Record<string, unknown>) => ({
  type: "object",
  description,
  properties,
});
const problemSchema = obj("An RFC 7807 problem document returned for every error.", {
  type: string,
  title: string,
  status: integer,
});

// --- specs begin ---
const invoice = {
  id: "inv_20931",
  customerId: "cus_4417",
  status: "open",
  currency: "GBP",
  total: 1284.5,
  dueDate: "2026-11-30",
};

const billing = {
  openapi: "3.0.3",
  info: {
    title: "Billing API",
    version: "2.3.0",
    description: "Invoices, payments and credit notes for Contoso customer accounts.",
  },
  servers: [{ url: "https://api.contoso.com/billing" }],
  paths: {
    "/v1/invoices": {
      get: {
        operationId: "Invoices_List",
        tags: ["Invoices"],
        summary: "List invoices",
        description: "Lists invoices for the signed-in account, newest first.",
        parameters: [...page, param("status", "query", "Only invoices in this state.")],
        responses: {
          "200": ok("A page of invoices", "InvoicePage", { items: [invoice], total: 1 }),
          "401": problem("Missing or invalid token", 401, "Unauthorized"),
        },
      },
      post: {
        operationId: "Invoices_Create",
        tags: ["Invoices"],
        summary: "Create an invoice",
        description: "Creates a draft invoice for a customer.",
        requestBody: body("NewInvoice", { customerId: "cus_4417", currency: "GBP" }),
        responses: {
          "201": ok("Invoice created", "Invoice", invoice),
          "400": problem("The request body failed validation", 400, "Invalid invoice"),
        },
      },
    },
    "/v1/invoices/{invoiceId}": {
      get: {
        operationId: "getInvoiceById",
        tags: ["Invoices"],
        summary: "Retrieve an invoice",
        description: "Fetches one invoice with its line items.",
        parameters: [param("invoiceId", "path", "The invoice to retrieve.")],
        responses: {
          "200": ok("The requested invoice", "Invoice", invoice),
          "404": problem("Invoice not found", 404, "Invoice not found"),
        },
      },
      delete: {
        operationId: "Invoices_Void",
        tags: ["Invoices"],
        summary: "Delete a draft invoice",
        description: "Removes an invoice that has not been sent yet.",
        parameters: [param("invoiceId", "path", "The draft invoice to remove.")],
        responses: { "204": { description: "Invoice deleted" } },
      },
    },
    "/v1/invoices/{invoiceId}/getPayments": {
      get: {
        operationId: "Invoices_Payments",
        tags: ["Payments"],
        summary: "Payments for an invoice",
        description: "Payments received against one invoice.",
        parameters: [param("invoiceId", "path", "The invoice the payments belong to.")],
        responses: {
          "200": ok("Payments received so far", "PaymentList", { items: [] }),
          "404": problem("Invoice not found", 404, "Invoice not found"),
        },
      },
    },
    "/v1/invoices/{invoiceId}/payments": {
      post: {
        operationId: "Payments_Record",
        tags: ["Payments"],
        summary: "Record a payment",
        description: "Records a payment received against an invoice.",
        parameters: [param("invoiceId", "path", "The invoice being paid.")],
        requestBody: body("NewPayment", { amount: 1284.5, method: "bank_transfer" }),
        responses: {
          "200": {
            description: "Success",
            content: json(ref("Payment"), { id: "pay_7781", amount: 1284.5 }),
          },
          "409": problem("The invoice is already paid in full", 409, "Already paid"),
        },
      },
    },
    "/v1/credit-notes": {
      get: {
        operationId: "CreditNotes_List",
        tags: ["Credit notes"],
        summary: "List credit notes",
        description: "Lists credit notes issued to the signed-in account.",
        parameters: page,
        responses: {
          "200": ok("A page of credit notes", "CreditNoteList", { items: [{ id: "cn_118", amount: 40 }] }),
          "401": problem("Missing or invalid token", 401, "Unauthorized"),
        },
      },
    },
    "/v1/credit-notes/{creditNoteId}": {
      get: {
        operationId: "CreditNotes_Find",
        tags: ["Credit notes"],
        summary: "Retrieve a credit note",
        description: "Fetches one credit note and the invoice it applies to.",
        parameters: [param("creditNoteId", "path")],
        responses: {
          "200": ok("The requested credit note", "CreditNote", { id: "cn_118", amount: 40 }),
          "404": problem("Credit note not found", 404, "Credit note not found"),
        },
      },
    },
  },
  components: {
    schemas: {
      Invoice: obj("A bill sent to a customer.", {
        id: string,
        customerId: string,
        status: { type: "string", enum: ["draft", "open", "paid", "void"] },
        currency: string,
        total: number,
        dueDate: date,
        lineItems: { type: "array", items: ref("LineItem") },
      }),
      InvoicePage: obj("One page of invoices.", { items: { type: "array", items: ref("Invoice") }, total: integer }),
      NewInvoice: obj("The fields needed to raise a draft invoice.", { customerId: string, currency: string }),
      LineItem: obj(undefined, { description: string, quantity: integer, unitPrice: number }),
      Payment: obj("Money received against an invoice.", { id: string, amount: number, receivedAt: dateTime }),
      PaymentList: obj("Payments received against one invoice.", { items: { type: "array", items: ref("Payment") } }),
      NewPayment: obj("The fields needed to record a payment.", { amount: number, method: string }),
      CreditNote: obj(undefined, { id: string, amount: number, invoiceId: string }),
      CreditNoteList: obj("One page of credit notes.", { items: { type: "array", items: ref("CreditNote") } }),
      Problem: problemSchema,
    },
  },
};

const payments = {
  openapi: "3.0.1",
  info: {
    title: "Payments API",
    version: "0.9.0",
    description: "Charges, refunds and retries for card payments.",
  },
  servers: [{ url: "https://api.contoso.com/payments" }],
  paths: {
    "/v1/charges": {
      get: {
        operationId: "Charges_List",
        tags: ["Charges"],
        summary: "List charges",
        description: "Lists card charges, newest first.",
        parameters: [
          param("limit", "query", "Items to return, up to 100.", "integer"),
          param("cursor", "query", "Cursor from the previous page."),
        ],
        responses: {
          "200": ok("A page of charges", "ChargeList", { items: [] }),
          "401": problem("Missing or invalid token", 401, "Unauthorized"),
        },
      },
      post: {
        operationId: "Charges_Create",
        tags: ["Charges"],
        summary: "Create a charge",
        description: "Charges a stored card.",
        requestBody: body("NewCharge", { cardId: "card_9921", amount: 4999, currency: "GBP" }),
        responses: {
          "201": ok("Charge created", "Charge", { id: "ch_3310", status: "succeeded" }),
          "402": problem("The card was declined", 402, "Card declined"),
        },
      },
    },
    "/v1/charges/{chargeId}": {
      get: {
        operationId: "Charges_Find",
        tags: ["Charges"],
        summary: "Retrieve a charge",
        description: "Fetches one charge and its refunds.",
        parameters: [param("chargeId", "path", "The charge to retrieve.")],
        responses: {
          "200": ok("The requested charge", "Charge", { id: "ch_3310", status: "succeeded" }),
          "404": problem("Charge not found", 404, "Charge not found"),
        },
      },
    },
    "/v1/charges/{chargeId}/refunds": {
      post: {
        operationId: "Refunds_Issue",
        tags: ["Refunds"],
        summary: "Refund a charge",
        description: "Refunds all or part of a charge.",
        parameters: [param("chargeId", "path", "The charge to refund.")],
        requestBody: body("NewRefund", { amount: 1500 }),
        responses: {
          "201": ok("Refund issued", "Refund", { id: "re_204", amount: 1500 }),
          "409": problem("The charge is already fully refunded", 409, "Already refunded"),
        },
      },
    },
    "/v1/charges/{chargeId}/retry": {
      put: {
        operationId: "Charges_Retry",
        tags: ["Charges"],
        parameters: [param("chargeId", "path", "The failed charge to retry.")],
        responses: {
          "202": ok("Retry queued", "Charge", { id: "ch_3310", status: "pending" }),
          "404": problem("Charge not found", 404, "Charge not found"),
        },
      },
    },
    "/v1/webhooks": {
      get: {
        operationId: "Webhooks_List",
        tags: ["Webhooks"],
        summary: "List webhooks",
        description: "Lists the webhook endpoints registered for the account.",
        parameters: [param("limit", "query", "Items to return, up to 100.", "integer")],
        responses: {
          "200": ok("The registered webhooks", "WebhookList", { items: [{ id: "wh_7", url: "https://hooks.contoso.com/payments" }] }),
          "401": problem("Missing or invalid token", 401, "Unauthorized"),
        },
      },
    },
  },
  components: {
    schemas: {
      Charge: obj("A payment taken from a card.", { id: string, status: string, amount: integer, currency: string }),
      ChargeList: obj("One page of charges.", { items: { type: "array", items: ref("Charge") }, nextCursor: string }),
      NewCharge: obj("The fields needed to charge a card.", { cardId: string, amount: integer, currency: string }),
      Refund: obj(undefined, { id: string, amount: integer }),
      NewRefund: obj("The amount to refund, in pence.", { amount: integer }),
      WebhookList: obj("The webhook endpoints registered for the account.", { items: { type: "array", items: obj("A registered webhook.", { id: string, url: string }) } }),
      Problem: problemSchema,
    },
  },
};

const portal = {
  openapi: "3.0.3",
  info: {
    title: "Web Portal API",
    version: "1.8.2",
    description: "Backend for the customer web portal: accounts, notifications and sign-in sessions.",
  },
  servers: [{ url: "https://api.contoso.com/portal" }],
  paths: {
    "/v1/notifications": {
      get: {
        operationId: "Notifications_List",
        tags: ["Notifications"],
        summary: "List notifications",
        description: "Lists notifications for the signed-in user.",
        parameters: page,
        responses: {
          "200": ok("A page of notifications", "NotificationList", { items: [{ id: "n_55", read: false }] }),
          "401": problem("Missing or invalid token", 401, "Unauthorized"),
        },
      },
    },
    "/v1/notifications/{notificationId}": {
      patch: {
        operationId: "Notifications_Update",
        tags: ["Notifications"],
        summary: "Mark a notification read",
        description: "Marks one notification as read or unread.",
        parameters: [param("notificationId", "path", "The notification to change.")],
        requestBody: body("NotificationPatch", { read: true }),
        responses: {
          "200": ok("The updated notification", "Notification", { id: "n_55", read: true }),
          "404": problem("Notification not found", 404, "Notification not found"),
        },
      },
    },
    "/v1/announcements": {
      get: {
        operationId: "Announcements_List",
        tags: ["Announcements"],
        summary: "List announcements",
        description: "Lists announcements shown on the portal home page.",
        parameters: page,
        responses: {
          "200": ok("A page of announcements", "NotificationList", { items: [{ id: "n_90", read: false }] }),
          "401": problem("Missing or invalid token", 401, "Unauthorized"),
        },
      },
    },
    "/v1/users/{userId}": {
      get: {
        operationId: "Users_Find",
        tags: ["Users"],
        summary: "Retrieve a user",
        description: "Fetches a user profile.",
        parameters: [param("userId", "path", "The user to retrieve.")],
        responses: {
          "200": ok("The requested user", "User", { id: "u_12", name: "Sam Okafor" }),
          "404": problem("User not found", 404, "User not found"),
        },
      },
    },
    "/v1/users/{userId}/preferences": {
      put: {
        operationId: "Preferences_Replace",
        tags: ["Users"],
        summary: "Replace preferences",
        description: "Replaces all stored preferences for a user.",
        parameters: [param("userId", "path", "The user whose preferences change.")],
        requestBody: body("Preferences", { theme: "dark", digest: "weekly" }),
        responses: {
          "200": ok("The stored preferences", "Preferences", { theme: "dark", digest: "weekly" }),
          "404": problem("User not found", 404, "User not found"),
        },
      },
    },
    "/v1/sessions": {
      post: {
        operationId: "Sessions_Start",
        tags: ["Sessions"],
        summary: "Sign in",
        description: "Starts a sign-in session from an identity token.",
        requestBody: body("NewSession", { idToken: "example-id-token" }),
        responses: {
          "201": ok("Session started", "Session", { id: "s_8841", expiresIn: 3600 }),
          "401": problem("The identity token was rejected", 401, "Unauthorized"),
        },
      },
    },
    "/v1/sessions/{sessionId}": {
      delete: {
        operationId: "Sessions_End",
        tags: ["Sessions"],
        summary: "Sign out",
        description: "Ends a sign-in session.",
        parameters: [param("sessionId", "path", "The session to end.")],
        responses: {
          "204": { description: "Session ended" },
          "404": problem("Session not found", 404, "Session not found"),
        },
      },
    },
  },
  components: {
    schemas: {
      Notification: obj("A message shown in the portal.", { id: string, text: string, read: { type: "boolean" } }),
      NotificationList: obj("One page of notifications.", { items: { type: "array", items: ref("Notification") } }),
      NotificationPatch: obj("The change to apply to a notification.", { read: { type: "boolean" } }),
      User: obj("A portal user.", { id: string, name: string, email: string }),
      Preferences: obj("A user's portal settings.", { theme: string, digest: string }),
      NewSession: obj("The credentials needed to sign in.", { idToken: string }),
      Session: obj("A signed-in session.", { id: string, expiresIn: integer }),
      Problem: problemSchema,
    },
  },
};
// --- specs end ---

// ===== window.fetch =====

const API = "https://api.contoso.com";
const specs: Record<string, unknown> = {
  [`${API}/billing/v1/swagger.json`]: billing,
  [`${API}/payments/v1/swagger.json`]: payments,
  [`${API}/portal/v1/openapi.json`]: portal,
};

// Specs come back as JSON after a beat; anything else is a 404, like an unknown URL.
window.fetch = async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  await delay(null, 250);
  return url in specs
    ? new Response(JSON.stringify(specs[url]), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    : new Response("Not found", { status: 404, statusText: "Not Found" });
};

// ===== Extension data =====

const settings = extensionDataService({
  SwaggerManagerSettings: {
    admin: {
      claimedBy: ALEX,
      claimedAt: iso(120),
      version: 1,
      admins: [
        { userId: ALEX, displayName: "Alex Morgan", addedAt: iso(120), addedBy: ALEX },
        { userId: PRIYA, displayName: "Priya Shah", addedAt: iso(75), addedBy: ALEX },
        { userId: TOM, displayName: "Tom Ellis", addedAt: iso(30), addedBy: PRIYA },
      ],
    },
    "global-settings": {
      apiKey: "EXAMPLE-KEY-NOT-REAL",
      authHeaderName: "X-API-Key",
      autoScanOnLoad: true,
      refreshIntervalMinutes: 15,
      apiKeySource: "direct",
      version: 1,
    },
    "swagger-apis": {
      version: 1,
      apis: [
        { id: "api-billing", name: "Billing API", url: `${API}/billing/v1/swagger.json`, addedAt: iso(90), addedBy: ALEX, visibility: "public", publishStatus: "published" },
        { id: "api-portal", name: "Web Portal API", url: `${API}/portal/v1/openapi.json`, addedAt: iso(60), addedBy: PRIYA, visibility: "private", publishStatus: "published" },
        { id: "api-payments", name: "Payments API", url: `${API}/payments/v1/swagger.json`, addedAt: iso(14), addedBy: ALEX, visibility: "public", publishStatus: "unpublished" },
      ],
    },
  },
});

export const services: Record<string, unknown> = {
  [CommonServiceIds.ProjectPageService]: projectPageService("Contoso"),
  [CommonServiceIds.ExtensionDataService]: settings,
};

// The hub only reads Git and variable groups from the Settings and Discover views.
export const getClient = clientFactory({});
