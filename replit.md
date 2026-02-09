# Product Intelligence & Visualization Platform

## Overview
This project is a product intelligence platform designed to manage and visualize product data with an expandable, multi-level product taxonomy. It supports comprehensive CRUD operations for categories, suppliers, and products, offering robust data visualization and inventory management capabilities. The platform aims to provide businesses with deep insights into their product landscape, streamline product data management, and facilitate informed decision-making through intuitive analytics and reporting.

## User Preferences
I prefer detailed explanations and thorough code comments. I value iterative development with clear communication before major changes. For design, I prefer a clean, modern aesthetic with good UX. I like functional programming paradigms where applicable and robust error handling.

## System Architecture

### UI/UX Decisions
- Modern, clean design using Tailwind CSS.
- Data visualizations powered by Nivo for consistent and professional charts (bar, line, pie, heatmap).
- Iconography provided by Lucide React.
- Interactive elements: drag-and-drop for taxonomy nodes, inline editing, contextual action bars.
- Visual hierarchy and depth indicators for taxonomy builder.
- Comprehensive filtering and column visibility controls for data tables.
- The platform uses a 2-Tier Product Architecture (Suppliers > Products).

### Technical Implementations
- **Frontend**: React with TypeScript, bundled using Vite.
- **Backend**: Express.js REST API.
- **Database**: PostgreSQL for data persistence, managed with Drizzle ORM.
- **Key Features**:
    - Unlimited-level product taxonomy tree with CRUD operations.
    - **TaxonomyNodeSelector**: Reusable component for selecting taxonomy nodes at any depth with search, expand/collapse, and path display.
    - Products can be assigned to ANY depth in taxonomy (not limited to fixed levels).
    - Supplier management with contact details.
    - Product management with detailed forms, including custom fields and technical specifications.
    - Interactive product usage density heatmap.
    - Dashboard with analytics and visualizations.
    - Mass product import wizard (CSV, XLS, XLSX) with file upload and paste-from-Excel modes.
    - Global floating notes widget.
    - Advanced product inventory table with:
        - Dynamic Taxonomy Path column showing full hierarchy
        - Inline taxonomy editing via tree selector
        - Descendant-aware filtering (filter by any node includes all children)
        - Column visibility controls and export.
    - Real-time database synchronization.
    - **Settings page with dynamic Usage Areas management** (add/edit/delete) stored in database.
    - Usage Areas are used system-wide in ProductForm, MassImportWizard, and ProductUsageHeatmap.
    - **Dynamic Units Management**: Database-backed unit system (app_settings table, key: 'units') with:
        - CRUD management in Settings page (add/edit/delete units)
        - Dynamic unit dropdowns in ProductForm, ProductList (inline edit), and MassImportWizard
        - Auto-discovery of new units during mass import (auto-added to database)
        - API routes: GET/PUT /api/settings/units
        - Default units: kg, ton, piece, liter, box, pallet, m, m², m³, ft, ft², ft³, inch, cm, mm, gallon, oz, lb, set, pair, roll, sheet, pack, carton
    - **Inventory Column Management**: Database-backed column configuration (app_settings table, key: 'inventory_columns') with:
        - Settings page section for managing inventory table columns
        - Show/hide toggles for each column with eye icon
        - Drag-and-drop column reordering (arrangement done in Settings)
        - Quick actions: Show All, Defaults Only, Reset Order & Visibility
        - Real-time sync: changes in Settings immediately apply to ProductList inventory table
        - API routes: GET/PUT /api/settings/inventory-columns
        - 19 configurable columns: stockCode, name, supplier, taxonomyPath, price, usageAreas, id, sector, category, subCategory, currency, unit, moq, leadTime, manufacturer, location, description, dateAdded, lastUpdated
    - **Backup & Versioning System**: Full data protection with gzip compression, point-in-time recovery, scheduled auto-backups (every 6 hours), manual backup creation, export/import functionality, and restore preview with safety net backups.
    - **Authentication System**: Secure session-based authentication with bcrypt password hashing (12 rounds), cryptographically secure tokens (crypto.randomBytes), rate-limited login (10 attempts/15 min), first-login password change enforcement, and logout functionality.
    - **Dynamic Stock Code Engine**: Structured product codes in format `P.BRANCH.BRANCH.COLOR.0001` with:
        - Auto-generation based on taxonomy path branch codes and product color
        - Branch code management (2-5 uppercase chars) in TaxonomyBuilder with auto-suggestion
        - Color management CRUD in Settings with hex color picker and numeric codes
        - Stock code preview in ProductForm showing generated code before save
        - Stock Code column in ProductList inventory table with sort support
        - Bulk migration and regeneration tools in Settings
        - Full history tracking in stock_code_history table
        - Backend: server/stockCodeService.ts handles generation, validation, preview, migration, bulk operations
        - Database: products.stockCode, products.colorId, treeNodes.branchCode, colors table, stock_code_history table

    - **Systematic Product & System Management Module**: Full system builder for construction chemicals, flooring, and waterproofing systems with:
        - 3-panel layout: system list, layer editor, and live build-up preview
        - System CRUD with status management (draft/active/archived)
        - System layers with drag-and-drop reorder and CRUD
        - Product assignment to layers with benefits, default product marking
        - Version snapshots and change history tracking
        - Export engine (JSON, CSV) with system spec sheets
        - Import engine (JSON, CSV) with validation preview, error/warning display
        - Analytics dashboard with Nivo charts:
            - Product Utilization Frequency (horizontal bar)
            - System Complexity (grouped bar)
            - Layer Type Distribution (vertical bar)
            - Product Matrix Heatmap with axis switching (Product→System, Product→Sector, Layer→Product, System→Layer)
        - Database: systems, system_layers, system_product_options, sectors, system_history tables
        - Backend: server/systemRoutes.ts with full REST API
        - Frontend: components/systemBuilder/ (SystemBuilder, SystemDashboard, SystemImport)

    - **Technical Intelligence Dashboard**: Multi-supplier intelligence and comparison layer with:
        - 7 tabs: Overview (12 KPIs), Product Intelligence, System Intelligence, Supplier Matrix, Taxonomy & Supplier, Technical Coverage, Competitive Benchmark
        - Global filter panel (Supplier, Sector, Branch) applied across all tabs and API calls
        - Overview: 12 KPI cards (products, systems, suppliers, variants, coverage, concentration index, etc.)
        - Product Intelligence: Product utilization by supplier (stacked bar), supplier dependency pie chart
        - System Intelligence: System variants by sector (grouped bar), complexity scatter, layer supplier flexibility
        - Supplier Matrix: 6-mode heatmap (supplier-system, supplier-layer, supplier-sector, supplier-taxonomy, supplier-stockcode, supplier-complexity)
        - Taxonomy & Supplier: Branch distribution (grouped bar), supplier specialization treemap, stock code vs supplier heatmap
        - Technical Coverage: 6-dimension radar chart (sector coverage, layer coverage, system complexity, taxonomy depth, product variety, system reusability)
        - Competitive Benchmark: System comparison table and per-system supplier radar
        - Export engine: PNG/SVG image export and CSV data export for all chart types
        - Error boundary wrapper preventing white-screen crashes
        - Backend: server/analyticsRoutes.ts with 8 endpoints (overview, product-intelligence, system-intelligence, supplier-heatmap, taxonomy-supplier, coverage-radar, competitive-benchmark, filters)
        - Frontend: components/technicalIntelligence/TechnicalIntelligenceDashboard.tsx

