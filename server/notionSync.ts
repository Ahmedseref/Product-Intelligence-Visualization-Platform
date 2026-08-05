// Notion "Contact Connector" sync module.
//
// Uses the Replit Notion connector (see the `integrations` skill) via
// @replit/connectors-sdk. The connector handles OAuth token refresh — we
// must never cache the client/token, so a fresh ReplitConnectors() instance
// (and thus a fresh token) is created on every call.
import { ReplitConnectors } from "@replit/connectors-sdk";
import { db } from "./db";
import { suppliers, type InsertSupplier, type Supplier } from "@shared/schema";
import { eq, isNull } from "drizzle-orm";

// Fixed database ID for the user's "Contact Connector" Notion database.
// Resolved once via /v1/search and hardcoded here per the task's
// single-database scope (see .local/tasks/task-10.md, "Out of scope").
const CONTACT_CONNECTOR_DATABASE_ID = "25a16510-2631-80af-8320-eb63bf20dd38";

interface NotionPage {
  id: string;
  last_edited_time: string;
  properties: Record<string, any>;
}

async function notionProxy(path: string, init: RequestInit = {}): Promise<Response> {
  // Always construct a fresh connectors client — tokens expire and must be
  // refreshed transparently by the SDK on every call.
  const connectors = new ReplitConnectors();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  return connectors.proxy("notion", path, {
    ...init,
    headers,
  });
}

// ---- Notion <-> suppliers field mapping ----
//
// Notion property name -> suppliers column (every property in the
// "Contact Connector" database is mapped for full fidelity; see
// notionRawProperties for a verbatim copy of everything as a safety net).
//   Record Id (title)                                    -> recordId
//   Lead Name (rich_text)                                -> contactName
//   Company Name (rich_text)                              -> name
//   Lead Position (rich_text)                              -> leadPosition
//   Email (email)                                           -> contactEmail
//   Mobile (phone_number)                                   -> contactPhone
//   Mobile 2 (rich_text)                                    -> mobile2
//   Lead Source (select)                                    -> leadSource
//   Source Quality (select)                                 -> sourceQuality
//   Country (select)                                        -> country
//   Industry Connector (Main Activities) (multi_select)     -> industryMainActivities
//   Supplier/ Customer (select)                             -> contactType
//   Action (select)                                         -> action
//   Priority (select)                                       -> priority
//   Payment Terms (select)                                  -> paymentTerms
//   Pending Payment (formula)                               -> pendingPayment
//   Paid amount (number)                                    -> paidAmount
//   Invoice Value (number)                                  -> invoiceValue
//   Reminder (date)                                         -> reminder
//   Notes (rich_text)                                       -> notes
//   Updates (rich_text)                                     -> updates
//   Website (url)                                           -> website
//   Brand (multi_select)                                    -> brand
//   Product (multi_select)                                  -> product
//   Result (multi_select)                                   -> result
//   Files & media (files)                                   -> filesMedia
//   Tasks (relation)                                        -> tasksRelation
//   Daily Tasks Connector (relation)                        -> dailyTasksConnector
//   Related to Docs (🤩 Leads_2024_02_09) (relation)        -> relatedDocs
//   Docs (relation)                                         -> docsRelation
//   Date (last_edited_time) — Notion's own metadata, not separately stored (redundant with notionLastEditedTime)

function getRichText(prop: any): string | undefined {
  const arr = prop?.rich_text || prop?.title;
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  return arr.map((t: any) => t.plain_text).join("").trim() || undefined;
}

function getSelect(prop: any): string | undefined {
  return prop?.select?.name || undefined;
}

function getMultiSelectArray(prop: any): string[] {
  const arr = prop?.multi_select;
  if (!Array.isArray(arr)) return [];
  return arr.map((o: any) => o.name);
}

function getMultiSelect(prop: any): string | undefined {
  const names = getMultiSelectArray(prop);
  return names.length > 0 ? names.join(", ") : undefined;
}

function getEmail(prop: any): string | undefined {
  return prop?.email || undefined;
}

function getPhone(prop: any): string | undefined {
  return prop?.phone_number || undefined;
}

function getUrl(prop: any): string | undefined {
  return prop?.url || undefined;
}

