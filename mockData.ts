
import { Product, TreeNode } from './types';

export const INITIAL_TREE_NODES: TreeNode[] = [
  { id: 'node-1', name: 'Chemical', type: 'sector', parentId: null, description: 'Industrial and fine chemicals' },
  { id: 'node-2', name: 'Industrial Grade', type: 'category', parentId: 'node-1' },
  { id: 'node-3', name: 'Resins', type: 'subcategory', parentId: 'node-2' },
  { id: 'node-4', name: 'Textile', type: 'sector', parentId: null },
  { id: 'node-5', name: 'Sustainable Fabrics', type: 'category', parentId: 'node-4' },
  { id: 'node-6', name: 'Cotton Based', type: 'subcategory', parentId: 'node-5' },
  { id: 'node-7', name: 'Electronics', type: 'sector', parentId: null },
  { id: 'node-8', name: 'Semiconductors', type: 'category', parentId: 'node-7' },
  { id: 'node-9', name: 'Microprocessors', type: 'subcategory', parentId: 'node-8' },
];

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'PRD-001',
    name: 'Industrial Grade Resin',
    supplier: 'Global Chem Co',
    nodeId: 'node-3',
    category: 'Raw Materials',
    sector: 'Chemical',
    manufacturer: 'ChemFab Industries',
    manufacturingLocation: 'Germany, Ludwigshafen',
    description: 'High-performance epoxy resin for industrial bonding applications.',
    imageUrl: 'https://picsum.photos/seed/resin/400/300',
    price: 1250,
    currency: 'EUR',
    unit: 'ton',
    moq: 5,
    leadTime: 21,
    packagingType: 'Steel Drum',
    certifications: ['ISO 9001', 'REACH'],
    shelfLife: '24 months',
    storageConditions: 'Cool, dry place away from sunlight',
    customFields: [],
    dateAdded: '2024-01-15T10:00:00Z',
    lastUpdated: '2024-03-20T14:30:00Z',
    createdBy: 'Admin User',
    history: [
      {
        id: 'HIST-001',
        timestamp: '2024-03-20T14:30:00Z',
        userId: 'U-01',
        userName: 'Admin User',
        changes: {
          price: { old: 1200, new: 1250 }
        },
        snapshot: {}
      }
    ]
  },
  {
    id: 'PRD-002',
    name: 'Sustainable Cotton Fabric',
    supplier: 'EcoTextile Ltd',
    nodeId: 'node-6',
    category: 'Finished Goods',
    sector: 'Textile',
    manufacturer: 'Green Weave',
    manufacturingLocation: 'India, Tirupur',
    description: 'Organic cotton fabric with GOTS certification.',
    imageUrl: 'https://picsum.photos/seed/fabric/400/300',
    price: 4.5,
    currency: 'USD',
    unit: 'meter',
    moq: 500,
    leadTime: 45,
    packagingType: 'Rolls',
    certifications: ['GOTS', 'OEKO-TEX'],
    shelfLife: 'N/A',
    storageConditions: 'Standard warehouse conditions',
    customFields: [],
    dateAdded: '2024-02-10T08:00:00Z',
    lastUpdated: '2024-02-10T08:00:00Z',
    createdBy: 'Editor Jane',
    history: []
  },
  {
    id: 'PRD-003',
    name: 'Precision Microchips X1',
    supplier: 'TechSilicon Inc',
    nodeId: 'node-9',
    category: 'Components',
    sector: 'Electronics',
    manufacturer: 'TSMC',
    manufacturingLocation: 'Taiwan, Hsinchu',
    description: 'High-speed processing unit for edge computing devices.',
    imageUrl: 'https://picsum.photos/seed/chip/400/300',
    price: 12.8,
    currency: 'USD',
    unit: 'piece',
    moq: 1000,
    leadTime: 120,
    packagingType: 'Anti-static Tray',
    certifications: ['RoHS', 'CE'],
    shelfLife: 'Indefinite',
    storageConditions: 'Anti-static, dry',
    customFields: [],
    dateAdded: '2023-11-05T09:15:00Z',
    lastUpdated: '2024-04-01T11:45:00Z',
    createdBy: 'Admin User',
    history: [
       {
        id: 'HIST-002',
        timestamp: '2024-04-01T11:45:00Z',
        userId: 'U-01',
        userName: 'Admin User',
        changes: {
          leadTime: { old: 90, new: 120 }
        },
        snapshot: {}
      }
    ]
  }
];