### Authentication
- **Default Credentials**: admin / 1111 (must change on first login)
- **Password Requirements**: Minimum 6 characters
- **Session Duration**: 24 hours
- **Security Features**:
    - bcrypt password hashing with 12 salt rounds
    - Cryptographically secure session tokens (64 hex characters)
    - Rate limiting on login attempts
    - Server-side enforcement of password change before accessing protected routes
    - Generic error messages to prevent user enumeration

### System Design Choices
- Monorepo structure with `client/` and `server/` directories.
- API endpoints for all CRUD operations across taxonomy nodes, products, and suppliers.
- Production build targets a single port deployment where the Express server serves both API and static frontend files.
- CORS is configured to accept requests from any origin.

## External Dependencies
- **React**: Frontend library.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Utility-first CSS framework (via CDN).
- **Nivo**: Data visualization library (bar, line, pie, heatmap, treemap, sunburst, network charts).
- **Lucide React**: Icon library.
- **Express.js**: Backend web application framework.
- **Drizzle ORM**: TypeScript ORM for PostgreSQL.
- **PostgreSQL**: Relational database.
- **html2canvas**: Used for exporting taxonomy tree to image.
- **bcryptjs**: Pure JavaScript password hashing library (production-compatible).
- **express-rate-limit**: Rate limiting middleware for login protection.