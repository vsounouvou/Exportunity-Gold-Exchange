# Company System Architecture

## Overview

The Company System is a comprehensive multi-tenant business management framework that enables complete organizational modeling, financial tracking, and AI-driven automation. This document outlines how all components connect and interact.

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CHAIRMAN / USER LAYER                        │
│  • Human oversight & control                                         │
│  • Access to all companies                                           │
│  • Cross-company analytics                                           │
└────────────┬────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        COMPANY MANAGEMENT LAYER                      │
│                                                                       │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  Company Profile │  │  Company List    │  │  Company Creator │  │
│  │  - Basic Info    │  │  - Grid View     │  │  - Multi-step    │  │
│  │  - Legal Details │  │  - Filters       │  │  - Validation    │  │
│  │  - Financials    │  │  - Stats         │  │  - AI Settings   │  │
│  │  - Shareholders  │  │  - Search        │  │  - Auto-gen      │  │
│  │  - KPIs          │  │                  │  │    Departments   │  │
│  │  - AI Settings   │  │                  │  │    & Agents      │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
│                                                                       │
└────────────┬────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         DATABASE LAYER (PostgreSQL)                  │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ COMPANIES TABLE (Enhanced)                                     │ │
│  │  • Basic: name, description, logo, status                      │ │
│  │  • Legal: country, legalType, registrationNumber, regDate     │ │
│  │  • Industry: primarySector, secondarySector, industryTags     │ │
│  │  • Strategy: vision, currentGoals, kpiTargets                 │ │
│  │  • Finance: totalRevenue, totalProfit, totalExpenses          │ │
│  │  • Budgets: dailyCashBurnTarget, tokenUsageLimit, monthly$    │ │
│  │  • AI: autonomyLevel, riskAppetite, creativity, strictness    │ │
│  │  • Hierarchy: parentCompanyId (subsidiaries support)          │ │
│  │  • Theme: themeColor                                           │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌───────────────────┐  ┌───────────────────┐  ┌─────────────────┐ │
│  │ SHAREHOLDERS      │  │ COMPANY_KPIS      │  │ REVENUE_TRANS   │ │
│  │ • Name            │  │ • KPI Name        │  │ • Amount        │ │
│  │ • Type            │  │ • Value           │  │ • Type          │ │
│  │ • Share %         │  │ • Period          │  │ • Source        │ │
│  │ • Role            │  │ • Target          │  │ • Description   │ │
│  │ • Wallet          │  │ • Category        │  │ • Timestamp     │ │
│  │ • Distribution    │  │                   │  │                 │ │
│  └───────────────────┘  └───────────────────┘  └─────────────────┘ │
│                                                                       │
└────────────┬────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    ORGANIZATIONAL STRUCTURE LAYER                    │
│                                                                       │
│  ┌──────────────────┐      ┌──────────────────┐                     │
│  │   DEPARTMENTS    │──┬──▶│     AGENTS       │                     │
│  │  • Name          │  │   │  • Name          │                     │
│  │  • Description   │  │   │  • Role          │                     │
│  │  • Color         │  │   │  • Department    │                     │
│  │  • Order         │  │   │  • Manager       │                     │
│  └──────────────────┘  │   │  • Budget        │                     │
│                        │   │  • Status        │                     │
│  Auto-generated:       │   │  • Personality   │                     │
│  • Executive          │   │  • Mission       │                     │
│  • Sales              │   │  • AI Behavior ──┼─ Inherits from      │
│  • Marketing          │   │                  │   Company Settings   │
│  • Finance            │   └──────────────────┘                     │
│  • Operations         │                                             │
│  • Legal              │                                             │
│                        │                                             │
└────────────┬───────────┴─────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       OPERATIONAL LAYER                              │
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────┐ │
│  │   MEETINGS   │  │    TASKS     │  │   KNOWLEDGE  │  │ ACTIONS │ │
│  │  • Rooms     │  │  • Assigned  │  │  • Documents │  │ • Defs  │ │
│  │  • Schedules │  │  • Priority  │  │  • Spaces    │  │ • Perms │ │
│  │  • Minutes   │  │  • Status    │  │  • Sources   │  │ • Exec  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────┘ │
│                                                                       │
│  All operations are scoped to company via companyId                  │
│                                                                       │
└────────────┬────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      FINANCIAL TRACKING LAYER                        │
│                                                                       │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐   │
│  │ COST_TRANS       │  │ REVENUE_TRANS    │  │ BUDGET_ADJ      │   │
│  │  • Agent         │  │  • Company       │  │  • Agent        │   │
│  │  • Amount        │  │  • Amount        │  │  • Adjustment   │   │
│  │  • Type          │  │  • Type          │  │  • Reason       │   │
│  │  • Provider      │  │  • Source        │  │                 │   │
│  └──────────────────┘  └──────────────────┘  └─────────────────┘   │
│                                                                       │
│  Aggregated to:                                                      │
│  • Company totalRevenue, totalProfit, totalExpenses                 │
│  • Agent budgetUsed                                                 │
│                                                                       │
└────────────┬────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       AI PROVIDER INTEGRATION                        │
│                                                                       │
│  ┌──────────────────┐  ┌──────────────────┐                         │
│  │   OpenAI API     │  │  Anthropic API   │                         │
│  │  • GPT-4         │  │  • Claude 3.5    │                         │
│  │  • TTS (Nova)    │  │  • Claude Opus   │                         │
│  │  • Embeddings    │  │                  │                         │
│  └──────────────────┘  └──────────────────┘                         │
│                                                                       │
│  Token tracking feeds into company budgets and cost transactions     │
│  AI behavior follows company settings (autonomy, risk, creativity)   │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagrams

