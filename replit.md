# Product Intelligence & Visualization Platform

## Overview
A fully functional product intelligence platform with an expandable product taxonomy tree supporting unlimited levels of categorization. Built with React frontend and Express.js backend, with PostgreSQL for data persistence.

## Project Architecture

### Frontend (Port 5000)
- **React** with TypeScript
- **Vite** for development and bundling
- **Tailwind CSS** (via CDN) for styling
- **Recharts** for data visualization
- **Lucide React** for icons

### Backend (Port 3001)
- **Express.js** REST API
- **Drizzle ORM** for database operations
- **PostgreSQL** for data persistence

### Database Schema
- **tree_nodes**: Hierarchical product taxonomy with unlimited nesting depth
- **products**: Product data linked to taxonomy nodes (legacy, kept for compatibility)
- **custom_fields**: User-defined field configurations
- **suppliers**: Supplier entities with contact information (S-0001 format IDs)
- **master_products**: Base product concepts linked to taxonomy (P-0001 format IDs)
- **supplier_products**: Supplier-specific variants with pricing/lead time (SP-001 format IDs)

## Key Features
- **3-Tier Product Architecture**: Suppliers > Master Products > Supplier Products
- **Linked Add Product Form**: Product Name and Supplier fields are linked to Master Product Catalog and Suppliers respectively
- **Product Network Visualization**: Interactive graph showing master products at top with supplier product branches below (nodes + links)
- Expandable product taxonomy tree with unlimited levels
- Full CRUD operations for categories, suppliers, and products
- Supplier Management with contact details and status tracking
- Master Product Catalog with taxonomy linking
- Drag-and-drop reordering of tree nodes
- Real-time database synchronization
- Dashboard with analytics and visualizations
- Product inventory management

## File Structure
```
├── App.tsx                  # Main application component
├── client/api.ts            # API client for backend communication
├── components/
│   ├── ProductTree.tsx      # Taxonomy tree component
│   ├── Dashboard.tsx        # Dashboard with analytics
│   ├── ProductList.tsx      # Product inventory view
│   ├── ProductForm.tsx      # Add/edit product form
│   ├── Visualize.tsx        # Data visualization view (charts + network)
│   ├── ProductNetworkGraph.tsx  # Network graph visualization
│   ├── SupplierManager.tsx  # Supplier management UI
│   └── MasterProductCatalog.tsx  # Master product catalog UI
├── server/
│   ├── index.ts             # Express server entry point
│   ├── routes.ts            # API route definitions
│   ├── storage.ts           # Database operations
│   └── db.ts                # Drizzle database connection
├── shared/schema.ts         # Drizzle ORM schema
├── mockData.ts              # Seed data for initial load
└── types.ts                 # TypeScript type definitions
```

## Development

### Running the Application
```bash
npm run dev
```
This starts both the Express backend (port 3001) and Vite frontend (port 5000) concurrently.

### Database Operations
```bash
npm run db:push    # Push schema changes to database
```

## Production Deployment (Hostinger)

### Hostinger Configuration

In Hostinger's deployment settings, configure:

**Build command:**
```
npm run build
```

**Start command:**
```
npm run start
```

**Environment Variables** (set in Hostinger panel):
```
NODE_ENV=production
DATABASE_URL=postgresql://user:password@host:5432/database
```

### What the build creates:
- `dist/` - Frontend static files
- `dist-server/index.js` - Bundled backend server

### How it works:
- The server serves both API (`/api/*`) and static frontend files
- Single port deployment - backend handles everything
- CORS is configured to accept requests from any origin
- The `npm run build` command builds both frontend and backend
- The `npm run start` command starts the production server

## API Endpoints
- `GET /api/tree-nodes` - Get all taxonomy nodes
- `POST /api/tree-nodes` - Create a new node
- `PUT /api/tree-nodes/:id` - Update a node
- `DELETE /api/tree-nodes/:id` - Delete a node
- `GET /api/products` - Get all products
- `POST /api/products` - Create a new product
- `PUT /api/products/:id` - Update a product
- `DELETE /api/products/:id` - Delete a product
- `GET /api/custom-fields` - Get custom field configurations
- `POST /api/seed` - Seed database with initial data
- `GET /api/suppliers` - Get all suppliers
- `POST /api/suppliers` - Create a new supplier
- `PATCH /api/suppliers/:supplierId` - Update a supplier
- `DELETE /api/suppliers/:supplierId` - Delete a supplier
- `GET /api/master-products` - Get all master products
- `POST /api/master-products` - Create a new master product
- `PATCH /api/master-products/:masterProductId` - Update a master product
- `DELETE /api/master-products/:masterProductId` - Delete a master product
- `GET /api/supplier-products` - Get all supplier products
- `GET /api/supplier-products/by-master/:masterProductId` - Get supplier products by master product
- `GET /api/supplier-products/by-supplier/:supplierId` - Get supplier products by supplier
- `POST /api/supplier-products` - Create a new supplier product
- `PATCH /api/supplier-products/:supplierProductId` - Update a supplier product
- `DELETE /api/supplier-products/:supplierProductId` - Delete a supplier product

## Recent Changes
- 2026-01-05: Added Product Network Visualization with interactive SVG graph showing master products and supplier branches
- 2026-01-05: Linked Add Product form fields to Master Product Catalog and Suppliers (dropdown selection)
- 2026-01-05: Created ProductNetworkGraph component with zoom, hover effects, and filtering
- 2026-01-05: Updated Visualize view with tabs for Product Network and Analytics Charts
- 2026-01-05: Added 3-tier product architecture (Suppliers > Master Products > Supplier Products)
- 2026-01-05: Created SupplierManager component with full CRUD operations, search, and contact management
- 2026-01-05: Created MasterProductCatalog component with taxonomy linking and card-based UI
- 2026-01-05: Added suppliers, master_products, and supplier_products database tables with Drizzle ORM
- 2026-01-05: Updated backend with complete API routes for new entities
- 2026-01-05: Added seed data for initial suppliers and master products
- 2025-12-30: Fixed inline editing in Product Inventory (resolved blur/click event conflicts)
- 2025-12-30: Added product selection checkboxes for bulk actions
- 2025-12-30: Added Export functionality (CSV/JSON for all or selected products)
- 2025-12-30: Added working Filter panel (by sector, price range, lead time)
- 2025-12-30: Added Create PI (Product Intelligence) feature from selected products
- 2025-12-30: Added ability to create new Sectors/Categories/Sub-Categories directly from Add Product form
- 2025-12-30: Added inline editing to Product Inventory (double-click cells to edit)
- 2025-12-30: Added Technical Specifications section to ProductForm with multiple specs support
- 2025-12-30: Implemented cascading Sector/Category/Sub-Category dropdowns in ProductForm
- 2025-12-30: Fixed TaxonomyBuilder node creation and editing functions
- 2025-12-30: Added technicalSpecs field to database schema and full persistence
- 2025-12-30: Implemented PostgreSQL database integration with Drizzle ORM
- 2025-12-30: Added Express.js backend with full CRUD API
- 2025-12-30: Enhanced ProductTree with unlimited nesting and drag-drop
- 2025-12-30: Implemented background database sync with immediate local data loading
