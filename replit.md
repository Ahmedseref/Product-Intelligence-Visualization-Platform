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
- Interactive elements include drag-and-drop for taxonomy nodes, inline editing, and contextual action bars.
- The platform uses a 2-Tier Product Architecture (Suppliers > Products).

### Technical Implementations
- **Frontend**: React with TypeScript, bundled using Vite.
- **Backend**: Express.js REST API.
- **Database**: PostgreSQL for data persistence, managed with Drizzle ORM.
- **Key Features**:
    - Unlimited-level product taxonomy tree with CRUD operations.
    - Supplier management.
    - Product management with detailed forms, including custom fields and technical specifications.
    - Interactive product usage density heatmap and a dashboard with analytics.
    - Mass product import wizard (CSV, XLS, XLSX).
    - Global floating notes widget.
    - Advanced product inventory table with dynamic taxonomy path, inline taxonomy editing, descendant-aware filtering, and column visibility controls.
    - Real-time database synchronization.
    - **Dynamic Settings Management**: Database-backed management for Usage Areas, Units, and Inventory Columns, configurable via a dedicated Settings page.
    - **Backup & Versioning System**: Full data protection with gzip compression, point-in-time recovery, scheduled auto-backups, manual backup, export/import, and restore preview.
    - **Authentication System**: Secure session-based authentication with bcrypt hashing, cryptographically secure tokens, rate-limited login, and first-login password change enforcement.
    - **Dynamic Stock Code Engine**: Structured product codes with auto-generation, management of supplier/branch codes and colors, live preview, and bulk migration tools.
    - **Systematic Product & System Management Module**: A system builder for construction chemicals and flooring, featuring system CRUD, layer editing, product assignment, version tracking, export/import, and an analytics dashboard.
    - **Proforma Invoice System**: A comprehensive proforma invoice generation system with customer management, product selection, inline editing, financial engine for custom calculations, PDF/Excel export, and professional layout.
    - **Document Memory / File Manager**: Centralized document management for external links (Google Drive, OneDrive, PDFs, etc.) with document typing, relation system to products/suppliers/systems, CRUD, search, and filtering.
    - **Technical Intelligence Dashboard**: A multi-supplier intelligence and comparison layer with 7 tabs providing various KPIs, product/system intelligence, supplier matrix heatmaps, technical coverage radar charts, and competitive benchmarking, all with global filtering and export capabilities.

### System Design Choices
- Monorepo structure with `client/` and `server/` directories.
- API endpoints for all CRUD operations.
- Production build targets a single port deployment where the Express server serves both API and static frontend files.
- CORS is configured to accept requests from any origin.

## External Dependencies
- **React**: Frontend library.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Utility-first CSS framework.
- **Nivo**: Data visualization library.
- **Lucide React**: Icon library.
- **Express.js**: Backend web application framework.
- **Drizzle ORM**: TypeScript ORM for PostgreSQL.
- **PostgreSQL**: Relational database.
- **html2canvas**: Used for exporting elements to images.
- **bcryptjs**: Password hashing library.
- **express-rate-limit**: Rate limiting middleware.