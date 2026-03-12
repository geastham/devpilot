# Benchmark 03: React Analytics Dashboard — "InsightBoard"

## 1. Project Overview

### What We're Building

**InsightBoard** is a full-stack analytics dashboard consisting of three layers: a data ingestion pipeline that reads CSV fixture data and normalizes it into SQLite, a lightweight Express API that serves aggregated analytics, and a React frontend with 4 interactive chart components consuming that API. The entire system runs locally with zero external dependencies.

### Why This Benchmark

This project exercises the planner's ability to handle **genuinely different execution contexts** — a data pipeline, an API layer, and a frontend — within a single coordinated build. The wave decomposition is less obvious than the other two benchmarks, which makes it the most valuable for exposing planning strategy variance.

**Planning challenge**: The planner must decide between horizontal decomposition (data → API → UI) versus vertical decomposition (one feature end-to-end, then the next). It must also handle the shared data contract between all three layers — the database schema is consumed by both the pipeline and the API, while the API response shapes drive the frontend components.

### Scope Boundaries

**IN SCOPE:**
- CSV ingestion pipeline (ETL: parse → transform → load into SQLite)
- 4 normalized database tables with proper indices
- Express API with 5 analytics endpoints
- React dashboard with 4 chart components (Recharts)
- Summary cards with KPI metrics
- Date range filter that applies across all charts
- Responsive layout with CSS Grid

**OUT OF SCOPE:**
- User authentication
- Real-time data updates / WebSockets
- Data export functionality
- Multi-tenant / multi-dataset support
- Server-side rendering
- Deployment / CI/CD

---

## 2. Architecture & Design

### System Architecture

```mermaid
graph TD
    subgraph Data Layer
        CSV[CSV Fixture Files] --> Ingester[Data Ingester]
        Ingester --> Transformer[Data Transformer]
        Transformer --> Loader[DB Loader]
        Loader --> DB[(SQLite)]
    end
    
    subgraph API Layer
        DB --> QueryEngine[Query Engine]
        QueryEngine --> RevenueEndpoint[/api/revenue]
        QueryEngine --> ProductsEndpoint[/api/products]
        QueryEngine --> CustomersEndpoint[/api/customers]
        QueryEngine --> ChannelsEndpoint[/api/channels]
        QueryEngine --> SummaryEndpoint[/api/summary]
    end
    
    subgraph Frontend Layer
        SummaryEndpoint --> KPICards[KPI Summary Cards]
        RevenueEndpoint --> RevenueChart[Revenue Over Time Chart]
        ProductsEndpoint --> ProductChart[Product Performance Chart]
        CustomersEndpoint --> CustomerChart[Customer Segments Chart]
        ChannelsEndpoint --> ChannelChart[Channel Attribution Chart]
        DateFilter[Date Range Filter] --> RevenueChart
        DateFilter --> ProductChart
        DateFilter --> CustomerChart
        DateFilter --> ChannelChart
    end
```

### Component Inventory

| Component | Layer | Responsibility | File Path |
|-----------|-------|---------------|-----------|
| CSV Parser | Data | Read and parse raw CSV files | `src/pipeline/parser.js` |
| Data Transformer | Data | Clean, validate, normalize records | `src/pipeline/transformer.js` |
| DB Schema + Loader | Data | Create tables, bulk insert records | `src/pipeline/loader.js` |
| Pipeline Orchestrator | Data | Run full ETL sequence | `src/pipeline/index.js` |
| Database Connection | Shared | SQLite connection singleton | `src/db.js` |
| Query Engine | API | Reusable aggregation query builders | `src/api/queries.js` |
| Revenue Endpoint | API | Time-series revenue aggregation | `src/api/routes/revenue.js` |
| Products Endpoint | API | Product performance metrics | `src/api/routes/products.js` |
| Customers Endpoint | API | Customer segment breakdown | `src/api/routes/customers.js` |
| Channels Endpoint | API | Marketing channel attribution | `src/api/routes/channels.js` |
| Summary Endpoint | API | KPI summary (totals, averages) | `src/api/routes/summary.js` |
| API Server | API | Express app bootstrap | `src/api/server.js` |
| Dashboard Layout | Frontend | CSS Grid layout, responsive shell | `src/frontend/App.jsx` |
| KPI Cards | Frontend | Summary metric display cards | `src/frontend/components/KPICards.jsx` |
| Revenue Chart | Frontend | Line chart — revenue over time | `src/frontend/components/RevenueChart.jsx` |
| Product Chart | Frontend | Bar chart — top products by revenue | `src/frontend/components/ProductChart.jsx` |
| Customer Chart | Frontend | Pie chart — customer segments | `src/frontend/components/CustomerChart.jsx` |
| Channel Chart | Frontend | Stacked bar — channel performance | `src/frontend/components/ChannelChart.jsx` |
| Date Filter | Frontend | Date range picker, context provider | `src/frontend/components/DateFilter.jsx` |
| API Hook | Frontend | Shared data fetching hook | `src/frontend/hooks/useAnalytics.js` |

### Data Flow