function getNumber(prop: any): number | undefined {
  return typeof prop?.number === "number" ? prop.number : undefined;
}

function getDate(prop: any): Date | undefined {
  const start = prop?.date?.start;
  return start ? new Date(start) : undefined;
}

function getFormulaText(prop: any): string | undefined {
  const f = prop?.formula;
  if (!f) return undefined;
  if (f.type === "string") return f.string ?? undefined;
  if (f.type === "number") return f.number != null ? String(f.number) : undefined;
  if (f.type === "boolean") return f.boolean != null ? String(f.boolean) : undefined;
  if (f.type === "date") return f.date?.start ?? undefined;
  return undefined;
}

function getRelationIds(prop: any): string[] {
  const arr = prop?.relation;
  if (!Array.isArray(arr)) return [];
  return arr.map((r: any) => r.id);
}

function getFiles(prop: any): { name: string; url: string }[] {
  const arr = prop?.files;
  if (!Array.isArray(arr)) return [];
  return arr.map((f: any) => ({
    name: f.name || "",
    url: f.file?.url || f.external?.url || "",
  }));
}

// Exported for one-off backfills/tooling (e.g. populating newly-added
// mapped columns for suppliers that were already synced before those
// columns existed, without re-triggering conflict resolution).
export { queryAllPages, notionPageToSupplier };

// Maps a Notion page's properties into a partial supplier row. Every
// property in the source database is captured — either into a dedicated
// typed column, or (always) into notionRawProperties as a verbatim copy.
function notionPageToSupplier(page: NotionPage): Partial<InsertSupplier> {
  const props = page.properties;
  return {
    recordId: getRichText(props["Record Id"]),
    contactName: getRichText(props["Lead Name"]),
    name: getRichText(props["Company Name"]) || getRichText(props["Lead Name"]) || "Unnamed Contact",
    leadPosition: getRichText(props["Lead Position"]),
    contactEmail: getEmail(props["Email"]),
    contactPhone: getPhone(props["Mobile"]),
    mobile2: getRichText(props["Mobile 2"]),
    leadSource: getSelect(props["Lead Source"]),
    sourceQuality: getSelect(props["Source Quality"]),
    country: getSelect(props["Country"]),
    industryMainActivities: getMultiSelect(props["Industry Connector (Main Activities)"]),
    contactType: getSelect(props["Supplier/ Customer"]),
    action: getSelect(props["Action"]),
    priority: getSelect(props["Priority"]),
    paymentTerms: getSelect(props["Payment Terms"]),
    pendingPayment: getFormulaText(props["Pending Payment"]),
    paidAmount: getNumber(props["Paid amount"]),
    invoiceValue: getNumber(props["Invoice Value"]),
    reminder: getDate(props["Reminder"]),
    notes: getRichText(props["Notes"]),
    updates: getRichText(props["Updates"]),
    website: getUrl(props["Website"]),
    brand: getMultiSelectArray(props["Brand"]),
    product: getMultiSelectArray(props["Product"]),
    result: getMultiSelectArray(props["Result"]),
    filesMedia: getFiles(props["Files & media"]),
    tasksRelation: getRelationIds(props["Tasks"]),
    dailyTasksConnector: getRelationIds(props["Daily Tasks Connector"]),
    relatedDocs: getRelationIds(props["Related to Docs (🤩 Leads_2024_02_09)"]),
    docsRelation: getRelationIds(props["Docs"]),
    notionRawProperties: props,
    notionPageId: page.id,
    notionLastEditedTime: new Date(page.last_edited_time),
  };
}

