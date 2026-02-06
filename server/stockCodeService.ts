import { db } from "./db";
import { treeNodes, products, colors, stockCodeHistory } from "@shared/schema";
import { eq } from "drizzle-orm";

export function generateBranchCodeFromName(name: string, existingCodes: string[]): string {
  const cleanName = name.trim().toUpperCase();
  const words = cleanName.split(/\s+/).filter(w => w.length > 0);
  
  const candidates: string[] = [];
  
  if (words.length === 1) {
    const word = words[0];
    candidates.push(word.substring(0, 2));
    candidates.push(word.substring(0, 3));
    const consonants = word.replace(/[AEIOU]/g, '');
    if (consonants.length >= 2) candidates.push(consonants.substring(0, 2));
    if (consonants.length >= 3) candidates.push(consonants.substring(0, 3));
  } else {
    candidates.push(words.map(w => w[0]).join('').substring(0, 5));
    if (words.length >= 2) {
      candidates.push((words[0].substring(0, 1) + words[1].substring(0, 1)));
      candidates.push((words[0].substring(0, 2) + words[1].substring(0, 1)));
    }
    const consonants = words[0].replace(/[AEIOU]/g, '');
    if (consonants.length >= 2) candidates.push(consonants.substring(0, 2));
  }
  
  for (const c of candidates) {
    if (c.length >= 2 && !existingCodes.includes(c)) return c;
  }
  
  const base = candidates[0] || cleanName.substring(0, 2);
  for (let i = 1; i <= 99; i++) {
    const candidate = `${base}${i}`;
    if (candidate.length <= 5 && !existingCodes.includes(candidate)) return candidate;
  }
  
  return `${base}${Date.now() % 100}`;
}

export function validateBranchCode(code: string): { valid: boolean; error?: string } {
  if (!code) return { valid: false, error: 'Branch code is required' };
  if (code !== code.toUpperCase()) return { valid: false, error: 'Must be uppercase' };
  if (code.length > 5) return { valid: false, error: 'Maximum 5 characters' };
  if (code.length < 1) return { valid: false, error: 'Minimum 1 character' };
  if (/\s/.test(code)) return { valid: false, error: 'No spaces allowed' };
  if (!/^[A-Z0-9]+$/.test(code)) return { valid: false, error: 'Only uppercase letters and numbers' };
  return { valid: true };
}

export async function getNodePath(nodeId: string): Promise<Array<{ nodeId: string; name: string; branchCode: string | null }>> {
  const allNodes = await db.select().from(treeNodes);
  const path: Array<{ nodeId: string; name: string; branchCode: string | null }> = [];
  
  let current = allNodes.find(n => n.nodeId === nodeId);
  while (current) {
    path.unshift({ nodeId: current.nodeId, name: current.name, branchCode: current.branchCode });
    current = allNodes.find(n => n.nodeId === current?.parentId);
  }
  
  return path;
}

function padProductId(id: number): string {
  return String(id).padStart(4, '0');
}

export async function generateStockCode(
  nodeId: string,
  productDbId: number,
  colorId?: number | null
): Promise<string> {
  const path = await getNodePath(nodeId);
  
  const segments = ['P'];
  
  for (const node of path) {
    if (node.branchCode) {
      segments.push(node.branchCode);
    }
  }
  
  if (colorId) {
    const [color] = await db.select().from(colors).where(eq(colors.id, colorId));
    if (color) {
      segments.push(color.code);
    }
  }
  
  segments.push(padProductId(productDbId));
  
  return segments.join('.');
}

export async function previewStockCode(
  nodeId: string,
  colorId?: number | null,
  productId?: string | null
): Promise<string> {
  const path = await getNodePath(nodeId);
  
  const segments = ['P'];
  
  for (const node of path) {
    if (node.branchCode) {
      segments.push(node.branchCode);
    }
  }
  
  if (colorId) {
    const [color] = await db.select().from(colors).where(eq(colors.id, colorId));
    if (color) {
      segments.push(color.code);
    }
  }
  
  if (productId) {
    const [product] = await db.select().from(products).where(eq(products.productId, productId));
    if (product) {
      segments.push(padProductId(product.id));
    } else {
      segments.push('XXXX');
    }
  } else {
    segments.push('XXXX');
  }
  
  return segments.join('.');
}

