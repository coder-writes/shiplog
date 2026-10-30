# ShipLog 🚀

> **Turn your commits, meetings, and daily notes into polished standup updates, weekly reports, and performance brag documents.**

ShipLog is a developer-first worklog application designed to capture your engineering output automatically. It synchronizes your GitHub commits and pull requests, connects to Google Calendar for daily meetings, extracts structured work items using AI, and compiles grounded standups and weekly reports ready to share or email.

---

## ✨ Features

- **📝 Daily Worklog & Note Taking**: Clean, distraction-free markdown note-taking with voice dictation support, local date grouping, and autosave.
- **🐙 GitHub Activity Sync**: Synchronizes 7 types of GitHub activity (commits, pull requests opened/merged, reviews, issue comments, and PR comments) with automatic deduplication.
- **📅 Google Calendar Integration**: Connects via OAuth2 to pull your daily meetings into your worklog and standup reports (read-only, private per user).
- **🤖 Grounded AI Work Items**: Uses Google Gemini (`gemini-3.5-flash-lite`) to turn raw notes and git commits into categorized work items (*Shipped*, *Fixed*, *Learned*, *Helped*, *Reviewed*, *In Progress*, *Planned*) with impact metrics.
- **📊 Reports & Summaries**:
  - **Daily Standup**: Yesterday's achievements, today's plan, meetings, and blockers.
  - **Weekly Summary**: Narrative overview of your engineering impact.
  - **Brag Document**: Appraisal-ready career document highlighting key accomplishments.
- **🔗 Secure Share Links**: Generate HMAC-signed, expiring, public read-only links (`/share/$token`) to share reports with managers or peers without requiring an account.
- **📬 Automated Weekly Email**: Delivers formatted weekly summaries directly to your inbox via Resend.
- **📈 Insights Dashboard**: Visualizes your contribution heatmap, category distribution over time, code-to-review ratio, busiest repositories, and shipping streaks.

---

## 🛠️ Tech Stack

- **Framework**: [TanStack Start](https://tanstack.com/start) (Fullstack React 19 + SSR + Vite)
- **Routing**: [TanStack Router](https://tanstack.com/router)
- **Data Fetching**: [TanStack Query](https://tanstack.com/query)
- **Database & Auth**: [Supabase](https://supabase.com) (PostgreSQL with Row Level Security)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com), [Radix UI](https://www.radix-ui.com/), [Lucide Icons](https://lucide.dev)
- **AI Engine**: [Google Gemini](https://ai.google.dev) (`gemini-3.5-flash-lite` via Vercel AI SDK)
- **Email Delivery**: [Resend](https://resend.com)
- **Security**: AES-256-GCM token encryption, HMAC token signing

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm** or **bun**
- A **Supabase** account (Free tier)
- A **Google AI Studio** API key (Free)

### 1. Installation

Clone or navigate into the project directory and install dependencies:

```bash
cd commit-story-worklog
npm install
```

### 2. Database Setup

1. Create a project at [supabase.com](https://supabase.com).
2. Go to your **Supabase Dashboard** → **SQL Editor** → **New Query**.
3. Open [`supabase/schema.sql`](./supabase/schema.sql) in this repository, copy its entire contents, paste it into the SQL editor, and click **Run**.
   - This creates all necessary tables (`profiles`, `daily_entries`, `github_activity`, `items`, `reports`, `report_shares`, `app_user_connections`), triggers, and Row Level Security (RLS) policies.

### 3. Environment Configuration

Create a `.env` file in the root directory (or edit the existing one) with the following variables:

```env
# ─── Supabase ──────────────────────────────────────────────────────────────────
SUPABASE_PROJECT_ID="your_supabase_project_ref"
SUPABASE_URL="https://your_supabase_project_ref.supabase.co"
VITE_SUPABASE_PROJECT_ID="your_supabase_project_ref"
VITE_SUPABASE_URL="https://your_supabase_project_ref.supabase.co"

# Service role key (used for server functions & sync)
SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"

# Anon key (used for client-side queries & authentication)
SUPABASE_PUBLISHABLE_KEY="your_anon_key"
VITE_SUPABASE_PUBLISHABLE_KEY="your_anon_key"

# ─── Encryption & Security Keys ────────────────────────────────────────────────
# 32-byte base64 strings (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
GITHUB_TOKEN_ENCRYPTION_KEY="your_32_byte_base64_encryption_key"
SHARE_LINK_SIGNING_KEY="your_32_byte_base64_signing_key"
APP_USER_CONNECTION_KEY_SECRET="your_32_byte_base64_secret"
CRON_SECRET="your_secure_cron_secret"

# ─── AI Configuration ──────────────────────────────────────────────────────────
# Get a free key from https://aistudio.google.com/app/apikey
GEMINI_API_KEY="your_gemini_api_key"
GEMINI_MODEL="gemini-3.5-flash-lite"

# ─── Weekly Report Email (Resend) ──────────────────────────────────────────────
# Get an API key from https://resend.com
RESEND_API_KEY="your_resend_api_key"
RESEND_FROM_EMAIL="onboarding@resend.dev"
# For testing with onboarding@resend.dev, set your registered Resend email:
RESEND_TEST_RECIPIENT_EMAIL="your_email@gmail.com"

# ─── Google Calendar (Optional) ────────────────────────────────────────────────
# From Google Cloud Console OAuth 2.0 Credentials
GOOGLE_CLIENT_ID="your_google_client_id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your_google_client_secret"
```

### 4. Run the Development Server

Start the local development server:

```bash
npm run dev
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

---

## 📖 Application Workflow

1. **Sign Up / Log In**: Create an account with your email.
2. **Log Your Day**:
   - On the **Log** tab, write your daily achievements or paste raw thoughts.
   - Click **Save note**, then click **Generate items with AI**.
   - Review each item and click the **✓ Approve** checkmark.
3. **Connect GitHub (Optional)**:
   - Go to **Settings** → **GitHub**.
   - Create a GitHub Fine-Grained Personal Access Token with read permissions for *Metadata*, *Contents*, *Issues*, and *Pull Requests*.
   - Paste your token to automatically pull your commits and PRs into your log.
4. **Generate Reports**:
   - Go to **Reports** to generate your daily standup, weekly digest, or brag document.
   - Click **Copy for Slack**, **Download Markdown**, or **Share** to create an expiring public link.
5. **Send Weekly Report**:
   - On the **Settings** page, click **"Send last week's report now"** to receive an email summary of your approved items.

---

## 📜 Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Vite dev server at `http://localhost:8080` |
| `npm run build` | Builds the production bundle with Nitro server output |
| `npm run preview` | Previews the production build locally |
| `npm run test` | Runs unit tests using Vitest |
| `npm run lint` | Runs ESLint checks across the codebase |
| `npm run format` | Formats code with Prettier |

---

## 🔒 Security & Architecture Notes

- **Zero Client Token Exposure**: Third-party credentials (GitHub tokens, calendar keys) are never exposed to or stored in client-side code. GitHub tokens are encrypted with AES-256-GCM using `GITHUB_TOKEN_ENCRYPTION_KEY` before database storage.
- **Row Level Security (RLS)**: Every database table strictly enforces RLS policies. Users can only select, insert, and update their own data.
- **Tamper-Proof Share Links**: Report share URLs use HMAC SHA-256 tokens (`<shareId>.<exp>.<sig>`) backed by a revocation table (`report_shares`).
- **Grounded AI**: Numerical stats and metrics are strictly calculated in deterministic code (`src/lib/stats.ts`), not fabricated by language models.

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