**Ingestion (one-time)**:
1. Parser reads CSV files from `fixtures/` directory
2. Transformer validates and normalizes each row (dates, amounts, enums)
3. Loader creates SQLite tables and bulk inserts normalized records
4. Pipeline orchestrator sequences the above and reports stats

**Runtime**:
1. Express API starts, connects to SQLite
2. React app loads, DateFilter defaults to last 30 days
3. Each chart component calls `useAnalytics(endpoint, dateRange)`
4. Hook fetches from API with date range query params
5. API runs aggregation queries against SQLite
6. Chart components render with Recharts

### Technology Constraints

- **Data/API**: Node.js, plain `.js`
- **Frontend**: React with Recharts, bundled with Vite
- **Dependencies**:
  - `better-sqlite3` (database)
  - `express` (API server)
  - `cors` (cross-origin for local dev)
  - `csv-parse` (CSV parsing — sync API)
  - `react`, `react-dom` (UI)
  - `recharts` (charts)
  - `vite` (frontend build/dev server)
  - `@vitejs/plugin-react` (JSX support)

---

## 3. Dependency Graph

### Component Dependencies

```
db.js                     → (none)
pipeline/parser.js        → (none)
pipeline/transformer.js   → (none)
pipeline/loader.js        → db.js
pipeline/index.js         → parser.js, transformer.js, loader.js
api/queries.js            → db.js
api/routes/revenue.js     → queries.js
api/routes/products.js    → queries.js
api/routes/customers.js   → queries.js
api/routes/channels.js    → queries.js
api/routes/summary.js     → queries.js
api/server.js             → all routes
frontend/hooks/useAnalytics.js → (none, but assumes API running)
frontend/components/DateFilter.jsx → (none)
frontend/components/KPICards.jsx   → useAnalytics
frontend/components/RevenueChart.jsx  → useAnalytics, DateFilter context
frontend/components/ProductChart.jsx  → useAnalytics, DateFilter context
frontend/components/CustomerChart.jsx → useAnalytics, DateFilter context
frontend/components/ChannelChart.jsx  → useAnalytics, DateFilter context
frontend/App.jsx          → all components
```

### Ground-Truth Optimal Wave Decomposition

This benchmark intentionally has **two valid decomposition strategies**. The planner's choice reveals its planning philosophy.

#### Strategy A: Horizontal (Layer-by-Layer) — Recommended

##### Wave 1: Shared Foundation + Data Pipeline
| Task | Files | Est. Time | Rationale |
|------|-------|-----------|-----------|
| Project scaffold | `package.json` (root + frontend), directory structure, Vite config | 45s | Everything depends on this |
| Database module | `src/db.js` | 30s | Shared by pipeline and API |
| CSV parser | `src/pipeline/parser.js` | 30s | No dependencies |
| Data transformer | `src/pipeline/transformer.js` | 45s | No dependencies |
| CSV fixture files | `fixtures/*.csv` | 30s | Required for pipeline testing |

**Parallelism**: DB, parser, transformer, and fixtures are all independent. Full parallel.

##### Wave 2: Complete Pipeline + API Foundation
| Task | Files | Est. Time | Rationale |
|------|-------|-----------|-----------|
| DB Loader | `src/pipeline/loader.js` | 45s | Depends on db.js |
| Pipeline orchestrator | `src/pipeline/index.js` | 30s | Depends on parser, transformer, loader |
| Run pipeline (ingest data) | Execute pipeline | 15s | Must have data in DB for API to work |
| Query engine | `src/api/queries.js` | 60s | Depends on db.js, must match schema from loader |

**Parallelism**: Loader and query engine can build in parallel (both need db.js). Pipeline orchestrator waits for loader. Running the pipeline is sequential.

##### Wave 3: API Endpoints (Fully Parallel)
| Task | Files | Est. Time | Rationale |
|------|-------|-----------|-----------|
| Revenue endpoint | `src/api/routes/revenue.js` | 30s | Depends on queries.js |
| Products endpoint | `src/api/routes/products.js` | 30s | Depends on queries.js |
| Customers endpoint | `src/api/routes/customers.js` | 30s | Depends on queries.js |
| Channels endpoint | `src/api/routes/channels.js` | 30s | Depends on queries.js |
| Summary endpoint | `src/api/routes/summary.js` | 30s | Depends on queries.js |
| API server | `src/api/server.js` | 30s | Depends on all routes |

**Parallelism**: All 5 endpoints can build simultaneously. Server waits for all endpoints.

##### Wave 4: Frontend Components (Mostly Parallel)
| Task | Files | Est. Time | Rationale |
|------|-------|-----------|-----------|
| useAnalytics hook | `src/frontend/hooks/useAnalytics.js` | 30s | No dependencies |
| DateFilter component | `src/frontend/components/DateFilter.jsx` | 45s | No dependencies |
| KPI Cards | `src/frontend/components/KPICards.jsx` | 30s | Depends on useAnalytics |
| Revenue Chart | `src/frontend/components/RevenueChart.jsx` | 45s | Depends on useAnalytics |
| Product Chart | `src/frontend/components/ProductChart.jsx` | 45s | Depends on useAnalytics |
| Customer Chart | `src/frontend/components/CustomerChart.jsx` | 45s | Depends on useAnalytics |
| Channel Chart | `src/frontend/components/ChannelChart.jsx` | 45s | Depends on useAnalytics |