// Maps a supplier row into Notion property-update payload (only the
// columns we own — leaves relation/formula-derived Notion-only properties
// untouched since those are computed/linked on Notion's side).
function supplierToNotionProperties(supplier: Supplier): Record<string, any> {
  const props: Record<string, any> = {};
  if (supplier.contactName !== null && supplier.contactName !== undefined) {
    props["Lead Name"] = { rich_text: [{ text: { content: supplier.contactName } }] };
  }
  if (supplier.name) {
    props["Company Name"] = { rich_text: [{ text: { content: supplier.name } }] };
  }
  if (supplier.leadPosition !== null && supplier.leadPosition !== undefined) {
    props["Lead Position"] = { rich_text: [{ text: { content: supplier.leadPosition } }] };
  }
  if (supplier.contactEmail !== null && supplier.contactEmail !== undefined) {
    props["Email"] = { email: supplier.contactEmail || null };
  }
  if (supplier.contactPhone !== null && supplier.contactPhone !== undefined) {
    props["Mobile"] = { phone_number: supplier.contactPhone || null };
  }
  if (supplier.mobile2 !== null && supplier.mobile2 !== undefined) {
    props["Mobile 2"] = { rich_text: [{ text: { content: supplier.mobile2 } }] };
  }
  if (supplier.leadSource !== null && supplier.leadSource !== undefined) {
    props["Lead Source"] = supplier.leadSource ? { select: { name: supplier.leadSource } } : { select: null };
  }
  if (supplier.sourceQuality !== null && supplier.sourceQuality !== undefined) {
    props["Source Quality"] = supplier.sourceQuality ? { select: { name: supplier.sourceQuality } } : { select: null };
  }
  if (supplier.country !== null && supplier.country !== undefined) {
    props["Country"] = supplier.country ? { select: { name: supplier.country } } : { select: null };
  }
  if (supplier.industryMainActivities !== null && supplier.industryMainActivities !== undefined) {
    const names = supplier.industryMainActivities
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    props["Industry Connector (Main Activities)"] = { multi_select: names.map((name) => ({ name })) };
  }
  if (supplier.action !== null && supplier.action !== undefined) {
    props["Action"] = supplier.action ? { select: { name: supplier.action } } : { select: null };
  }
  if (supplier.priority !== null && supplier.priority !== undefined) {
    props["Priority"] = supplier.priority ? { select: { name: supplier.priority } } : { select: null };
  }
  if (supplier.paymentTerms !== null && supplier.paymentTerms !== undefined) {
    props["Payment Terms"] = supplier.paymentTerms ? { select: { name: supplier.paymentTerms } } : { select: null };
  }
  if (supplier.paidAmount !== null && supplier.paidAmount !== undefined) {
    props["Paid amount"] = { number: supplier.paidAmount };
  }
  if (supplier.invoiceValue !== null && supplier.invoiceValue !== undefined) {
    props["Invoice Value"] = { number: supplier.invoiceValue };
  }
  if (supplier.reminder) {
    props["Reminder"] = { date: { start: new Date(supplier.reminder).toISOString() } };
  }
  if (supplier.notes !== null && supplier.notes !== undefined) {
    props["Notes"] = { rich_text: [{ text: { content: supplier.notes } }] };
  }
  if (supplier.updates !== null && supplier.updates !== undefined) {
    props["Updates"] = { rich_text: [{ text: { content: supplier.updates } }] };
  }
  if (supplier.website !== null && supplier.website !== undefined) {
    props["Website"] = { url: supplier.website || null };
  }
  if (Array.isArray(supplier.brand)) {
    props["Brand"] = { multi_select: supplier.brand.map((name) => ({ name })) };
  }
  if (Array.isArray(supplier.product)) {
    props["Product"] = { multi_select: supplier.product.map((name) => ({ name })) };
  }
  if (Array.isArray(supplier.result)) {
    props["Result"] = { multi_select: supplier.result.map((name) => ({ name })) };
  }
  // Pending Payment (formula), Tasks/Daily Tasks Connector/Related to
  // Docs/Docs (relations) and Files & media are read-only from the app's
  // side — Notion computes/links these, so we never write them back.
  return props;
}

function generateSupplierId(existingIds: string[]): string {
  const maxNum = existingIds.reduce((max, id) => {
    const match = id.match(/S-(\d+)/);
    return match ? Math.max(max, parseInt(match[1], 10)) : max;
  }, 0);
  return `S-${String(maxNum + 1).padStart(4, "0")}`;
}

// ---- In-memory sync status (single-process app; not persisted) ----
export const notionSyncStatus = {
  lastPullAt: null as string | null,
  lastPushAt: null as string | null,
  pullInProgress: false,
  pushInProgress: false,
  lastPullCount: null as number | null,
  lastPushCount: null as number | null,
  lastError: null as string | null,
};

