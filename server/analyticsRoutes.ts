import type { Express } from "express";
import { db } from "./db";
import { systems, systemLayers, systemProductOptions, products, suppliers, treeNodes, sectors } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { authMiddleware, requirePasswordChange } from "./authRoutes";

function applyFilters(
  query: Record<string, any>,
  data: { allProducts: any[]; allSystems: any[]; allNodes?: any[] }
): { allProducts: any[]; allSystems: any[] } {
  let { allProducts, allSystems } = data;
  const supplierFilter = query.supplier as string | undefined;
  const sectorFilter = query.sector as string | undefined;
  const taxonomyFilter = query.taxonomy as string | undefined;

  if (supplierFilter) {
    allProducts = allProducts.filter(p => p.supplierId === supplierFilter);
  }
  if (sectorFilter) {
    allSystems = allSystems.filter(s => {
      const mapping = s.sectorMapping as string[] | undefined;
      return Array.isArray(mapping) && mapping.includes(sectorFilter);
    });
  }
  if (taxonomyFilter && data.allNodes) {
    const descendantIds = getDescendantNodeIds(taxonomyFilter, data.allNodes);
    allProducts = allProducts.filter(p => descendantIds.includes(p.nodeId));
  }

  return { allProducts, allSystems };
}

export function registerAnalyticsRoutes(app: Express): void {
  app.use("/api/analytics", authMiddleware, requirePasswordChange);

  app.get("/api/analytics/overview", async (req, res) => {
    try {
      let allProducts = await db.select().from(products);
      const allSuppliers = await db.select().from(suppliers);
      let allSystems = await db.select().from(systems);
      const allLayers = await db.select().from(systemLayers);
      const allOptions = await db.select().from(systemProductOptions);
      const allNodes = await db.select().from(treeNodes);

      ({ allProducts, allSystems } = applyFilters(req.query, { allProducts, allSystems, allNodes }));

      const supplierProductMap: Record<string, Set<string>> = {};
      for (const p of allProducts) {
        if (p.supplierId) {
          if (!supplierProductMap[p.supplierId]) supplierProductMap[p.supplierId] = new Set();
          supplierProductMap[p.supplierId].add(p.productId);
        }
      }

      const systemSupplierMap: Record<string, Set<string>> = {};
      for (const sys of allSystems) {
        systemSupplierMap[sys.systemId] = new Set();
        const sysLayerIds = allLayers.filter(l => l.systemId === sys.systemId).map(l => l.layerId);
        const sysProductIds = allOptions.filter(o => sysLayerIds.includes(o.layerId)).map(o => o.productId);
        for (const pid of sysProductIds) {
          const prod = allProducts.find(p => p.productId === pid);
          if (prod?.supplierId) {
            systemSupplierMap[sys.systemId].add(prod.supplierId);
          }
        }
      }

      const multiSupplierSystems = Object.values(systemSupplierMap).filter(s => s.size > 1).length;
      const avgSuppliersPerSystem = allSystems.length > 0
        ? Object.values(systemSupplierMap).reduce((a, s) => a + s.size, 0) / allSystems.length
        : 0;

      const productSupplierCount: Record<string, Set<string>> = {};
      for (const opt of allOptions) {
        const prod = allProducts.find(p => p.productId === opt.productId);
        if (prod) {
          if (!productSupplierCount[prod.productId]) productSupplierCount[prod.productId] = new Set();
          if (prod.supplierId) productSupplierCount[prod.productId].add(prod.supplierId);
        }
      }
      const productsWithMultipleSuppliers = Object.values(productSupplierCount).filter(s => s.size > 1).length;

      const supplierSystemCount: Record<string, number> = {};
      for (const [sysId, supSet] of Object.entries(systemSupplierMap)) {
        for (const sup of supSet) {
          supplierSystemCount[sup] = (supplierSystemCount[sup] || 0) + 1;
        }
      }
      const dominantSupplier = Object.entries(supplierSystemCount).sort((a, b) => b[1] - a[1])[0];
      const dominantSupplierObj = dominantSupplier
        ? allSuppliers.find(s => s.supplierId === dominantSupplier[0])
        : null;

      const mostDiverseSystem = Object.entries(systemSupplierMap)
        .sort((a, b) => b[1].size - a[1].size)[0];
      const mostDiverseSystemObj = mostDiverseSystem
        ? allSystems.find(s => s.systemId === mostDiverseSystem[0])
        : null;

      const totalSystemVariants = allSystems.reduce((acc, sys) => {
        const sectorMap = sys.sectorMapping as string[] | undefined;
        return acc + Math.max(1, Array.isArray(sectorMap) ? sectorMap.length : 0);
      }, 0);

      const supplierConcentration = allSuppliers.length > 0
        ? (Object.keys(supplierSystemCount).length / allSuppliers.length) * 100
        : 0;

      const uniqueProductsInSystems = new Set(allOptions.map(o => o.productId));
      const supplierTechCoverage = allSuppliers.length > 0
        ? (Object.keys(supplierProductMap).length / allSuppliers.length) * 100
        : 0;

      res.json({
        totalProducts: allProducts.length,
        totalSystems: allSystems.length,
        totalSuppliers: allSuppliers.length,
        totalSystemVariants,
        avgSuppliersPerSystem: Math.round(avgSuppliersPerSystem * 10) / 10,
        multiSupplierSystemsPct: allSystems.length > 0 ? Math.round((multiSupplierSystems / allSystems.length) * 100) : 0,
        productsWithMultipleSuppliers,
        systemsWithEquivalentProducts: multiSupplierSystems,
        supplierTechCoverage: Math.round(supplierTechCoverage),
        dominantSupplier: dominantSupplierObj?.name || 'N/A',
        mostDiverseSystem: mostDiverseSystemObj?.name || 'N/A',
        supplierConcentrationIndex: Math.round(supplierConcentration),
        totalLayers: allLayers.length,
        totalProductOptions: allOptions.length,
        uniqueProductsInSystems: uniqueProductsInSystems.size,
        totalTaxonomyNodes: allNodes.length,
      });
    } catch (error) {
      console.error("Analytics overview error:", error);
      res.status(500).json({ error: "Failed to fetch analytics overview" });
    }
  });

  app.get("/api/analytics/product-intelligence", async (req, res) => {
    try {
      let allProducts = await db.select().from(products);
      const allSuppliers = await db.select().from(suppliers);
      let allSystems = await db.select().from(systems);
      const allLayers = await db.select().from(systemLayers);
      const allOptions = await db.select().from(systemProductOptions);
      const allNodes = await db.select().from(treeNodes);

      ({ allProducts, allSystems } = applyFilters(req.query, { allProducts, allSystems, allNodes }));

      const productUtilBySupplier: Record<string, Record<string, number>> = {};
      for (const opt of allOptions) {
        const prod = allProducts.find(p => p.productId === opt.productId);
        if (!prod) continue;
        const supplierName = prod.supplier || 'Unknown';
        const sysLayer = allLayers.find(l => l.layerId === opt.layerId);
        if (!sysLayer) continue;
        if (!productUtilBySupplier[prod.name]) productUtilBySupplier[prod.name] = {};
        productUtilBySupplier[prod.name][supplierName] = (productUtilBySupplier[prod.name][supplierName] || 0) + 1;
      }

      const supplierNames = [...new Set(allProducts.map(p => p.supplier || 'Unknown'))];
      const productUtilChart = Object.entries(productUtilBySupplier).slice(0, 20).map(([prodName, suppliers]) => {
        const entry: Record<string, any> = { product: prodName.substring(0, 25) };
        for (const sn of supplierNames) {
          entry[sn] = suppliers[sn] || 0;
        }
        return entry;
      });

      let singleSource = 0, dualSource = 0, multiSource = 0;
      const productSuppliers: Record<string, Set<string>> = {};
      for (const p of allProducts) {
        if (!productSuppliers[p.name]) productSuppliers[p.name] = new Set();
        if (p.supplier) productSuppliers[p.name].add(p.supplier);
      }
      for (const suppliers of Object.values(productSuppliers)) {
        if (suppliers.size <= 1) singleSource++;
        else if (suppliers.size === 2) dualSource++;
        else multiSource++;
      }

      res.json({
        productUtilBySupplier: productUtilChart,
        supplierKeys: supplierNames.slice(0, 10),
        supplierDependency: [
          { id: 'Single Source', label: 'Single Source', value: singleSource, color: '#ef4444' },
          { id: 'Dual Source', label: 'Dual Source', value: dualSource, color: '#f59e0b' },
          { id: 'Multi Source', label: 'Multi Source', value: multiSource, color: '#22c55e' },
        ].filter(d => d.value > 0),
      });
    } catch (error) {
      console.error("Product intelligence error:", error);
      res.status(500).json({ error: "Failed to fetch product intelligence" });
    }
  });

  app.get("/api/analytics/system-intelligence", async (req, res) => {
    try {
      let allProducts = await db.select().from(products);
      let allSystems = await db.select().from(systems);
      const allLayers = await db.select().from(systemLayers);
      const allOptions = await db.select().from(systemProductOptions);
      const allNodes = await db.select().from(treeNodes);

      ({ allProducts, allSystems } = applyFilters(req.query, { allProducts, allSystems, allNodes }));

      const systemVariants = allSystems.map(sys => {
        const sectorMap = sys.sectorMapping as string[] | undefined;
        const sysLayers = allLayers.filter(l => l.systemId === sys.systemId);
        const layerIds = sysLayers.map(l => l.layerId);
        const sysOptions = allOptions.filter(o => layerIds.includes(o.layerId));
        const supplierSet = new Set<string>();
        for (const opt of sysOptions) {
          const prod = allProducts.find(p => p.productId === opt.productId);
          if (prod?.supplier) supplierSet.add(prod.supplier);
        }
        return {
          name: sys.name.substring(0, 30),
          variants: Array.isArray(sectorMap) ? sectorMap.length : 0,
          layerCount: sysLayers.length,
          supplierCount: supplierSet.size,
          productCount: sysOptions.length,
        };
      });

      const scatterData = systemVariants.map(sv => ({
        x: sv.layerCount,
        y: sv.supplierCount,
        name: sv.name,
      }));

      const layerFlexibility: Record<string, Record<string, number>> = {};
      for (const layer of allLayers) {
        const layerType = classifyLayerType(layer.layerName);
        const layerOpts = allOptions.filter(o => o.layerId === layer.layerId);
        if (!layerFlexibility[layerType]) layerFlexibility[layerType] = {};
        for (const opt of layerOpts) {
          const prod = allProducts.find(p => p.productId === opt.productId);
          const supplierName = prod?.supplier || 'Unknown';
          layerFlexibility[layerType][supplierName] = (layerFlexibility[layerType][supplierName] || 0) + 1;
        }
      }

      const allSupNames = new Set<string>();
      for (const v of Object.values(layerFlexibility)) {
        for (const k of Object.keys(v)) allSupNames.add(k);
      }
      const layerFlexChart = Object.entries(layerFlexibility).map(([layerType, suppliers]) => {
        const entry: Record<string, any> = { layerType };
        for (const sn of allSupNames) {
          entry[sn] = suppliers[sn] || 0;
        }
        return entry;
      });

      res.json({
        systemVariants,
        complexityScatter: [{ id: 'Systems', data: scatterData }],
        layerFlexibility: layerFlexChart,
        layerFlexKeys: [...allSupNames].slice(0, 10),
      });
    } catch (error) {
      console.error("System intelligence error:", error);
      res.status(500).json({ error: "Failed to fetch system intelligence" });
    }
  });

  app.get("/api/analytics/supplier-heatmap", async (req, res) => {
    try {
      const mode = (req.query.mode as string) || 'supplier-system';
      let allProducts = await db.select().from(products);
      const allSuppliers = await db.select().from(suppliers);
      let allSystems = await db.select().from(systems);
      const allLayers = await db.select().from(systemLayers);
      const allOptions = await db.select().from(systemProductOptions);
      const allNodes = await db.select().from(treeNodes);

      ({ allProducts, allSystems } = applyFilters(req.query, { allProducts, allSystems, allNodes }));

      let heatmapData: { id: string; data: { x: string; y: number }[] }[] = [];

      if (mode === 'supplier-system') {
        const supplierNames = allSuppliers.map(s => s.name);
        const systemNames = allSystems.map(s => s.name);
        heatmapData = supplierNames.map(supName => {
          const sup = allSuppliers.find(s => s.name === supName)!;
          const supProducts = allProducts.filter(p => p.supplierId === sup.supplierId);
          const supProductIds = supProducts.map(p => p.productId);
          return {
            id: supName,
            data: systemNames.map(sysName => {
              const sys = allSystems.find(s => s.name === sysName)!;
              const sysLayerIds = allLayers.filter(l => l.systemId === sys.systemId).map(l => l.layerId);
              const count = allOptions.filter(o => sysLayerIds.includes(o.layerId) && supProductIds.includes(o.productId)).length;
              return { x: sysName.substring(0, 20), y: count };
            }),
          };
        });
      } else if (mode === 'supplier-layer') {
        const supplierNames = allSuppliers.map(s => s.name);
        const layerTypes = ['Primer', 'Base Coat', 'Top Coat', 'Intermediate', 'Other'];
        heatmapData = supplierNames.map(supName => {
          const sup = allSuppliers.find(s => s.name === supName)!;
          const supProductIds = allProducts.filter(p => p.supplierId === sup.supplierId).map(p => p.productId);
          return {
            id: supName,
            data: layerTypes.map(lt => {
              const matchingLayers = allLayers.filter(l => classifyLayerType(l.layerName) === lt);
              const matchingLayerIds = matchingLayers.map(l => l.layerId);
              const count = allOptions.filter(o => matchingLayerIds.includes(o.layerId) && supProductIds.includes(o.productId)).length;
              return { x: lt, y: count };
            }),
          };
        });
      } else if (mode === 'supplier-sector') {
        const supplierNames = allSuppliers.map(s => s.name);
        const allSectorNames = new Set<string>();
        for (const sys of allSystems) {
          const mapping = sys.sectorMapping as string[] | undefined;
          if (Array.isArray(mapping)) mapping.forEach(s => allSectorNames.add(s));
        }
        const sectorList = [...allSectorNames];
        if (sectorList.length === 0) { return res.json([]); }
        heatmapData = supplierNames.map(supName => {
          const sup = allSuppliers.find(s => s.name === supName)!;
          const supProductIds = allProducts.filter(p => p.supplierId === sup.supplierId).map(p => p.productId);
          return {
            id: supName,
            data: sectorList.map(secName => {
              const sectorSystems = allSystems.filter(s => {
                const m = s.sectorMapping as string[] | undefined;
                return Array.isArray(m) && m.includes(secName);
              });
              const sectorLayerIds = sectorSystems.flatMap(s =>
                allLayers.filter(l => l.systemId === s.systemId).map(l => l.layerId)
              );
              const count = allOptions.filter(o => sectorLayerIds.includes(o.layerId) && supProductIds.includes(o.productId)).length;
              return { x: secName, y: count };
            }),
          };
        });
      } else if (mode === 'supplier-taxonomy') {
        const supplierNames = allSuppliers.map(s => s.name);
        const rootNodes = allNodes.filter(n => !n.parentId).slice(0, 15);
        heatmapData = supplierNames.map(supName => {
          const sup = allSuppliers.find(s => s.name === supName)!;
          const supProducts = allProducts.filter(p => p.supplierId === sup.supplierId);
          return {
            id: supName,
            data: rootNodes.map(node => {
              const descendantIds = getDescendantNodeIds(node.nodeId, allNodes);
              const count = supProducts.filter(p => descendantIds.includes(p.nodeId)).length;
              return { x: node.name.substring(0, 20), y: count };
            }),
          };
        });
      } else if (mode === 'supplier-stockcode') {
        const supplierNames = allSuppliers.map(s => s.name);
        const prefixes = new Set<string>();
        for (const p of allProducts) {
          if (p.stockCode) {
            const parts = p.stockCode.split('.');
            if (parts.length >= 2) prefixes.add(parts.slice(0, 2).join('.'));
          }
        }
        const prefixList = [...prefixes].slice(0, 15);
        if (prefixList.length === 0) { return res.json([]); }
        heatmapData = supplierNames.map(supName => {
          const sup = allSuppliers.find(s => s.name === supName)!;
          const supProducts = allProducts.filter(p => p.supplierId === sup.supplierId);
          return {
            id: supName,
            data: prefixList.map(prefix => {
              const count = supProducts.filter(p => p.stockCode?.startsWith(prefix)).length;
              return { x: prefix, y: count };
            }),
          };
        });
      } else if (mode === 'supplier-complexity') {
        const supplierNames = allSuppliers.map(s => s.name);
        const complexityBuckets = ['Simple (1-2)', 'Medium (3-4)', 'Complex (5+)'];
        heatmapData = supplierNames.map(supName => {
          const sup = allSuppliers.find(s => s.name === supName)!;
          const supProductIds = allProducts.filter(p => p.supplierId === sup.supplierId).map(p => p.productId);
          return {
            id: supName,
            data: complexityBuckets.map(bucket => {
              let count = 0;
              for (const sys of allSystems) {
                const sysLayers = allLayers.filter(l => l.systemId === sys.systemId);
                const layerCount = sysLayers.length;
                const inBucket = (bucket.includes('Simple') && layerCount <= 2) ||
                  (bucket.includes('Medium') && layerCount >= 3 && layerCount <= 4) ||
                  (bucket.includes('Complex') && layerCount >= 5);
                if (!inBucket) continue;
                const layerIds = sysLayers.map(l => l.layerId);
                count += allOptions.filter(o => layerIds.includes(o.layerId) && supProductIds.includes(o.productId)).length;
              }
              return { x: bucket, y: count };
            }),
          };
        });
      }

      heatmapData = heatmapData.filter(row => row.data.some(d => d.y > 0));
      res.json(heatmapData);
    } catch (error) {
      console.error("Supplier heatmap error:", error);
      res.status(500).json({ error: "Failed to fetch supplier heatmap" });
    }
  });

  app.get("/api/analytics/taxonomy-supplier", async (req, res) => {
    try {
      let allProducts = await db.select().from(products);
      const allSuppliers = await db.select().from(suppliers);
      const allNodes = await db.select().from(treeNodes);
      let allSystems = await db.select().from(systems);

      ({ allProducts, allSystems } = applyFilters(req.query, { allProducts, allSystems, allNodes }));

      const branchDistribution: Record<string, Record<string, number>> = {};
      const rootNodes = allNodes.filter(n => !n.parentId);

      for (const root of rootNodes) {
        const descendantIds = getDescendantNodeIds(root.nodeId, allNodes);
        branchDistribution[root.name] = {};
        for (const p of allProducts.filter(pr => descendantIds.includes(pr.nodeId))) {
          const supName = p.supplier || 'Unknown';
          branchDistribution[root.name][supName] = (branchDistribution[root.name][supName] || 0) + 1;
        }
      }

      const allSupNames = new Set<string>();
      for (const v of Object.values(branchDistribution)) {
        for (const k of Object.keys(v)) allSupNames.add(k);
      }

      const branchChart = Object.entries(branchDistribution).map(([branch, suppliers]) => {
        const entry: Record<string, any> = { branch: branch.substring(0, 20) };
        for (const sn of allSupNames) {
          entry[sn] = suppliers[sn] || 0;
        }
        return entry;
      });

      const treemapData = {
        name: 'Suppliers',
        children: allSuppliers.map(sup => {
          const supProducts = allProducts.filter(p => p.supplierId === sup.supplierId);
          const sectorGroups: Record<string, any[]> = {};
          const nameCounters: Record<string, number> = {};
          for (const p of supProducts) {
            const sec = p.sector || 'General';
            if (!sectorGroups[sec]) sectorGroups[sec] = [];
            const baseName = p.name.substring(0, 20);
            const key = `${sec}:${baseName}`;
            nameCounters[key] = (nameCounters[key] || 0) + 1;
            const uniqueName = nameCounters[key] > 1 ? `${baseName} (${nameCounters[key]})` : baseName;
            sectorGroups[sec].push({ name: uniqueName, value: 1 });
          }
          return {
            name: sup.name,
            children: Object.entries(sectorGroups).map(([sec, prods]) => ({
              name: sec,
              children: prods.slice(0, 10),
            })),
          };
        }).filter(s => s.children.length > 0),
      };

      const stockCodeHeatmap: { id: string; data: { x: string; y: number }[] }[] = [];
      const prefixes = new Set<string>();
      for (const p of allProducts) {
        if (p.stockCode) {
          const parts = p.stockCode.split('.');
          if (parts.length >= 2) prefixes.add(parts.slice(0, 2).join('.'));
        }
      }
      const prefixList = [...prefixes].slice(0, 15);
      for (const sup of allSuppliers) {
        const supProducts = allProducts.filter(p => p.supplierId === sup.supplierId);
        if (supProducts.length === 0) continue;
        stockCodeHeatmap.push({
          id: sup.name,
          data: prefixList.map(prefix => ({
            x: prefix,
            y: supProducts.filter(p => p.stockCode?.startsWith(prefix)).length,
          })),
        });
      }

      res.json({
        branchDistribution: branchChart,
        branchKeys: [...allSupNames].slice(0, 10),
        treemapData,
        stockCodeHeatmap,
      });
    } catch (error) {
      console.error("Taxonomy supplier error:", error);
      res.status(500).json({ error: "Failed to fetch taxonomy supplier data" });
    }
  });

  app.get("/api/analytics/coverage-radar", async (req, res) => {
    try {
      let allProducts = await db.select().from(products);
      const allSuppliers = await db.select().from(suppliers);
      let allSystems = await db.select().from(systems);
      const allLayers = await db.select().from(systemLayers);
      const allOptions = await db.select().from(systemProductOptions);
      const allNodes = await db.select().from(treeNodes);

      ({ allProducts, allSystems } = applyFilters(req.query, { allProducts, allSystems, allNodes }));

      const radarData: { dimension: string; [key: string]: any }[] = [];
      const dimensions = [
        'Sector Coverage',
        'Layer Coverage',
        'System Complexity',
        'Taxonomy Depth',
        'Product Variety',
        'System Reusability',
      ];

      const allSectorNames = new Set<string>();
      for (const sys of allSystems) {
        const mapping = sys.sectorMapping as string[] | undefined;
        if (Array.isArray(mapping)) mapping.forEach(s => allSectorNames.add(s));
      }
      const totalSectors = Math.max(allSectorNames.size, 1);
      const layerTypes = new Set(allLayers.map(l => classifyLayerType(l.layerName)));
      const totalLayerTypes = Math.max(layerTypes.size, 1);
      const maxComplexity = Math.max(...allSystems.map(sys => allLayers.filter(l => l.systemId === sys.systemId).length), 1);
      const maxTaxDepth = Math.max(...allNodes.map(n => getNodeDepth(n.nodeId, allNodes)), 1);

      for (const dim of dimensions) {
        const entry: { [key: string]: any; dimension: string } = { dimension: dim };
        for (const sup of allSuppliers.slice(0, 5)) {
          const supProducts = allProducts.filter(p => p.supplierId === sup.supplierId);
          const supProductIds = supProducts.map(p => p.productId);
          let score = 0;

          if (dim === 'Sector Coverage') {
            const coveredSectors = new Set<string>();
            for (const sys of allSystems) {
              const sysLayerIds = allLayers.filter(l => l.systemId === sys.systemId).map(l => l.layerId);
              const hasSupProduct = allOptions.some(o => sysLayerIds.includes(o.layerId) && supProductIds.includes(o.productId));
              if (hasSupProduct) {
                const mapping = sys.sectorMapping as string[] | undefined;
                if (Array.isArray(mapping)) mapping.forEach(s => coveredSectors.add(s));
              }
            }
            score = Math.round((coveredSectors.size / totalSectors) * 100);
          } else if (dim === 'Layer Coverage') {
            const coveredTypes = new Set<string>();
            for (const opt of allOptions.filter(o => supProductIds.includes(o.productId))) {
              const layer = allLayers.find(l => l.layerId === opt.layerId);
              if (layer) coveredTypes.add(classifyLayerType(layer.layerName));
            }
            score = Math.round((coveredTypes.size / totalLayerTypes) * 100);
          } else if (dim === 'System Complexity') {
            const complexSystems = allSystems.filter(sys => {
              const sysLayerIds = allLayers.filter(l => l.systemId === sys.systemId).map(l => l.layerId);
              return allOptions.some(o => sysLayerIds.includes(o.layerId) && supProductIds.includes(o.productId)) &&
                sysLayerIds.length >= 3;
            });
            score = allSystems.length > 0 ? Math.round((complexSystems.length / allSystems.length) * 100) : 0;
          } else if (dim === 'Taxonomy Depth') {
            const maxDepth = Math.max(...supProducts.map(p => getNodeDepth(p.nodeId, allNodes)), 0);
            score = Math.round((maxDepth / maxTaxDepth) * 100);
          } else if (dim === 'Product Variety') {
            score = Math.round((supProducts.length / Math.max(allProducts.length, 1)) * 100);
          } else if (dim === 'System Reusability') {
            const systemCount = allSystems.filter(sys => {
              const sysLayerIds = allLayers.filter(l => l.systemId === sys.systemId).map(l => l.layerId);
              return allOptions.some(o => sysLayerIds.includes(o.layerId) && supProductIds.includes(o.productId));
            }).length;
            score = allSystems.length > 0 ? Math.round((systemCount / allSystems.length) * 100) : 0;
          }

          entry[sup.name] = Math.min(score, 100);
        }
        radarData.push(entry);
      }

      res.json({
        radarData,
        supplierKeys: allSuppliers.slice(0, 5).map(s => s.name),
      });
    } catch (error) {
      console.error("Coverage radar error:", error);
      res.status(500).json({ error: "Failed to fetch coverage radar" });
    }
  });

  app.get("/api/analytics/competitive-benchmark", async (req, res) => {
    try {
      const systemId = req.query.systemId as string;
      let allProducts = await db.select().from(products);
      const allSuppliers = await db.select().from(suppliers);
      let allSystems = await db.select().from(systems);
      const allLayers = await db.select().from(systemLayers);
      const allOptions = await db.select().from(systemProductOptions);
      const allNodes = await db.select().from(treeNodes);

      ({ allProducts, allSystems } = applyFilters(req.query, { allProducts, allSystems, allNodes }));

      if (!systemId) {
        const benchmarks = allSystems.slice(0, 10).map(sys => {
          const sysLayers = allLayers.filter(l => l.systemId === sys.systemId);
          const layerIds = sysLayers.map(l => l.layerId);
          const sysOptions = allOptions.filter(o => layerIds.includes(o.layerId));
          const supplierSet = new Set<string>();
          for (const opt of sysOptions) {
            const prod = allProducts.find(p => p.productId === opt.productId);
            if (prod?.supplier) supplierSet.add(prod.supplier);
          }
          return {
            systemId: sys.systemId,
            name: sys.name,
            layerCount: sysLayers.length,
            productCount: sysOptions.length,
            supplierCount: supplierSet.size,
            defaultProducts: sysOptions.filter(o => o.isDefault).length,
          };
        });
        return res.json({ systems: benchmarks });
      }

      const system = allSystems.find(s => s.systemId === systemId);
      if (!system) return res.status(404).json({ error: "System not found" });

      const sysLayers = allLayers.filter(l => l.systemId === systemId);
      const layerIds = sysLayers.map(l => l.layerId);
      const sysOptions = allOptions.filter(o => layerIds.includes(o.layerId));

      const supplierBreakdown: Record<string, {
        layerStructure: number;
        productTypes: number;
        defaultProducts: number;
        systemComplexity: number;
        taxonomyCoverage: number;
      }> = {};

      for (const opt of sysOptions) {
        const prod = allProducts.find(p => p.productId === opt.productId);
        if (!prod?.supplier) continue;
        if (!supplierBreakdown[prod.supplier]) {
          supplierBreakdown[prod.supplier] = {
            layerStructure: 0, productTypes: 0, defaultProducts: 0,
            systemComplexity: sysLayers.length, taxonomyCoverage: 0,
          };
        }
        supplierBreakdown[prod.supplier].productTypes++;
        if (opt.isDefault) supplierBreakdown[prod.supplier].defaultProducts++;
        const layerIdx = sysLayers.findIndex(l => l.layerId === opt.layerId);
        if (layerIdx >= 0) supplierBreakdown[prod.supplier].layerStructure = Math.max(
          supplierBreakdown[prod.supplier].layerStructure, layerIdx + 1
        );
      }

      const radarData = [
        { dimension: 'Layer Structure' },
        { dimension: 'Product Types' },
        { dimension: 'Default Products' },
        { dimension: 'System Complexity' },
        { dimension: 'Taxonomy Coverage' },
      ].map(dim => {
        const entry: Record<string, any> = { ...dim };
        for (const [supName, metrics] of Object.entries(supplierBreakdown)) {
          const maxVal = Math.max(
            ...Object.values(supplierBreakdown).map(m => (m as any)[dim.dimension.toLowerCase().replace(/ /g, '')] || 0),
            1
          );
          entry[supName] = Math.round(((metrics as any)[
            dim.dimension === 'Layer Structure' ? 'layerStructure' :
            dim.dimension === 'Product Types' ? 'productTypes' :
            dim.dimension === 'Default Products' ? 'defaultProducts' :
            dim.dimension === 'System Complexity' ? 'systemComplexity' :
            'taxonomyCoverage'
          ] / Math.max(maxVal, 1)) * 100);
        }
        return entry;
      });

      res.json({
        system: system.name,
        radarData,
        supplierKeys: Object.keys(supplierBreakdown),
        supplierBreakdown,
      });
    } catch (error) {
      console.error("Competitive benchmark error:", error);
      res.status(500).json({ error: "Failed to fetch competitive benchmark" });
    }
  });

  app.get("/api/analytics/filters", async (req, res) => {
    try {
      const allSuppliers = await db.select().from(suppliers);
      const allSystems = await db.select().from(systems);
      const allNodes = await db.select().from(treeNodes);

      const sectorSet = new Set<string>();
      for (const sys of allSystems) {
        const mapping = sys.sectorMapping as string[] | undefined;
        if (Array.isArray(mapping)) mapping.forEach(s => sectorSet.add(s));
      }

      const rootBranches = allNodes.filter(n => !n.parentId).map(n => ({ id: n.nodeId, name: n.name }));

      res.json({
        suppliers: allSuppliers.map(s => ({ id: s.supplierId, name: s.name })),
        systems: allSystems.map(s => ({ id: s.systemId, name: s.name })),
        sectors: [...sectorSet].map(s => ({ id: s, name: s })),
        taxonomyNodes: rootBranches,
      });
    } catch (error) {
      console.error("Filters error:", error);
      res.status(500).json({ error: "Failed to fetch filters" });
    }
  });
}

function classifyLayerType(layerName: string): string {
  const name = layerName.toLowerCase();
  if (name.includes('prime') || name.includes('primer')) return 'Primer';
  if (name.includes('base')) return 'Base Coat';
  if (name.includes('top') || name.includes('finish')) return 'Top Coat';
  if (name.includes('intermediate') || name.includes('mid')) return 'Intermediate';
  return 'Other';
}

function getDescendantNodeIds(nodeId: string, allNodes: any[]): string[] {
  const result = [nodeId];
  const children = allNodes.filter(n => n.parentId === nodeId);
  for (const child of children) {
    result.push(...getDescendantNodeIds(child.nodeId, allNodes));
  }
  return result;
}

function getNodeDepth(nodeId: string, allNodes: any[]): number {
  let depth = 0;
  let current = allNodes.find(n => n.nodeId === nodeId);
  while (current?.parentId) {
    depth++;
    current = allNodes.find(n => n.nodeId === current!.parentId);
  }
  return depth;
}