**Parallelism**: Hook and DateFilter first, then all 5 chart/card components in parallel.

##### Wave 5: Integration Shell + Testing
| Task | Files | Est. Time | Rationale |
|------|-------|-----------|-----------|
| App.jsx layout | `src/frontend/App.jsx` | 45s | Depends on all components |
| index.html + entry | `src/frontend/index.html`, `src/frontend/main.jsx` | 15s | Standard Vite entry |
| Acceptance tests | `tests/acceptance.sh` | 60s | Validate everything end-to-end |

#### Strategy B: Vertical (Feature Slices)

An alternative valid decomposition builds one full vertical slice at a time:

- **Wave 1**: Foundation (db, scaffold, pipeline, fixtures, ingest)
- **Wave 2**: Revenue feature E2E (query → endpoint → chart component)
- **Wave 3**: Products feature E2E (query → endpoint → chart component)
- **Wave 4**: Customers + Channels features (parallel vertical slices)
- **Wave 5**: Summary/KPI + DateFilter + App shell + integration

This is valid but typically slower because it misses the parallelism of all endpoints being independent. **The evaluation rubric scores Strategy A higher.**

### Critical Path

```
db → loader → pipeline-run → queries → revenue-endpoint → server → (API ready)
scaffold → vite-config → useAnalytics → RevenueChart → App.jsx → (Frontend ready)
```

Both paths must complete for full integration testing.

---

## 4. Detailed Component Specifications

### 4.1 Database Module (`src/db.js`)

**Exports**:
```javascript
{
  getDb(): Database,
  close(): void
}
```

**Behavior**:
- Database file: `./data/insightboard.db`
- Create `data/` directory if missing
- Enable WAL mode + foreign keys
- Singleton pattern — return same instance on repeated calls

---

### 4.2 CSV Parser (`src/pipeline/parser.js`)

**Exports**: `parseCSV(filePath: string): object[]`

**Behavior**:
- Read file synchronously
- Use `csv-parse/sync` for parsing
- Return array of row objects with header-based keys
- Trim whitespace from all values
- Skip empty rows

---

### 4.3 Data Transformer (`src/pipeline/transformer.js`)

**Exports**:
```javascript
{
  transformOrders(rawRows: object[]): Order[],
  transformProducts(rawRows: object[]): Product[],
  transformCustomers(rawRows: object[]): Customer[]
}
```

**Order transformation**:
```javascript
{
  id: string,              // Keep as-is
  customer_id: string,     // Keep as-is
  product_id: string,      // Keep as-is
  quantity: number,         // Parse int, default 1
  unit_price: number,       // Parse float, 2 decimal places
  total_amount: number,     // quantity * unit_price
  channel: string,          // Normalize to lowercase enum: 'organic', 'paid_search', 'social', 'email', 'referral', 'direct'
  order_date: string,       // Validate ISO format, reject invalid
  status: string            // Normalize: 'completed', 'refunded', 'pending'
}
```

**Product transformation**:
```javascript
{
  id: string,
  name: string,            // Trim, title case
  category: string,        // Normalize to lowercase
  cost: number             // Parse float
}
```

**Customer transformation**:
```javascript
{
  id: string,
  name: string,
  email: string,
  segment: string,         // Normalize: 'enterprise', 'smb', 'startup', 'individual'
  signup_date: string,     // Validate ISO format
  region: string           // Normalize: 'north_america', 'europe', 'asia_pacific', 'latin_america'
}
```

**Validation rules**:
- Skip rows where required fields are missing (log warning)
- Skip rows with unparseable dates
- Skip rows with negative amounts
- Return only valid, transformed records

---

### 4.4 DB Loader (`src/pipeline/loader.js`)

**Exports**:
```javascript
{
  createTables(): void,
  loadOrders(orders: Order[]): number,
  loadProducts(products: Product[]): number,
  loadCustomers(customers: Customer[]): number
}
```

**Schema**:

```sql
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    cost REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    segment TEXT NOT NULL,
    signup_date TEXT NOT NULL,
    region TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL,
    total_amount REAL NOT NULL,
    channel TEXT NOT NULL,
    order_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed'
);

-- Indices for common query patterns
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_orders_channel ON orders(channel);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(product_id);
CREATE INDEX IF NOT EXISTS idx_customers_segment ON customers(segment);
CREATE INDEX IF NOT EXISTS idx_customers_region ON customers(region);
```

**Behavior**:
- Use `better-sqlite3` prepared statements for bulk insert
- Wrap inserts in a transaction for performance
- Return count of inserted records
- Products and customers must load BEFORE orders (FK constraint)

---

### 4.5 Pipeline Orchestrator (`src/pipeline/index.js`)

**Exports**: `runPipeline(fixturesDir: string): PipelineResult`

**PipelineResult**:
```javascript
{
  productsLoaded: number,
  customersLoaded: number,
  ordersLoaded: number,
  skippedRows: number,
  elapsed: number          // milliseconds
}
```

