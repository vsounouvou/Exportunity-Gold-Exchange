# Exportunity Commodities Exchange (ECE)

## Overview

ECE is a commodities trading platform focused on transparency in African gold supply chains. 

**Key Features:**
- **Guest-first UX** - Users can explore and chat with AI without signing up
- **AI-powered chat interfaces** using Anthropic Claude via Replit AI Integrations
- **Role-based access** for Buyers, Suppliers, Shareholders, and Admins (after signup)
- **Government supplier list integration** for compliance verification
- **D2C transparency features** including national assayer verification and BRINKS shipping tracking
- **Full traceability** from source to delivery

**Key Routes:**
- `/` - Homepage with AI chat interface (guest accessible)
- Role-specific features available after authentication

**ECE Security:**
- Guest users have limited AI chat access (10 messages per minute)
- Self-registration available for buyer, supplier, and shareholder roles
- Admin accounts can only be created by existing admins via `/api/ece/admin/create-user`
- Session-based authentication with token verification

## Legacy: Multi-Agent Business Platform
This platform is a sophisticated multi-agent system designed to simulate a real company environment. It enables AI agents to autonomously collaborate, communicate, and execute tasks within a hierarchical organizational structure. The system facilitates agent meetings, task management, and various communication channels, emphasizing autonomous behavior with minimal human intervention. A core focus is on tracking costs and performance metrics, aiming to create a self-regulating, efficient AI-driven organization. The project envisions a future where AI agents manage complex business operations, driving market potential through advanced automation and strategic decision-making. Key capabilities include an Expert Clone marketplace for scaling expertise and a comprehensive payment gateway.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend is built with React and TypeScript, utilizing Vite, TailwindCSS, shadcn/ui, Radix UI, Wouter, and TanStack Query. **The AI Team page is now the homepage** (route "/") featuring a ChatGPT-like conversation-first interface.

**Navigation Structure:**
```
[LOGO]  [Company Badge]  Team | Agents | Company | [Marketplace] [User Avatar]
```

**Menu Details:**
- **Team:** Meetings (/ai-team), Goals, Tasks
- **Agents:** Agent List, Hierarchy, Actions, Expert Clones
- **Company:** Manage (company settings), Finance (dashboard), Knowledge (library)
- **User Avatar:** User profile, Settings, Logout

**Key Design Principles:**
- Finance and Knowledge are company-scoped, so they live under Company menu
- Goals & Tasks system tracks company objectives with agent assignments
- Chairman's Assistant chat dock remains persistent across all pages
- Meetings auto-create tasks from action items discussed