### Company Creation Flow

```
User Interaction
    │
    ▼
┌──────────────────────────┐
│ CreateCompanyDialogEnhanced │
│ - 4 step wizard          │
│ - Form validation        │
└──────────────────────────┘
    │
    ▼ POST /api/companies
┌──────────────────────────┐
│ Backend Routes           │
│ - Validate input         │
│ - Insert company record  │
└──────────────────────────┘
    │
    ├─▶ Create Company in DB
    │   └─▶ Auto-generate Departments (6)
    │       └─▶ Auto-generate Core Agents (6)
    │           • CEO
    │           • VP Sales
    │           • VP Marketing
    │           • Finance Controller
    │           • Operations Manager
    │           • General Counsel
    │
    ▼
Return Company Object
    │
    ▼
Update UI (Companies List)
```

### Company Profile Data Loading Flow

```
User Navigation (/company?id=X)
    │
    ▼
GET /api/companies/:id
    │
    ├─▶ Load Company Base Data
    ├─▶ Load Shareholders (many)
    ├─▶ Load Company KPIs (many)
    ├─▶ Load Revenue Transactions (many)
    ├─▶ Load Agents (many)
    └─▶ Load Cost Transactions (many)
    │
    ▼
Drizzle ORM Query with Relations
    │
    ▼
Return Complete Company Object
    │
    ▼
CompanyProfilePage Renders
    │
    ├─▶ Overview Tab (vision, goals, industry)
    ├─▶ Shareholders Tab (ownership breakdown)
    ├─▶ KPIs Tab (performance metrics)
    ├─▶ Revenue Tab (financial transactions)
    └─▶ AI Settings Tab (behavior config)
```

### Multi-Company List with Filters Flow

```
User Views /companies
    │
    ▼
GET /api/companies
    │
    ├─▶ Load All Companies
    ├─▶ Load Agent Counts per Company
    └─▶ Calculate Stats (revenue, profit, expenses)
    │
    ▼
Frontend Filtering
    │
    ├─▶ Search by name/description
    ├─▶ Filter by sector
    ├─▶ Filter by country
    └─▶ Filter by legal type
    │
    ▼
Display Grid
    │
    └─▶ Card per company with:
        • Logo/Initial
        • Name, Legal Type, Autonomy
        • Country, Sector
        • Revenue, Profit, Margin
        • Agent Count
```

## Key Integration Points

### 1. Company → Agents Relationship
- **One-to-Many**: Each company has many agents
- **Cascade**: All agents belong to exactly one company
- **AI Behavior Inheritance**: Agents inherit AI settings from company
  - `autonomyLevel` → How much freedom agents have
  - `riskAppetite` → Risk tolerance for decisions
  - `creativity` → Innovation vs. proven methods
  - `strictness` → Rule adherence level

### 2. Company → Departments Relationship
- **One-to-Many**: Each company has many departments
- **Auto-Generation**: 6 default departments created on company creation
- **Cascade**: Agents are assigned to departments

### 3. Company → Financial Entities Relationship
- **Shareholders**: Track ownership distribution
- **KPIs**: Monitor performance metrics
- **Revenue Transactions**: Record income events
- **Cost Transactions**: Track expenses (via agents)

### 4. Company → Subsidiaries Relationship
- **Self-Referential**: `parentCompanyId` enables hierarchy
- **Use Case**: Holding companies with multiple subsidiaries
- **Future**: Consolidated reporting across company groups

## API Endpoints

### Companies
```
GET    /api/companies              # List all companies with agent counts
POST   /api/companies              # Create new company (enhanced with all fields)
GET    /api/companies/:id          # Get company with full relations
PATCH  /api/companies/:id          # Update company details
DELETE /api/companies/:id          # Delete company (cascade to agents, depts)
```

### Company Relations
```
GET    /api/companies/:id/agents       # List all agents for company
GET    /api/companies/:id/departments  # List all departments
GET    /api/companies/:id/shareholders # List shareholders
GET    /api/companies/:id/kpis         # Get KPI history
GET    /api/companies/:id/revenue      # Get revenue transactions
```

## Frontend Routes

```
/companies          → CompanyListPage (grid view with filters)
/company?id=X       → CompanyProfilePage (detailed view with tabs)
```

## Database Schema Details