**Sequence**:
1. Parse `products.csv` → transform → load products
2. Parse `customers.csv` → transform → load customers
3. Parse `orders.csv` → transform → load orders
4. Return summary

---

### 4.6 Query Engine (`src/api/queries.js`)

**Exports**:
```javascript
{
  getRevenueSeries(startDate, endDate, granularity): TimeSeriesPoint[],
  getProductPerformance(startDate, endDate, limit): ProductMetric[],
  getCustomerSegments(startDate, endDate): SegmentMetric[],
  getChannelAttribution(startDate, endDate): ChannelMetric[],
  getSummary(startDate, endDate): SummaryMetrics
}
```

**Revenue Series** (`getRevenueSeries`):
```sql
SELECT 
    date(order_date) as date,
    SUM(total_amount) as revenue,
    COUNT(*) as order_count
FROM orders
WHERE order_date >= ? AND order_date <= ?
  AND status = 'completed'
GROUP BY date(order_date)
ORDER BY date ASC
```

Granularity parameter: `day` (default), `week`, `month`
- For `week`: use `strftime('%Y-W%W', order_date)` grouping
- For `month`: use `strftime('%Y-%m', order_date)` grouping

**Product Performance** (`getProductPerformance`):
```sql
SELECT 
    p.id,
    p.name,
    p.category,
    SUM(o.total_amount) as revenue,
    SUM(o.quantity) as units_sold,
    COUNT(DISTINCT o.customer_id) as unique_buyers,
    AVG(o.unit_price) as avg_price
FROM orders o
JOIN products p ON o.product_id = p.id
WHERE o.order_date >= ? AND o.order_date <= ?
  AND o.status = 'completed'
GROUP BY p.id
ORDER BY revenue DESC
LIMIT ?
```

**Customer Segments** (`getCustomerSegments`):
```sql
SELECT 
    c.segment,
    COUNT(DISTINCT c.id) as customer_count,
    SUM(o.total_amount) as total_revenue,
    AVG(o.total_amount) as avg_order_value,
    COUNT(o.id) as order_count
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id 
    AND o.order_date >= ? AND o.order_date <= ?
    AND o.status = 'completed'
GROUP BY c.segment
ORDER BY total_revenue DESC
```

**Channel Attribution** (`getChannelAttribution`):
```sql
SELECT 
    channel,
    COUNT(*) as order_count,
    SUM(total_amount) as revenue,
    AVG(total_amount) as avg_order_value,
    COUNT(DISTINCT customer_id) as unique_customers
FROM orders
WHERE order_date >= ? AND order_date <= ?
  AND status = 'completed'
GROUP BY channel
ORDER BY revenue DESC
```

**Summary** (`getSummary`):
```sql
-- Total revenue
SELECT SUM(total_amount) as total_revenue FROM orders 
WHERE order_date >= ? AND order_date <= ? AND status = 'completed';

-- Total orders
SELECT COUNT(*) as total_orders FROM orders
WHERE order_date >= ? AND order_date <= ? AND status = 'completed';

-- Unique customers
SELECT COUNT(DISTINCT customer_id) as unique_customers FROM orders
WHERE order_date >= ? AND order_date <= ? AND status = 'completed';

-- Average order value
SELECT AVG(total_amount) as avg_order_value FROM orders
WHERE order_date >= ? AND order_date <= ? AND status = 'completed';
```

Return shape:
```javascript
{
  totalRevenue: number,
  totalOrders: number,
  uniqueCustomers: number,
  avgOrderValue: number
}
```

---

### 4.7 API Endpoints

All endpoints accept optional query parameters: `start_date` (ISO), `end_date` (ISO).

Defaults: `start_date` = 30 days ago, `end_date` = today.

| Method | Path | Query Params | Response |
|--------|------|-------------|----------|
| GET | `/api/summary` | start_date, end_date | SummaryMetrics |
| GET | `/api/revenue` | start_date, end_date, granularity | TimeSeriesPoint[] |
| GET | `/api/products` | start_date, end_date, limit (default 10) | ProductMetric[] |
| GET | `/api/customers` | start_date, end_date | SegmentMetric[] |
| GET | `/api/channels` | start_date, end_date | ChannelMetric[] |

Each route file (`src/api/routes/*.js`) exports an Express Router.

**Response format** (consistent across all endpoints):
```javascript
{
  data: [...],          // Array of results (or object for summary)
  meta: {
    startDate: string,
    endDate: string,
    generatedAt: string
  }
}
```

---

### 4.8 API Server (`src/api/server.js`)

**Exports**: `startServer(port?: number): { app, server }`

**Behavior**:
1. Create Express app
2. Register middleware: `express.json()`, `cors()`
3. Mount all route groups under `/api/`
4. Add health check: `GET /api/health` → `{ status: 'ok', timestamp: ... }`
5. Start on `process.env.PORT || 3002`

---

### 4.9 Frontend: useAnalytics Hook (`src/frontend/hooks/useAnalytics.js`)

**Signature**: `useAnalytics(endpoint: string, params?: object)`

**Returns**:
```javascript
{
  data: any | null,
  loading: boolean,
  error: string | null,
  refetch: () => void
}
```