### Technical Implementations
**Frontend:** React, TypeScript, Vite, TailwindCSS, shadcn/ui, Radix UI, Wouter, TanStack Query, Socket.io client for real-time communication.
**Backend:** Express.js, Node.js, TypeScript, Drizzle ORM for PostgreSQL, Socket.io for WebSockets. RESTful APIs manage core entities.
**AI Agent Communication:** Agent responses are generated using a provider-agnostic approach, primarily OpenAI (GPT-4) with Anthropic (Claude) as a fallback. Multi-agent communication transforms chats into "meetings" moderated by a Meeting Coordinator Agent.
**Autonomous Background Conversations:** An engine facilitates autonomous agent-to-agent communication every 5 minutes, adhering to hierarchical routing and specific conversation patterns.
**AI-Managed Voice Conversations:** The Chairman's Assistant adapts responses for voice interactions (2-4 sentences, conversational language), integrates deep reasoning for complex requests, and uses OpenAI TTS ('nova' voice) for real-time audio delivery via WebSockets.
**Expert Clone Platform:** Includes an Expert Clone marketplace with 8 database tables (`expert_profiles`, `clone_training_materials`, `clone_core_identity`, `client_memory_vaults`, `clone_performance_metrics`, `clone_hires`, `clone_revenue_transactions`, `clone_ratings`) and 8 API endpoints for profile management, browsing, and hiring. Features a 3-layer memory architecture.
**Unified Expert Clones Hub (Phase 1-2 Complete):** Company-centric multi-tenancy system with production-ready backend API, frontend company selection, and comprehensive diagnostics. **Phase 1-3 (API Endpoints):** 18 RESTful endpoints across 4 resource types with comprehensive security: Clone Profiles (5 endpoints: list, get, create, update, delete), Company Clone Assignments (7 endpoints: list, create, update, activate, pause, terminate, delete), Knowledge Layers (4 endpoints: list, create, update, delete), Agent Diagnostics (2 endpoints: company-level, assignment-level). All assignment mutations enforce multi-tenant isolation with numeric companyId validation and 403 Forbidden responses for cross-company access attempts. Status changes (activate/pause/terminate) use state machine validation to prevent invalid transitions. **Phase 1-4 (Frontend Context):** CompanyProvider integrates TanStack Query for centralized company data fetching, auto-selects default company on first load, validates persisted company IDs against current data (resets to default if stale/invalid), and persists selection via localStorage. CompanySelector component uses context data (no duplicate queries), shows loading states, gracefully handles 0/1/N companies with responsive design, and is integrated in Navigation (mobile sidebar and desktop header). **Phase 2 (Service Layer & Diagnostics):** AssignmentService handles cost calculations with .toFixed(2) precision, duplicate checking, and automatic diagnostics initialization. KnowledgeService manages 3-layer knowledge hierarchy (Global/Company/Agent) with proper scope validation. Diagnostics endpoints use JOIN-based queries (agentDiagnostics → assignments → cloneProfiles) to guarantee complete metadata in topPerformers, filtering legacy null profiles and inactive assignments. ExpertClonesHubPage features Discover/My Assignments tabs with ExpertCloneDiagnostics component displaying company metrics and individual assignment performance. **Schema:** 4 tables (`clone_profiles` with 35+ fields including displayName, title, category, primaryExpertise, trainingStatus, visibility, pricing; `company_clone_assignments` with company-scoped roles, hierarchy, status, costs; `knowledge_layers` with 3-layer scope system and CHECK constraints; `agent_diagnostics` with per-company metrics). **Validation:** Comprehensive Zod schemas validate all inputs with detailed error messages. **Migration:** Repeatable SQL migration (002_unified_expert_clones_schema.sql) ensures tables exist on deploy. Coexists with legacy schemas for gradual migration.
**Payment Gateway:** Includes a Gold Conversion Service and supports shareable payment links/QR codes with over 25 API endpoints for a complete payment infrastructure.
**Knowledge Base System:** Renamed from "Memory," it's a shared document repository with tabs for Documents, Spaces/Collections, and Sources. Supports file uploads, note creation, URL imports, and AI-generated documents.
**Actions System:** Enhanced with comprehensive testing functionality (Test Action, Run as, Dynamic input fields, Dry Run, Test Live) and agent-specific permission management (Not Allowed, Allowed, Needs Approval).

### System Design Choices
**Provider Abstraction:** AI provider logic is abstracted for seamless switching and fallback.
**Cost-First Design:** All LLM interactions meticulously track token usage and costs for budget enforcement.
**Event-Driven Communication:** Socket.io facilitates real-time agent interactions.
**Meeting Intelligence:** Chats transform into structured meetings with AI-driven coordination.
**Task Automation:** Distinction between API-driven and automated tasks optimizes token consumption.
**Flexible Hierarchy:** Dynamic drag-and-drop agent organization allows adaptive structural evolution.
**Memory and Context Management:** Agents maintain compressed conversation history and self-created memories for context optimization.
**Autonomous Background Conversations:** Agents communicate without human intervention, maintaining organizational hierarchy.
**Omniscient Chairman's Assistant:** Provides comprehensive platform awareness through multi-source context gathering including: all companies with agents grouped by department, background conversation activity, upcoming/active meetings, task status breakdown, AI cost tracking with top spenders, knowledge base documents, and available actions. Context is gathered with granular error handling to ensure partial data availability even if some sources fail.
**Data Storage:** PostgreSQL database with Drizzle ORM and Neon serverless driver. Schema supports multi-tenancy, hierarchical agents, dynamic communication, detailed task management, financial tracking, and performance metrics. Phase 1 of Expert Clones Hub refactoring adds company-first multi-tenancy with coexisting legacy and unified schemas, enabling gradual migration while maintaining backward compatibility.
**Authentication/Authorization:** Operates with a "Chairman of the Board" concept; agent-level permissions are managed via metadata.

## External Dependencies

**AI Services:**
- **OpenAI API:** Primary LLM provider (GPT-4, GPT-3.5-turbo).
- **Anthropic Claude API:** Fallback LLM provider (Claude 3.5 Sonnet, Opus).

**Development Tools:**
- Drizzle Kit (database migrations)
- ESBuild (production builds)
- PostCSS with Autoprefixer (CSS processing)

**Third-Party Integrations (Prepared for):**
- Slack Web API
- Google Cloud services (for authentication)
- Calendar and email systems