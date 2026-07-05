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
// Notion property name -> suppliers column
//   Lead Name (rich_text)                        -> contactName
//   Company Name (rich_text)                      -> name
//   Lead Position (rich_text)                      -> leadPosition
//   Email (email)                                   -> contactEmail
//   Mobile (phone_number)                           -> contactPhone
//   Lead Source (select)                            -> leadSource
//   Source Quality (select)                         -> sourceQuality
//   Country (select)                                -> country
//   Industry Connector (Main Activities) (multi_select) -> industryMainActivities

function getRichText(prop: any): string | undefined {
  const arr = prop?.rich_text || prop?.title;
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  return arr.map((t: any) => t.plain_text).join("").trim() || undefined;
}

function getSelect(prop: any): string | undefined {
  return prop?.select?.name || undefined;
}

function getMultiSelect(prop: any): string | undefined {
  const arr = prop?.multi_select;
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  return arr.map((o: any) => o.name).join(", ");
}

function getEmail(prop: any): string | undefined {
  return prop?.email || undefined;
}

function getPhone(prop: any): string | undefined {
  return prop?.phone_number || undefined;
}

// Maps a Notion page's properties into a partial supplier row.
function notionPageToSupplier(page: NotionPage): Partial<InsertSupplier> {
  const props = page.properties;
  return {
    contactName: getRichText(props["Lead Name"]),
    name: getRichText(props["Company Name"]) || getRichText(props["Lead Name"]) || "Unnamed Contact",
    leadPosition: getRichText(props["Lead Position"]),
    contactEmail: getEmail(props["Email"]),
    contactPhone: getPhone(props["Mobile"]),
    leadSource: getSelect(props["Lead Source"]),
    sourceQuality: getSelect(props["Source Quality"]),
    country: getSelect(props["Country"]),
    industryMainActivities: getMultiSelect(props["Industry Connector (Main Activities)"]),
    notionPageId: page.id,
    notionLastEditedTime: new Date(page.last_edited_time),
  };
}

// Maps a supplier row into Notion property-update payload (only the
// columns we own — never touches Notion-only fields like Action/Tasks/etc).
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
          leadSource: mapped.leadSource,
          sourceQuality: mapped.sourceQuality,
          country: mapped.country,
          industryMainActivities: mapped.industryMainActivities,
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

      // Nothing changed on the Notion side since our last known state — skip.
      if (notionTime.getTime() <= localNotionTime.getTime()) continue;

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
          leadSource: mapped.leadSource,
          sourceQuality: mapped.sourceQuality,
          country: mapped.country,
          industryMainActivities: mapped.industryMainActivities,
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