**Behavior**:
- Construct URL: `http://localhost:3002/api/${endpoint}?${queryString}`
- Fetch on mount and when params change
- Include date range from DateFilter context in params
- Handle loading/error states
- `refetch` function for manual refresh

---

### 4.10 Frontend: DateFilter Component

**File**: `src/frontend/components/DateFilter.jsx`

**Behavior**:
- Provide React context: `DateRangeContext`
- Expose `useDateRange()` hook for child components
- Default range: last 30 days
- Preset buttons: "7 days", "30 days", "90 days", "All time"
- Custom date inputs (HTML date pickers)
- When range changes, all charts re-fetch automatically (via context)

**Context shape**:
```javascript
{
  startDate: string,   // ISO date
  endDate: string,     // ISO date
  setRange: (start, end) => void
}
```

---

### 4.11 Frontend: KPI Summary Cards

**File**: `src/frontend/components/KPICards.jsx`

**Renders 4 cards**:
| Card | Value | Format |
|------|-------|--------|
| Total Revenue | `summary.totalRevenue` | `$XX,XXX.XX` |
| Total Orders | `summary.totalOrders` | `X,XXX` |
| Unique Customers | `summary.uniqueCustomers` | `X,XXX` |
| Avg Order Value | `summary.avgOrderValue` | `$XX.XX` |

**Styling**:
- Grid of 4 cards in a single row (responsive: 2x2 on mobile)
- Each card has: label (small, muted), value (large, bold), subtle background color

---

### 4.12 Frontend: Revenue Chart (Line Chart)

**File**: `src/frontend/components/RevenueChart.jsx`

**Recharts components**: `LineChart`, `Line`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`

**Data mapping**:
- X-axis: `date` (formatted as MMM DD)
- Y-axis: `revenue` (formatted as currency)
- Secondary line: `order_count` (different color, right Y-axis)
- Tooltip shows both values

---

### 4.13 Frontend: Product Chart (Bar Chart)

**File**: `src/frontend/components/ProductChart.jsx`

**Recharts components**: `BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`

**Data mapping**:
- X-axis: `name` (product name, truncated to 15 chars)
- Y-axis: `revenue`
- Bar color: by `category` (use a color map)
- Show top 10 products by default

---

### 4.14 Frontend: Customer Segments Chart (Pie Chart)

**File**: `src/frontend/components/CustomerChart.jsx`

**Recharts components**: `PieChart`, `Pie`, `Cell`, `Tooltip`, `Legend`, `ResponsiveContainer`

**Data mapping**:
- Segments: `segment` field
- Value: `total_revenue`
- Colors: fixed color per segment (enterprise=blue, smb=green, startup=orange, individual=gray)
- Legend below chart
- Tooltip shows: segment name, revenue, customer count

---

### 4.15 Frontend: Channel Attribution Chart (Stacked Bar)

**File**: `src/frontend/components/ChannelChart.jsx`

**Recharts components**: `BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `Legend`, `ResponsiveContainer`

**Data mapping**:
- X-axis: `channel` name
- Stacked bars: `revenue` and `order_count` (normalized or dual-axis)
- Colors: fixed per channel
- Tooltip shows: channel, revenue, orders, avg order value, unique customers

---

### 4.16 Frontend: App Layout

**File**: `src/frontend/App.jsx`

**Layout** (CSS Grid):
```
+--------------------------------------------+
|  Header: "InsightBoard" + DateFilter       |
+--------------------------------------------+
|  KPI Cards (4 across)                      |
+--------------------------------------------+
|  Revenue Chart (full width)                |
+---------------------+----------------------+
|  Product Chart      |  Customer Chart      |
+---------------------+----------------------+
|  Channel Chart (full width)                |
+--------------------------------------------+
```

**Styling**:
- Dark header bar with white text
- Light gray background
- White card backgrounds with subtle shadow
- Responsive: single column on mobile

---

## 5. Input Fixtures

### Products CSV (`fixtures/products.csv`)

```csv
id,name,category,cost
PROD-001,Wireless Headphones,electronics,32.50
PROD-002,Organic Coffee Beans,food,8.75
PROD-003,Running Shoes,apparel,45.00
PROD-004,Desk Lamp,home,15.20
PROD-005,Python Cookbook,books,22.00
PROD-006,Yoga Mat,fitness,12.00
PROD-007,Bluetooth Speaker,electronics,28.00
PROD-008,Green Tea Set,food,18.50
PROD-009,Winter Jacket,apparel,65.00
PROD-010,Standing Desk,home,180.00
PROD-011,Data Science Handbook,books,35.00
PROD-012,Resistance Bands,fitness,9.50
PROD-013,Noise Cancelling Earbuds,electronics,55.00
PROD-014,Protein Powder,food,24.00
PROD-015,Hiking Boots,apparel,78.00
```

### Customers CSV (`fixtures/customers.csv`)

