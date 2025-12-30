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
- **products**: Product data linked to taxonomy nodes
- **custom_fields**: User-defined field configurations

## Key Features
- Expandable product taxonomy tree with unlimited levels
- Full CRUD operations for categories and products
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
│   └── Visualize.tsx        # Data visualization view
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

### Build for Production
```bash
npm run build:prod
```
This creates:
- `dist/` - Frontend static files
- `dist-server/` - Bundled backend server

### Deployment Steps for Hostinger

1. **Upload Files**:
   - Upload the `dist/` folder contents (frontend)
   - Upload the `dist-server/index.js` file (backend)

2. **Environment Variables** (set in Hostinger panel):
   ```
   NODE_ENV=production
   PORT=3001
   DATABASE_URL=postgresql://user:password@host:5432/database
   ```

3. **Start Command**:
   ```bash
   node dist-server/index.js
   ```

4. **For Node.js Hosting on Hostinger**:
   - The server serves both API (`/api/*`) and static frontend files
   - Single port deployment - backend handles everything
   - CORS is configured to accept requests from any origin

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

## Recent Changes
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