### Companies Table (Enhanced)
```sql
CREATE TABLE companies (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  
  -- Basic Info
  name TEXT NOT NULL,
  description TEXT,
  logo TEXT,
  status TEXT DEFAULT 'active',
  
  -- Legal Information
  country TEXT DEFAULT 'US',
  legal_type TEXT DEFAULT 'LLC',
  registration_number TEXT,
  registration_date TIMESTAMP,
  
  -- Industry Classification
  primary_sector TEXT DEFAULT 'technology',
  secondary_sector TEXT,
  industry_tags JSONB DEFAULT '[]',
  
  -- Strategy & Vision
  vision TEXT,
  current_goals JSONB DEFAULT '[]',
  kpi_targets JSONB DEFAULT '{}',
  
  -- Financial Tracking
  total_revenue NUMERIC(15,2) DEFAULT 0,
  total_profit NUMERIC(15,2) DEFAULT 0,
  total_expenses NUMERIC(15,2) DEFAULT 0,
  
  -- Budget Management
  monthly_budget NUMERIC(10,2) DEFAULT 1000,
  budget_used NUMERIC(10,2) DEFAULT 0,
  daily_cash_burn_target NUMERIC(10,2) DEFAULT 50,
  token_usage_limit INTEGER DEFAULT 1000000,
  
  -- AI Agent Behavior
  autonomy_level TEXT DEFAULT 'medium',      -- low | medium | high
  risk_appetite TEXT DEFAULT 'moderate',     -- conservative | moderate | aggressive
  creativity TEXT DEFAULT 'medium',          -- low | medium | high
  strictness TEXT DEFAULT 'balanced',        -- flexible | balanced | strict
  
  -- Hierarchy
  parent_company_id INTEGER REFERENCES companies(id),
  
  -- Theming
  theme_color TEXT DEFAULT '#3B82F6',
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Company Shareholders Table
```sql
CREATE TABLE company_shareholders (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  shareholder_name TEXT NOT NULL,
  shareholder_type TEXT DEFAULT 'investor',  -- investor | founder | employee | other
  share_percentage NUMERIC(5,2) NOT NULL,
  role TEXT,
  wallet_address TEXT,
  distribution_mode TEXT DEFAULT 'manual',   -- manual | automatic
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Company KPIs Table
```sql
CREATE TABLE company_kpis (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  kpi_name TEXT NOT NULL,
  kpi_value NUMERIC(15,2) NOT NULL,
  period TEXT DEFAULT 'monthly',             -- daily | weekly | monthly | quarterly | yearly
  target NUMERIC(15,2),
  category TEXT DEFAULT 'other',             -- revenue | cost | customer | operational | other
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Revenue Transactions Table
```sql
CREATE TABLE revenue_transactions (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  amount NUMERIC(15,2) NOT NULL,
  type TEXT NOT NULL,                        -- revenue | expense | investment | dividend
  source TEXT,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Security & Multi-Tenancy

### Data Isolation
- All company-scoped data includes `companyId`
- Queries filter by selected company ID
- Future: User permissions per company

### Access Control
- Chairman has full access to all companies
- Future: Role-based access (admin, manager, viewer)
- Future: Agent-level permissions for actions

## AI Integration

### Company AI Settings
```typescript
interface CompanyAISettings {
  autonomyLevel: 'low' | 'medium' | 'high';
  riskAppetite: 'conservative' | 'moderate' | 'aggressive';
  creativity: 'low' | 'medium' | 'high';
  strictness: 'flexible' | 'balanced' | 'strict';
}
```

### How Settings Affect Agents
1. **Autonomy Level**
   - Low: Agents request approval for most actions
   - Medium: Agents handle routine tasks autonomously
   - High: Agents operate with maximum freedom

2. **Risk Appetite**
   - Conservative: Prefer proven, safe approaches
   - Moderate: Balance risk and reward
   - Aggressive: Willing to take calculated risks

3. **Creativity**
   - Low: Follow established procedures
   - Medium: Suggest improvements
   - High: Propose innovative solutions

4. **Strictness**
   - Flexible: Adapt rules to context
   - Balanced: Follow guidelines with discretion
   - Strict: Enforce rules rigorously

## Performance Optimizations

### Database Queries
- Relations loaded with Drizzle ORM `with` clause
- Indexed on `companyId` for fast filtering
- Limited result sets (e.g., last 50 transactions)

### Frontend
- TanStack Query for caching
- Optimistic updates on mutations
- Parallel loading of independent data

### Scalability
- PostgreSQL connection pooling (Neon)
- Multi-tenant isolation ready
- Prepared for horizontal scaling

## Future Enhancements

### Planned Features
1. **Subsidiary Reporting**: Consolidated financials across company groups
2. **Shareholder Portal**: Automated profit distribution
3. **Advanced KPIs**: Custom formulas and benchmarking
4. **AI-Driven Insights**: Anomaly detection, forecasting
5. **Export & Reports**: PDF reports, data exports
6. **Compliance Dashboard**: Regulatory tracking
7. **Integration APIs**: External accounting systems

### Architecture Evolution
- Microservices for heavy computations
- Event-driven architecture for real-time updates
- Machine learning for predictive analytics
- Blockchain integration for transparent shareholder distributions

---

**Last Updated**: November 19, 2025  
**Version**: 1.0.0  
**Status**: Production Ready