```csv
id,name,email,segment,signup_date,region
CUST-001,Alice Johnson,alice@example.com,enterprise,2023-01-15,north_america
CUST-002,Bob Smith,bob@example.com,smb,2023-03-22,north_america
CUST-003,Charlie Chen,charlie@example.com,startup,2023-06-01,asia_pacific
CUST-004,Diana Patel,diana@example.com,enterprise,2023-02-10,europe
CUST-005,Eve Martinez,eve@example.com,individual,2023-07-18,latin_america
CUST-006,Frank Weber,frank@example.com,smb,2023-04-05,europe
CUST-007,Grace Kim,grace@example.com,startup,2023-08-12,asia_pacific
CUST-008,Henry Brown,henry@example.com,enterprise,2023-01-28,north_america
CUST-009,Iris Tanaka,iris@example.com,individual,2023-09-03,asia_pacific
CUST-010,Jack O'Brien,jack@example.com,smb,2023-05-14,north_america
CUST-011,Karen Liu,karen@example.com,startup,2023-10-22,asia_pacific
CUST-012,Leo Rossi,leo@example.com,enterprise,2023-03-08,europe
CUST-013,Maya Singh,maya@example.com,individual,2023-11-15,asia_pacific
CUST-014,Noah Davis,noah@example.com,smb,2023-06-30,north_america
CUST-015,Olivia Müller,olivia@example.com,startup,2023-12-01,europe
```

### Orders CSV (`fixtures/orders.csv`)

```csv
id,customer_id,product_id,quantity,unit_price,channel,order_date,status
ORD-001,CUST-001,PROD-001,2,49.99,organic,2024-01-05,completed
ORD-002,CUST-002,PROD-003,1,89.99,paid_search,2024-01-07,completed
ORD-003,CUST-003,PROD-005,3,29.99,social,2024-01-10,completed
ORD-004,CUST-001,PROD-010,1,349.99,organic,2024-01-12,completed
ORD-005,CUST-004,PROD-002,5,12.99,email,2024-01-15,completed
ORD-006,CUST-005,PROD-006,2,24.99,referral,2024-01-18,completed
ORD-007,CUST-006,PROD-009,1,129.99,paid_search,2024-01-20,completed
ORD-008,CUST-007,PROD-013,1,99.99,social,2024-01-22,completed
ORD-009,CUST-008,PROD-011,2,42.99,direct,2024-01-25,completed
ORD-010,CUST-003,PROD-007,1,59.99,social,2024-01-28,refunded
ORD-011,CUST-009,PROD-004,3,29.99,organic,2024-02-01,completed
ORD-012,CUST-010,PROD-008,2,34.99,email,2024-02-03,completed
ORD-013,CUST-001,PROD-014,4,39.99,organic,2024-02-05,completed
ORD-014,CUST-011,PROD-012,5,14.99,social,2024-02-08,completed
ORD-015,CUST-012,PROD-001,1,49.99,paid_search,2024-02-10,completed
ORD-016,CUST-002,PROD-015,1,149.99,paid_search,2024-02-12,completed
ORD-017,CUST-013,PROD-003,2,89.99,referral,2024-02-15,completed
ORD-018,CUST-004,PROD-010,1,349.99,email,2024-02-18,completed
ORD-019,CUST-014,PROD-005,1,29.99,direct,2024-02-20,pending
ORD-020,CUST-006,PROD-002,10,12.99,paid_search,2024-02-22,completed
ORD-021,CUST-015,PROD-013,2,99.99,social,2024-02-25,completed
ORD-022,CUST-008,PROD-009,1,129.99,direct,2024-02-28,completed
ORD-023,CUST-001,PROD-006,3,24.99,organic,2024-03-02,completed
ORD-024,CUST-003,PROD-011,1,42.99,social,2024-03-05,completed
ORD-025,CUST-005,PROD-004,2,29.99,referral,2024-03-08,completed
ORD-026,CUST-010,PROD-001,1,49.99,email,2024-03-10,refunded
ORD-027,CUST-007,PROD-008,4,34.99,social,2024-03-12,completed
ORD-028,CUST-012,PROD-015,1,149.99,paid_search,2024-03-15,completed
ORD-029,CUST-009,PROD-014,2,39.99,organic,2024-03-18,completed
ORD-030,CUST-011,PROD-007,1,59.99,social,2024-03-20,completed
ORD-031,CUST-002,PROD-010,1,349.99,paid_search,2024-03-22,completed
ORD-032,CUST-014,PROD-012,3,14.99,direct,2024-03-25,completed
ORD-033,CUST-004,PROD-003,2,89.99,email,2024-03-28,completed
ORD-034,CUST-013,PROD-001,1,49.99,referral,2024-03-30,completed
ORD-035,CUST-006,PROD-005,2,29.99,paid_search,2024-04-02,completed
ORD-036,CUST-001,PROD-013,1,99.99,organic,2024-04-05,completed
ORD-037,CUST-015,PROD-002,8,12.99,social,2024-04-08,completed
ORD-038,CUST-008,PROD-006,2,24.99,direct,2024-04-10,completed
ORD-039,CUST-003,PROD-009,1,129.99,social,2024-04-12,pending
ORD-040,CUST-010,PROD-011,1,42.99,email,2024-04-15,completed
ORD-041,CUST-001,PROD-004,4,29.99,,2024-04-18,completed
ORD-042,CUST-007,PROD-014,3,39.99,social,2024-04-20,completed
ORD-043,CUST-012,PROD-007,2,59.99,paid_search,2024-04-22,completed
ORD-044,CUST-005,PROD-008,1,34.99,referral,2024-04-25,completed
ORD-045,CUST-011,PROD-015,1,149.99,social,2024-04-28,completed
ORD-046,CUST-002,PROD-012,4,14.99,paid_search,2024-05-01,completed
ORD-047,CUST-009,PROD-010,1,349.99,organic,2024-05-03,completed
ORD-048,CUST-014,PROD-001,2,49.99,direct,2024-05-05,refunded
ORD-049,CUST-004,PROD-006,5,24.99,email,2024-05-08,completed
ORD-050,CUST-013,PROD-003,1,89.99,referral,2024-05-10,completed
```