// Queries every page in the Contact Connector database, handling pagination.
async function queryAllPages(): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | undefined = undefined;
  do {
    const body: Record<string, any> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = await notionProxy(`/v1/databases/${CONTACT_CONNECTOR_DATABASE_ID}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Notion query failed (${res.status}): ${text}`);
    }
    const data = await res.json();
    pages.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return pages;
}

// Pulls all rows from Notion and upserts into `suppliers`, matched by
// notionPageId. On conflicts (a supplier already exists locally with local
// edits since the last sync), the most-recently-edited side wins.
export async function pullFromNotion(): Promise<{ count: number }> {
  notionSyncStatus.pullInProgress = true;
  notionSyncStatus.lastError = null;
  try {
    const pages = await queryAllPages();
    const existing = await db.select().from(suppliers);
    const bySupplierIdMax = existing.map((s) => s.supplierId);
    let upserts = 0;

    for (const page of pages) {
      const mapped = notionPageToSupplier(page);
      const local = existing.find((s) => s.notionPageId === page.id);

      if (!local) {
        const newId = generateSupplierId(bySupplierIdMax);
        bySupplierIdMax.push(newId);
        await db.insert(suppliers).values({
          supplierId: newId,
          name: mapped.name || "Unnamed Contact",
          contactName: mapped.contactName,
          leadPosition: mapped.leadPosition,
          contactEmail: mapped.contactEmail,
          contactPhone: mapped.contactPhone,
          mobile2: mapped.mobile2,
          leadSource: mapped.leadSource,
          sourceQuality: mapped.sourceQuality,
          country: mapped.country,
          industryMainActivities: mapped.industryMainActivities,
          contactType: mapped.contactType,
          recordId: mapped.recordId,
          action: mapped.action,
          priority: mapped.priority,
          paymentTerms: mapped.paymentTerms,
          pendingPayment: mapped.pendingPayment,
          paidAmount: mapped.paidAmount,
          invoiceValue: mapped.invoiceValue,
          reminder: mapped.reminder,
          notes: mapped.notes,
          updates: mapped.updates,
          website: mapped.website,
          brand: mapped.brand,
          product: mapped.product,
          result: mapped.result,
          filesMedia: mapped.filesMedia,
          tasksRelation: mapped.tasksRelation,
          dailyTasksConnector: mapped.dailyTasksConnector,
          relatedDocs: mapped.relatedDocs,
          docsRelation: mapped.docsRelation,
          notionRawProperties: mapped.notionRawProperties,
          notionPageId: mapped.notionPageId,
          notionLastEditedTime: mapped.notionLastEditedTime,
          appLastEditedTime: mapped.notionLastEditedTime,
          isActive: true,
        });
        upserts++;
        continue;
      }

      // Conflict resolution: most-recently-edited version wins.
      const notionTime = mapped.notionLastEditedTime as Date;
      const appTime = local.appLastEditedTime ? new Date(local.appLastEditedTime) : new Date(0);
      const localNotionTime = local.notionLastEditedTime ? new Date(local.notionLastEditedTime) : new Date(0);

      // A database property can be added or backfilled without changing every
      // page's last-edited timestamp. Apply a changed mapped value even when
      // the page timestamp is unchanged so newly-added Notion fields appear
      // after the next pull.
      const mappedContactTypeChanged = mapped.contactType !== local.contactType;

      // Nothing changed on the Notion side since our last known state — skip,
      // unless the newly mapped contact type still needs to be backfilled.
      if (notionTime.getTime() <= localNotionTime.getTime() && !mappedContactTypeChanged) continue;

      // Notion changed, but the app also changed more recently — app wins,
      // leave the local row untouched (a subsequent push will overwrite Notion).
      if (appTime.getTime() > localNotionTime.getTime() && appTime.getTime() >= notionTime.getTime()) {
        continue;
      }

      // Notion's edit is the newer one — apply it locally.
      await db
        .update(suppliers)
        .set({
          name: mapped.name || local.name,
          contactName: mapped.contactName,
          leadPosition: mapped.leadPosition,
          contactEmail: mapped.contactEmail,
          contactPhone: mapped.contactPhone,
          mobile2: mapped.mobile2,
          leadSource: mapped.leadSource,
          sourceQuality: mapped.sourceQuality,
          country: mapped.country,
          industryMainActivities: mapped.industryMainActivities,
          contactType: mapped.contactType,
          recordId: mapped.recordId,
          action: mapped.action,
          priority: mapped.priority,
          paymentTerms: mapped.paymentTerms,
          pendingPayment: mapped.pendingPayment,
          paidAmount: mapped.paidAmount,
          invoiceValue: mapped.invoiceValue,
          reminder: mapped.reminder,
          notes: mapped.notes,
          updates: mapped.updates,
          website: mapped.website,
          brand: mapped.brand,
          product: mapped.product,
          result: mapped.result,
          filesMedia: mapped.filesMedia,
          tasksRelation: mapped.tasksRelation,
          dailyTasksConnector: mapped.dailyTasksConnector,
          relatedDocs: mapped.relatedDocs,
          docsRelation: mapped.docsRelation,
          notionRawProperties: mapped.notionRawProperties,
          notionLastEditedTime: mapped.notionLastEditedTime,
          appLastEditedTime: mapped.notionLastEditedTime,
          updatedAt: new Date(),
        })
        .where(eq(suppliers.id, local.id));
      upserts++;
    }

    notionSyncStatus.lastPullAt = new Date().toISOString();
    notionSyncStatus.lastPullCount = upserts;
    return { count: upserts };
  } catch (err: any) {
    notionSyncStatus.lastError = err.message || String(err);
    throw err;
  } finally {
    notionSyncStatus.pullInProgress = false;
  }
}

