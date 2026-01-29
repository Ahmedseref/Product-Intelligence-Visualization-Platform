# Product Intelligence & Visualization Platform

A comprehensive product intelligence platform for managing product taxonomies, inventory, and generating analytical reports. Built with React, Express.js, and PostgreSQL.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Deployment](#deployment)
- [Usage Guide](#usage-guide)

## Overview

The Product Intelligence & Visualization Platform is designed to help businesses organize, track, and analyze their product data. It features a flexible hierarchical taxonomy system that supports unlimited levels of categorization (Sectors, Categories, Sub-Categories, Groups), comprehensive product management with technical specifications, and powerful visualization tools for data analysis.

## Features

### 1. Product Taxonomy Tree
- **Unlimited Nesting Levels**: Create hierarchical structures with Sectors, Categories, Sub-Categories, and Groups
- **Drag-and-Drop Reordering**: Easily reorganize your taxonomy structure
- **Visual Tree Diagram**: See your entire product hierarchy at a glance
- **Inline Editing**: Double-click to edit node names directly
- **CRUD Operations**: Create, read, update, and delete taxonomy nodes

### 2. Product Management (2-Tier Architecture)
- **Simplified Structure**: Suppliers > Products (streamlined from previous 3-tier system)
- **Comprehensive Product Data**: Store detailed product information including:
  - Basic info (name, supplier, manufacturer)
  - Pricing (price, currency, MOQ)
  - Logistics (lead time, packaging, storage conditions)
  - Certifications and HS codes
  - Technical specifications (thickness, density, color, size, etc.)
- **Custom Fields**: Define additional fields specific to your needs
- **History Tracking**: Track all changes made to products
- **Image Support**: Add product images via URL

### 3. Mass Product Import Wizard
- **4-Step Wizard**: File Upload > Column Mapping > Required Fields > Review & Import
- **Multiple File Formats**: Supports CSV, XLS, and XLSX files
- **Drag-and-Drop Upload**: Easy file upload with automatic format detection
- **Smart Column Mapping**: Auto-detection of column headers with dropdown field selection
- **Default Values**: Set default values for unmapped required fields (Supplier, Category, Currency, Unit, MOQ, Lead Time)
- **Preview Before Import**: Review first 5 products before final import

### 4. Product Inventory View
- **Dynamic Columns**: Show/hide columns with visibility toggle and Show All/Reset options
- **Data Grid Display**: View all products in a sortable, filterable table
- **Inline Editing**: Double-click cells to edit values directly
- **Bulk Selection**: Select multiple products for batch operations
- **Advanced Filtering**: Filter by Sector, Category, Supplier, Manufacturer, Price range, Lead Time range, MOQ range
- **Export**: Export data to CSV or JSON with all fields in separate columns
- **Mass Delete**: Delete multiple selected products with single confirmation

### 5. Dashboard & Analytics
- **Overview Statistics**: Total products, active suppliers, average lead time, total base value
- **Visual Charts**: Bar charts, pie charts, and line graphs
- **Category Distribution**: See product distribution across taxonomy
- **Price Distribution**: Analyze pricing patterns across categories

### 6. Product Intelligence (PI) Reports
- **Generate Reports**: Create PI reports from selected products
- **Summary Analytics**: Automatic calculation of averages, ranges, and distributions
- **Comparative Analysis**: Compare products across different metrics

### 7. Data Visualization
- **Analytics Charts**: Bar, line, pie, scatter, and area charts
- **Customizable Views**: Configure axes and aggregation methods
- **Interactive Charts**: Hover for details, click for drill-down

### 8. Supplier Management
- **Supplier Directory**: Manage supplier entities with contact information
- **Auto-Generated IDs**: Suppliers use S-0001 format IDs
- **Contact Details**: Store name, country, email, phone, address, website
- **Status Tracking**: Track active/inactive supplier status

### 9. Global Floating Notes Widget
- **Always Accessible**: Floating note panel visible on all pages
- **Draggable**: Move anywhere on screen with position memory
- **Minimize/Expand**: Collapse to icon or expand to full panel
- **Note Management**: Add, edit, delete notes with checklist toggles
- **Completion Tracking**: Mark notes complete with strikethrough display
- **Persistence**: Notes saved to localStorage, survives page refresh
- **Multi-Tab Sync**: Changes sync automatically across browser tabs

## Technology Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| React 19 | UI Framework |
| TypeScript | Type Safety |
| Vite | Build Tool & Dev Server |
| Tailwind CSS | Styling |
| Recharts | Data Visualization |
| Lucide React | Icons |

### Backend
| Technology | Purpose |
|------------|---------|
| Express.js 5 | REST API Server |
| Drizzle ORM | Database Operations |
| PostgreSQL | Data Persistence |
| Node.js 20 | Runtime Environment |

## Project Structure

```
product-intelligence-platform/
├── client/                    # Frontend API client
│   └── api.ts                 # API communication layer
├── components/                # React components
│   ├── Dashboard.tsx          # Main dashboard with analytics
│   ├── ProductDetailsModal.tsx # Product details popup
│   ├── ProductForm.tsx        # Add/edit product form
│   ├── ProductList.tsx        # Product inventory grid
│   ├── ProductTree.tsx        # Taxonomy tree visualization
│   ├── Sidebar.tsx            # Navigation sidebar
│   ├── TaxonomyBuilder.tsx    # Taxonomy management interface
│   └── Visualize.tsx          # Data visualization charts
├── server/                    # Backend server
│   ├── db.ts                  # Database connection
│   ├── index.ts               # Express server entry point
│   ├── routes.ts              # API route definitions
│   └── storage.ts             # Database operations layer
├── shared/                    # Shared code
│   └── schema.ts              # Drizzle ORM schema definitions
├── App.tsx                    # Main application component
├── constants.tsx              # Application constants
├── index.html                 # HTML entry point
├── index.tsx                  # React entry point
├── mockData.ts                # Seed data for initial load
├── types.ts                   # TypeScript type definitions
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript configuration
├── vite.config.ts             # Vite configuration
└── drizzle.config.ts          # Drizzle ORM configuration
```

## Getting Started

### Prerequisites
- Node.js 18 or higher
- PostgreSQL database (local or cloud service like Neon)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd product-intelligence-platform
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:
   ```env
   DATABASE_URL=postgresql://username:password@host:5432/database_name
   NODE_ENV=development
   ```

4. **Initialize the database**
   ```bash
   npm run db:push
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Access the application**
   Open http://localhost:5000 in your browser

## Database Schema

### tree_nodes
Stores the hierarchical taxonomy structure.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| node_id | varchar(100) | Unique node identifier |
| name | varchar(255) | Node display name |
| type | varchar(50) | Node type (sector/category/subcategory/group) |
| parent_id | varchar(100) | Parent node reference |
| description | text | Optional description |
| metadata | jsonb | Additional metadata |
| is_active | boolean | Active status |
| sort_order | integer | Display order |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### products
Stores product information linked to taxonomy nodes.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| product_id | varchar(100) | Unique product identifier |
| name | varchar(255) | Product name |
| supplier | varchar(255) | Supplier name |
| node_id | varchar(100) | Linked taxonomy node |
| manufacturer | varchar(255) | Manufacturer name |
| price | real | Product price |
| currency | varchar(10) | Currency code |
| moq | integer | Minimum order quantity |
| lead_time | integer | Lead time in days |
| technical_specs | jsonb | Technical specifications array |
| certifications | jsonb | Certification list |
| custom_fields | jsonb | Custom field values |
| history | jsonb | Change history |

### custom_field_definitions
Stores user-defined field configurations.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| field_id | varchar(100) | Unique field identifier |
| label | varchar(255) | Field display label |
| type | varchar(50) | Field type (text/number/date/etc.) |
| options | jsonb | Options for dropdown fields |
| is_global | boolean | Whether field applies globally |

## API Reference

### Tree Nodes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tree-nodes` | Get all taxonomy nodes |
| GET | `/api/tree-nodes/:nodeId` | Get a specific node |
| POST | `/api/tree-nodes` | Create a new node |
| PATCH | `/api/tree-nodes/:nodeId` | Update a node |
| DELETE | `/api/tree-nodes/:nodeId` | Delete a node |

### Products

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | Get all products |
| GET | `/api/products/:productId` | Get a specific product |
| POST | `/api/products` | Create a new product |
| PATCH | `/api/products/:productId` | Update a product |
| DELETE | `/api/products/:productId` | Delete a product |

### Custom Fields

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/custom-fields` | Get all custom field definitions |
| POST | `/api/custom-fields` | Create a new custom field |

### Utility

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/seed` | Seed database with initial data |
| GET | `/health` | Health check endpoint |

## Deployment

### Build for Production

```bash
npm run build
```

This creates:
- `dist/` - Frontend static files
- `dist-server/index.js` - Bundled backend server

### Start Production Server

```bash
npm run start
```

### Hostinger Deployment

1. **Configure build settings:**
   - Build command: `npm run build`
   - Start command: `npm run start`
   - Entry file: `dist-server/index.js`

2. **Set environment variables:**
   - `DATABASE_URL` - PostgreSQL connection string
   - `NODE_ENV` - Set to `production`
   - `PORT` - Set to `3000`

3. **Database:**
   - Use a PostgreSQL service (Neon, Supabase, Railway)
   - Hostinger's MySQL is not compatible

## Usage Guide

### Creating a Taxonomy Structure

1. Navigate to **Taxonomy Manager** from the sidebar
2. Click **Add Sector** to create a top-level category
3. Select a sector and click **Add Category** to add sub-levels
4. Continue adding Sub-Categories and Groups as needed
5. Drag and drop nodes to reorder

### Adding Products

1. Navigate to **Add Product** from the sidebar
2. Select the taxonomy location (Sector > Category > Sub-Category)
3. Fill in product details:
   - Basic information (name, supplier, manufacturer)
   - Pricing (price, currency, unit, MOQ)
   - Logistics (lead time, packaging, storage)
   - Technical specifications (add multiple specs)
4. Click **Save Product**

### Managing Inventory

1. Navigate to **Product Inventory** from the sidebar
2. Use the filter panel to narrow down products
3. Double-click any cell to edit inline
4. Select products using checkboxes for bulk actions
5. Click **Export** to download data as CSV or JSON

### Generating PI Reports

1. Go to **Product Inventory**
2. Select products using checkboxes
3. Click **Create PI** button
4. View the generated Product Intelligence report with:
   - Summary statistics
   - Price analysis
   - Lead time comparison
   - Specification breakdown

### Data Visualization

1. Navigate to **Visualize** from the sidebar
2. Choose chart type (bar, line, pie, etc.)
3. Select data dimensions and metrics
4. Customize aggregation method
5. Interact with charts for detailed insights

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run db:push` | Push schema changes to database |

## Recent Updates

### January 2026
- **Global Floating Notes Widget**: Added a draggable, persistent notes panel accessible on all pages with checklist functionality and multi-tab sync
- **Mass Product Import Wizard**: New 4-step wizard for bulk importing products from CSV, XLS, and XLSX files with smart column mapping
- **Simplified 2-Tier Architecture**: Streamlined from Suppliers > Master Products > Products to Suppliers > Products
- **Enhanced Product Inventory**: Added dynamic column visibility, advanced filtering (Sector, Category, Supplier, Manufacturer, Price/Lead Time/MOQ ranges), and comprehensive export
- **Improved Mass Delete**: Single confirmation for bulk deletions instead of per-item prompts
- **Inline Editing for Technical Specs**: Double-click to edit specifications directly in the product form
- **Production Deployment Fixes**: Resolved ES module conflicts for reliable Hostinger deployment

### December 2025
- **PostgreSQL Integration**: Full database persistence with Drizzle ORM
- **Technical Specifications**: Added multi-spec support with attribute/value/unit fields
- **Cascading Dropdowns**: Sector/Category/Sub-Category selection with inline creation
- **Export Enhancements**: All fields exported in separate columns for data analysis

## License

This project is proprietary software. All rights reserved.

## Support

For support, please contact the development team or create an issue in the repository.
