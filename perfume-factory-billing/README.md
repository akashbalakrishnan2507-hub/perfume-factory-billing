# Perfume Factory — Flower Procurement & Billing Management System

A production-ready flower procurement, customer ledger, and billing management system built for perfume manufacturing operations.

---

## 🌸 Key Features

- **Procurement & Collection Management**: Daily flower intake recording from local village farmers with real-time rate lookup.
- **Automated Invoicing & Sequential Bill Numbers**: Auto-generated bill numbers (`PF-YYYY-NNNN`) with atomic sequence locking (`FOR UPDATE`).
- **Server-Side Financial Integrity**: All calculations (quantities, rates, deductions, net amounts) recomputed server-side with fixed-precision arithmetic (stored as `DECIMAL(12,2)`).
- **Flexible Settlement & Payments**: Partial payments, full settlements, and payment history per bill with automatic status management (`PENDING`, `PARTIALLY_PAID`, `PAID`).
- **Farmer / Customer Ledger**: Comprehensive ledger view showing lifetime volume, total billing, amount paid, and outstanding balance.
- **Village & Customer Master Data**: Multi-village management, farmer contact directories, and active/inactive status controls.
- **Flower Types & Dynamic Rate Management**: Configurable flower catalogue with date-effective pricing.
- **Automated PDF Invoices**: Clean, printable tax/procurement invoices generated via PDFKit.
- **Reports & CSV Export**: Village-wise collection reports, flower-wise yield summaries, and date-filtered billing summaries with one-click CSV export.
- **Role-Based Access Control (RBAC)**: Secure JWT authentication with strict roles (`ADMIN` vs `OPERATOR` / `STAFF`).
- **Audit Trails**: Soft-delete architecture (`is_deleted` flags) and audit metadata (`created_by`, `created_at`, `updated_at`).

---

## 🛠️ Tech Stack

- **Backend**: Node.js (v18+), Express.js
- **Database**: MySQL 8.0 (InnoDB, strict SQL mode, utf8mb4)
- **Authentication**: JWT (`jsonwebtoken`) + BCrypt (`bcrypt`) password hashing
- **Invoicing**: PDFKit streaming
- **Frontend**: Vanilla JavaScript (ES6+ modular), modern glassmorphism design system, responsive layout, zero client-side build steps required
- **Containerization**: Docker Compose for MySQL 8.0

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js** v18 or higher (v24 recommended)
- **Docker Desktop** (or a local MySQL 8.0 instance)

### 2. Database Setup (Docker)

Start the MySQL container:
```bash
docker-compose up -d
```
*Note: MySQL runs on port `3306` with database `perfume_factory`.*

### 3. Backend Setup

1. Open a terminal in `./backend`:
```bash
cd backend
```

2. Copy the environment variables:
```bash
cp .env.example .env
```
*(On Windows PowerShell: `Copy-Item .env.example .env`)*

Verify `.env` configuration:
```ini
PORT=5000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=3306
DB_NAME=perfume_factory
DB_USER=perfume_app
DB_PASSWORD=change_me
JWT_SECRET=super_secret_jwt_key_perfume_factory_2026
JWT_EXPIRES_IN=24h
BCRYPT_SALT_ROUNDS=10
CORS_ORIGIN=http://localhost:3000
```

3. Install dependencies:
```bash
npm install
```

4. Run database migrations & seed sample data:
```bash
npm run setup
```
*(Or individually: `npm run migrate` followed by `npm run seed`)*

5. Start the backend server:
```bash
npm run dev
# or
npm start
```
The API server will listen on **`http://localhost:5000`**. Healthcheck available at **`http://localhost:5000/api/health`**.

---

### 4. Frontend Setup

1. Open a terminal in `./frontend`:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the frontend static server:
```bash
npm start
```
The web application will open on **`http://localhost:3000`**.

---

## 🔐 Default Demo Accounts

The database seed provides two pre-configured accounts:

| Role | Username | Password | Permissions |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `admin123` | Full access (Users, Rates, Villages, Customers, Collections, Payments, Reports, Deletions) |
| **Operator / Staff** | `staff` | `staff123` | Operational access (Intake Collections, Payment entry, View Invoices, View Customers) |

---

## 📊 Database Schema Overview

- **`users`**: Administrative & operator logins with hashed credentials and roles.
- **`villages`**: Supply regions and collection points.
- **`customers`**: Farmers/growers associated with their home villages.
- **`flowers`**: Flower varieties (e.g. Jasmine, Rose, Tuberose, Champaca).
- **`flower_rates`**: Historical and effective pricing per kg with `effective_from` dates.
- **`bill_sequences`**: Row-locked sequence generator ensuring gap-free sequential bill numbering (`PF-YYYY-NNNN`).
- **`collections`**: Invoices / procurement headers with pre-computed server financial totals.
- **`collection_items`**: Line items per flower type with recorded unit rates and line amounts.
- **`payments`**: Payment ledger records supporting cash, UPI, bank transfer, and cheque.

---

## 📡 API Endpoints Reference

### Authentication
- `POST /api/auth/login` — Authenticate and receive JWT token
- `GET /api/auth/me` — Retrieve currently authenticated user profile

### Master Data
- `GET, POST /api/villages` — Manage villages
- `GET, POST, PUT, DELETE /api/customers` — Manage farmers / customer registry
- `GET /api/customers/:id/ledger` — Detailed farmer transaction ledger
- `GET, POST, PUT, DELETE /api/flowers` — Manage flower varieties
- `GET, POST /api/flower-rates` — Configure and list effective rates
- `GET /api/flower-rates/active` — Active rates lookup for new procurement entries

### Procurement & Billing
- `GET, POST /api/collections` — View and record intake collections (generates bill automatically)
- `GET /api/collections/:id` — Retrieve collection & bill details
- `DELETE /api/collections/:id` — Soft-delete bill (Admin only)
- `GET /api/invoices/:collectionId/pdf` — Stream generated PDF bill

### Payments
- `GET, POST /api/payments` — Record payment toward a bill
- `GET /api/payments/collection/:collectionId` — List payment history for a bill

### Analytics & Reports
- `GET /api/dashboard/stats` — High-level KPI metrics & recent activity
- `GET /api/reports/collections` — Detailed procurement report (supports `?export=csv`)
- `GET /api/reports/payments` — Settlement & disbursements report (supports `?export=csv`)
- `GET /api/reports/outstanding` — Unpaid & partial balances report