// Pushes local changes back to Notion: updates linked pages whose
// appLastEditedTime is newer than their notionLastEditedTime, and creates
// new Notion pages for suppliers with no notionPageId yet.
export async function pushToNotion(): Promise<{ count: number }> {
  notionSyncStatus.pushInProgress = true;
  notionSyncStatus.lastError = null;
  try {
    const all = await db.select().from(suppliers);
    let pushed = 0;

    for (const supplier of all) {
      const appTime = supplier.appLastEditedTime ? new Date(supplier.appLastEditedTime) : null;
      const notionTime = supplier.notionLastEditedTime ? new Date(supplier.notionLastEditedTime) : null;

      if (!supplier.notionPageId) {
        // New app-created contact — create a Notion page.
        const properties = supplierToNotionProperties(supplier);
        properties["Record Id"] = { title: [{ text: { content: supplier.name || supplier.supplierId } }] };
        const res = await notionProxy(`/v1/pages`, {
          method: "POST",
          body: JSON.stringify({
            parent: { database_id: CONTACT_CONNECTOR_DATABASE_ID },
            properties,
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Notion page create failed (${res.status}): ${text}`);
        }
        const created = await res.json();
        await db
          .update(suppliers)
          .set({
            notionPageId: created.id,
            notionLastEditedTime: new Date(created.last_edited_time),
          })
          .where(eq(suppliers.id, supplier.id));
        pushed++;
        continue;
      }

      // Only push if the app side is strictly newer than the last known
      // Notion state (i.e. it hasn't already been synced).
      if (appTime && (!notionTime || appTime.getTime() > notionTime.getTime())) {
        const properties = supplierToNotionProperties(supplier);
        const res = await notionProxy(`/v1/pages/${supplier.notionPageId}`, {
          method: "PATCH",
          body: JSON.stringify({ properties }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Notion page update failed (${res.status}): ${text}`);
        }
        const updated = await res.json();
        await db
          .update(suppliers)
          .set({ notionLastEditedTime: new Date(updated.last_edited_time) })
          .where(eq(suppliers.id, supplier.id));
        pushed++;
      }
    }

    notionSyncStatus.lastPushAt = new Date().toISOString();
    notionSyncStatus.lastPushCount = pushed;
    return { count: pushed };
  } catch (err: any) {
    notionSyncStatus.lastError = err.message || String(err);
    throw err;
  } finally {
    notionSyncStatus.pushInProgress = false;
  }
}

const PULL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function startNotionSyncScheduler(): void {
  // Fire an initial pull shortly after startup, then repeat on interval.
  setTimeout(() => {
    pullFromNotion().catch((err) => console.error("[NotionSync] Initial pull failed:", err.message || err));
  }, 5000);

  setInterval(() => {
    pullFromNotion().catch((err) => console.error("[NotionSync] Scheduled pull failed:", err.message || err));
  }, PULL_INTERVAL_MS);
}
