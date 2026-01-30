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
    - Supplier management with contact details.
    - Product management with detailed forms, including custom fields and technical specifications.
    - Interactive product usage density heatmap.
    - Dashboard with analytics and visualizations.
    - Mass product import wizard (CSV, XLS, XLSX).
    - Global floating notes widget.
    - Advanced product inventory table with dynamic columns, filtering, and export.
    - Real-time database synchronization.

### System Design Choices
- Monorepo structure with `client/` and `server/` directories.
- API endpoints for all CRUD operations across taxonomy nodes, products, and suppliers.
- Production build targets a single port deployment where the Express server serves both API and static frontend files.
- CORS is configured to accept requests from any origin.

## External Dependencies
- **React**: Frontend library.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Utility-first CSS framework (via CDN).
- **Nivo**: Data visualization library (bar, line, pie, heatmap charts).
- **Lucide React**: Icon library.
- **Express.js**: Backend web application framework.
- **Drizzle ORM**: TypeScript ORM for PostgreSQL.
- **PostgreSQL**: Relational database.
- **html2canvas**: Used for exporting taxonomy tree to image.