export async function updateProductStockCode(
  productId: string,
  reason: string,
  changedBy?: string
): Promise<string | null> {
  const [product] = await db.select().from(products).where(eq(products.productId, productId));
  if (!product) return null;
  
  const newCode = await generateStockCode(product.nodeId, product.id, product.colorId);
  const oldCode = product.stockCode;
  
  if (oldCode === newCode) return newCode;
  
  await db.update(products)
    .set({ stockCode: newCode, lastUpdated: new Date() })
    .where(eq(products.productId, productId));
  
  await db.insert(stockCodeHistory).values({
    productId,
    oldStockCode: oldCode,
    newStockCode: newCode,
    reason,
    changedBy: changedBy || 'System',
  });
  
  return newCode;
}

export async function bulkRegenerateStockCodes(changedBy?: string): Promise<number> {
  const allProducts = await db.select().from(products);
  let updated = 0;
  
  for (const product of allProducts) {
    const newCode = await generateStockCode(product.nodeId, product.id, product.colorId);
    if (newCode !== product.stockCode) {
      await db.update(products)
        .set({ stockCode: newCode, lastUpdated: new Date() })
        .where(eq(products.productId, product.productId));
      
      await db.insert(stockCodeHistory).values({
        productId: product.productId,
        oldStockCode: product.stockCode,
        newStockCode: newCode,
        reason: 'Bulk regeneration',
        changedBy: changedBy || 'System',
      });
      
      updated++;
    }
  }
  
  return updated;
}

export async function migrateExistingBranchCodes(): Promise<number> {
  const allNodes = await db.select().from(treeNodes);
  const existingCodes = allNodes
    .filter(n => n.branchCode)
    .map(n => n.branchCode!);
  
  let migrated = 0;
  
  for (const node of allNodes) {
    if (!node.branchCode) {
      const code = generateBranchCodeFromName(node.name, existingCodes);
      await db.update(treeNodes)
        .set({ branchCode: code, updatedAt: new Date() })
        .where(eq(treeNodes.nodeId, node.nodeId));
      existingCodes.push(code);
      migrated++;
    }
  }
  
  return migrated;
}

export async function regenerateStockCodesForNode(nodeId: string, changedBy?: string): Promise<number> {
  const allNodes = await db.select().from(treeNodes);
  const affectedNodeIds = [nodeId];
  
  const findDescendants = (parentId: string) => {
    allNodes.forEach(node => {
      if (node.parentId === parentId) {
        affectedNodeIds.push(node.nodeId);
        findDescendants(node.nodeId);
      }
    });
  };
  findDescendants(nodeId);
  
  let updated = 0;
  for (const nid of affectedNodeIds) {
    const nodeProducts = await db.select().from(products).where(eq(products.nodeId, nid));
    for (const product of nodeProducts) {
      const newCode = await generateStockCode(product.nodeId, product.id, product.colorId);
      if (newCode !== product.stockCode) {
        await db.update(products)
          .set({ stockCode: newCode, lastUpdated: new Date() })
          .where(eq(products.productId, product.productId));
        
        await db.insert(stockCodeHistory).values({
          productId: product.productId,
          oldStockCode: product.stockCode,
          newStockCode: newCode,
          reason: `Taxonomy branch code changed`,
          changedBy: changedBy || 'System',
        });
        
        updated++;
      }
    }
  }
  
  return updated;
}

export async function getStockCodeHistoryForProduct(productId: string) {
  return db.select().from(stockCodeHistory)
    .where(eq(stockCodeHistory.productId, productId))
    .orderBy(stockCodeHistory.changedAt);
}