**Note on fixture data**:
- ORD-041 has an empty `channel` field — transformer should handle this (default to `'direct'` or skip)
- ORD-010, ORD-026, ORD-048 are refunded — should be excluded from revenue calculations
- ORD-019, ORD-039 are pending — should be excluded from completed revenue
- 50 orders across 15 customers and 15 products, spanning Jan–May 2024
- Mix of all 6 channels, 4 customer segments, 4 regions

---

## 6. Acceptance Criteria

### Full Acceptance Script

```bash
#!/bin/bash
# acceptance.sh — InsightBoard End-to-End Acceptance Tests
PASS=0
FAIL=0

check() {
    local desc="$1"
    local condition="$2"
    if eval "$condition"; then
        echo "  PASS: $desc"
        ((PASS++))
    else
        echo "  FAIL: $desc"
        ((FAIL++))
    fi
}

echo "=== InsightBoard Acceptance Tests ==="

# --- Phase 1: Pipeline ---
echo ""
echo "--- Data Pipeline ---"

# Run pipeline
node src/pipeline/index.js 2>/dev/null
PIPELINE_EXIT=$?
check "Pipeline runs without error" "[ $PIPELINE_EXIT -eq 0 ]"
check "Database file created" "[ -f ./data/insightboard.db ]"

# Verify data loaded
PRODUCT_COUNT=$(sqlite3 ./data/insightboard.db "SELECT COUNT(*) FROM products;" 2>/dev/null)
CUSTOMER_COUNT=$(sqlite3 ./data/insightboard.db "SELECT COUNT(*) FROM customers;" 2>/dev/null)
ORDER_COUNT=$(sqlite3 ./data/insightboard.db "SELECT COUNT(*) FROM orders;" 2>/dev/null)

check "Products loaded (expect 15)" "[ '$PRODUCT_COUNT' = '15' ]"
check "Customers loaded (expect 15)" "[ '$CUSTOMER_COUNT' = '15' ]"
# ORD-041 may be skipped due to empty channel, so 49 or 50 is acceptable
check "Orders loaded (expect 49-50)" "[ '$ORDER_COUNT' -ge 49 ] && [ '$ORDER_COUNT' -le 50 ]"

# Verify refunded orders exist but are excluded from revenue queries
REFUNDED=$(sqlite3 ./data/insightboard.db "SELECT COUNT(*) FROM orders WHERE status='refunded';" 2>/dev/null)
check "Refunded orders preserved (expect 3)" "[ '$REFUNDED' = '3' ]"

# --- Phase 2: API ---
echo ""
echo "--- API Server ---"

# Start API server in background
node src/api/server.js &
API_PID=$!
sleep 2

API_URL="http://localhost:3002/api"

# Health check
HEALTH_STATUS=$(curl -s -o /dev/null -w '%{http_code}' $API_URL/health)
check "API health check" "[ '$HEALTH_STATUS' = '200' ]"

# Summary endpoint
SUMMARY=$(curl -s "$API_URL/summary?start_date=2024-01-01&end_date=2024-05-31")
check "Summary endpoint returns data" "echo '$SUMMARY' | grep -q 'totalRevenue'"
check "Summary has meta" "echo '$SUMMARY' | grep -q 'startDate'"

# Revenue endpoint
REVENUE=$(curl -s "$API_URL/revenue?start_date=2024-01-01&end_date=2024-05-31")
check "Revenue endpoint returns array" "echo '$REVENUE' | grep -q 'data'"
REVENUE_POINTS=$(echo "$REVENUE" | grep -o '"date"' | wc -l)
check "Revenue has multiple data points" "[ $REVENUE_POINTS -gt 5 ]"

# Products endpoint
PRODUCTS=$(curl -s "$API_URL/products?start_date=2024-01-01&end_date=2024-05-31&limit=5")
check "Products endpoint returns data" "echo '$PRODUCTS' | grep -q 'revenue'"
PROD_COUNT=$(echo "$PRODUCTS" | grep -o '"name"' | wc -l)
check "Products respects limit=5" "[ $PROD_COUNT -le 5 ]"

# Customers endpoint
CUSTOMERS=$(curl -s "$API_URL/customers?start_date=2024-01-01&end_date=2024-05-31")
check "Customers endpoint returns segments" "echo '$CUSTOMERS' | grep -q 'segment'"
check "Has enterprise segment" "echo '$CUSTOMERS' | grep -q 'enterprise'"
check "Has smb segment" "echo '$CUSTOMERS' | grep -q 'smb'"

# Channels endpoint
CHANNELS=$(curl -s "$API_URL/channels?start_date=2024-01-01&end_date=2024-05-31")
check "Channels endpoint returns data" "echo '$CHANNELS' | grep -q 'channel'"
check "Has organic channel" "echo '$CHANNELS' | grep -q 'organic'"
check "Has paid_search channel" "echo '$CHANNELS' | grep -q 'paid_search'"

# Revenue excludes refunded
TOTAL_REV=$(echo "$SUMMARY" | grep -o '"totalRevenue":[0-9.]*' | cut -d: -f2)
check "Revenue is positive" "[ $(echo '$TOTAL_REV > 0' | bc 2>/dev/null || echo 1) -eq 1 ]"

# Date filtering works
NARROW=$(curl -s "$API_URL/revenue?start_date=2024-03-01&end_date=2024-03-31")
NARROW_POINTS=$(echo "$NARROW" | grep -o '"date"' | wc -l)
check "Date filter narrows results" "[ $NARROW_POINTS -lt $REVENUE_POINTS ]"

# Kill API server
kill $API_PID 2>/dev/null

# --- Phase 3: Frontend ---
echo ""
echo "--- Frontend ---"

# Check that frontend files exist
check "App.jsx exists" "[ -f src/frontend/App.jsx ]"
check "KPICards component exists" "[ -f src/frontend/components/KPICards.jsx ]"
check "RevenueChart component exists" "[ -f src/frontend/components/RevenueChart.jsx ]"
check "ProductChart component exists" "[ -f src/frontend/components/ProductChart.jsx ]"
check "CustomerChart component exists" "[ -f src/frontend/components/CustomerChart.jsx ]"
check "ChannelChart component exists" "[ -f src/frontend/components/ChannelChart.jsx ]"
check "DateFilter component exists" "[ -f src/frontend/components/DateFilter.jsx ]"
check "useAnalytics hook exists" "[ -f src/frontend/hooks/useAnalytics.js ]"
check "Vite config exists" "[ -f vite.config.js ]"
check "index.html exists" "[ -f src/frontend/index.html ] || [ -f index.html ]"

# Verify frontend builds
cd src/frontend 2>/dev/null || true
npx vite build 2>/dev/null
VITE_EXIT=$?
cd ../.. 2>/dev/null || true
check "Frontend builds without error" "[ $VITE_EXIT -eq 0 ]"

# Verify components import Recharts
check "RevenueChart uses Recharts" "grep -q 'recharts' src/frontend/components/RevenueChart.jsx"
check "ProductChart uses Recharts" "grep -q 'recharts' src/frontend/components/ProductChart.jsx"
check "CustomerChart uses Recharts" "grep -q 'recharts' src/frontend/components/CustomerChart.jsx"
check "ChannelChart uses Recharts" "grep -q 'recharts' src/frontend/components/ChannelChart.jsx"

# Verify DateFilter context pattern
check "DateFilter exports context" "grep -q 'Context' src/frontend/components/DateFilter.jsx"
check "useAnalytics handles loading state" "grep -q 'loading' src/frontend/hooks/useAnalytics.js"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
exit $FAIL
```

---

## 7. Evaluation Rubric

### Optimal Wave Plan Score (25 points)

| Score | Criteria |
|-------|----------|
| 25 | Chooses horizontal strategy, maximizes parallelism, correctly sequences pipeline before API |
| 20 | Correct layer ordering but misses parallelism within layers |
| 15 | Builds vertically but maintains correct dependencies within each slice |
| 10 | Mixes layers without clear strategy, some dependency violations |
| 5 | Attempts to build frontend before API/data layer |
| 0 | No discernible planning strategy |

### Key Decision Points to Watch

1. **Does the planner separate the three layers?** The data pipeline, API, and frontend are architecturally distinct. The planner should recognize this.

2. **Does the planner run the pipeline (ingest data) before building API routes?** The API needs data in SQLite to return meaningful results. This is a runtime dependency, not just a code dependency.

3. **Does the planner parallelize the 5 API endpoints?** All endpoints depend only on `queries.js` — they're fully independent.

4. **Does the planner parallelize the 4 chart components + KPI cards?** They all share the same `useAnalytics` hook pattern and are independent.

5. **Does the planner create the shared data contract (query engine) early?** The query engine defines the response shapes that the frontend consumes. Building it early allows both API routes and frontend components to reference it.

6. **Does the planner handle the fixture data correctly?** The CSV fixtures contain intentional edge cases (empty fields, refunded orders). The planner should include transformation logic in the prompt.

7. **Horizontal vs. vertical — what does the planner choose and why?** This is the most interesting decision point. Strategy A (horizontal) typically scores higher because it maximizes within-layer parallelism, but a well-executed Strategy B (vertical) can work if the planner correctly manages the cross-layer dependencies.

8. **Does the planner recognize the Vite build system as a separate concern?** The frontend needs a `vite.config.js` and proper project structure. If this is deferred too late, the entire frontend fails to build.
