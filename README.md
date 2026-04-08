[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-compatible-green?logo=anthropic)](https://modelcontextprotocol.io/)
[![Built with Claude Code](https://img.shields.io/badge/Built%20with-Claude%20Code-blueviolet?logo=anthropic)](https://claude.ai/code)

# Anaplan MCP
### Unofficial MCP server for Anaplan

A [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that connects AI assistants to Anaplan's Integration API v2. Gives LLMs like Claude direct access to browse workspaces, manage data, run imports/exports, and administer models through 70 structured tools, using your existing Anaplan credentials and permissions.

Built in TypeScript. Supports both stdio (local) and Streamable HTTP (remote) transports. Works with Claude Desktop, Claude Code, claude.ai, and any MCP-compatible client. Includes a built-in orchestration guide that teaches the AI assistant the correct tool sequences for every workflow.

## Why This Exists

**Anaplan's Integration API is powerful but requires technical expertise to use directly.** Most teams rely on a handful of model builders to navigate complex models, extract data, and run imports - creating bottlenecks when others need access to the same information.

This server wraps the API in 70 structured tools that AI assistants like Claude can call on your behalf. Explore models, pull data, run actions, and onboard new team members - all by asking in plain English instead of writing API calls or waiting for someone who knows the model.

**For business users:** Stop waiting for someone to pull data or explain how a model works. Ask Claude to show you the numbers, walk you through module structure, or run your regular imports.

**For model builders and consultants:** Analyze model structure, trace formula dependencies, review line item configurations, and identify performance issues - all through conversation instead of clicking through hundreds of modules manually.

**For IT and platform teams:** Standard API access using your existing authentication and permissions. No new credentials, no elevated access. Open source for auditability. Anaplan data is processed by your AI assistant - locally or through your provider's environment depending on your setup.

## Common Use Cases

**Model Documentation:**
- "Show me the structure of the Supply Planning model"
- "List all line items and their formulas in the Revenue module"
- "What dimensions does the Margin line item use?"

**Data Review:**
- "Pull the current pricing data for all products"
- "Show me which list items were recently added"
- "Read the forecast numbers for Q3 and summarize"

**Impact Analysis:**
- "What modules use the Product list as a dimension?"
- "Show all line items that reference Cost Per Unit"
- "Which views include the Region dimension?"

**Automation:**
- "Run the monthly demand import and show me the result"
- "Export sales actuals and save to Downloads"
- "Add these 50 new products to the master list"

**Onboarding:**
- "Walk me through the modules in this model"
- "How is this model structured? What are the key lists?"
- "What changed in this model since last quarter?"

## What It Can and Can't Do

### What it can do
- Browse workspaces, models, modules, lists, and views
- Read cell data and list items
- Write cell values and manage list items (add, update, delete)
- Run imports, exports, processes, and delete actions
- Upload and download files
- Manage models (open, close, delete, set periods and fiscal year)
- Query users, versions, and task history

### Model Building Limitations
The Anaplan API does not support:
- Creating modules or line items programmatically
- Defining formulas through API
- Building model structure from scratch
- Configuring model calendar programmatically

For model building, use Anaplan's UI or Agent Studio.

## Prerequisites

- **Node.js 18+** - [download here](https://nodejs.org/)
- **An Anaplan account** with API access (any auth method - basic, certificate, or OAuth)
- **An MCP-compatible client** - Claude Desktop (recommended), Claude Code, or any other MCP client

## Setup

### 1. Clone and build

```bash
git clone https://github.com/larasrinath/anaplan-mcp.git
cd anaplan-mcp
npm install
npm run build
```

### 2. Connect to Claude Desktop

Claude Desktop is the easiest way to use this server. Here's how to set it up:

**Step 1: Open the config file**

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `C:\Users\<YourUsername>\AppData\Roaming\Claude\claude_desktop_config.json`

If the file doesn't exist yet, create it with `{}` as the contents.

> **Tip (Windows):** You can type `%APPDATA%\Claude` in the File Explorer address bar to jump straight to the folder.

**Step 2: Add the Anaplan server**

Replace `<path>` with the absolute path to your cloned repo (e.g. `/Users/you/anaplan-mcp` on macOS/Linux or `C:/Users/you/anaplan-mcp` on Windows - always use forward slashes).

**Basic auth:**

```json
{
  "mcpServers": {
    "anaplan": {
      "command": "node",
      "args": ["<path>/dist/index.js"],
      "env": {
        "ANAPLAN_USERNAME": "user@company.com",
        "ANAPLAN_PASSWORD": "your-password"
      }
    }
  }
}
```

For other auth methods, use the same structure with a different `env` block:

**Certificate auth:**
```json
"env": {
  "ANAPLAN_CERTIFICATE_PATH": "/path/to/cert.pem",
  "ANAPLAN_PRIVATE_KEY_PATH": "/path/to/key.pem"
}
```
`ANAPLAN_CERTIFICATE_ENCODED_DATA_FORMAT` can be added optionally; defaults to `v2`. Set `v1` only for legacy tenants.

**OAuth2 (device grant):**

```json
"env": {
  "ANAPLAN_CLIENT_ID": "your-client-id"
}
```

On first use, Claude shows a link in chat — click it, approve in Anaplan, then retry your request. OAuth tokens are kept in memory only. If the MCP process restarts, or an OAuth session is idle for more than 60 minutes, you'll be prompted to authorize again unless you provide `ANAPLAN_REFRESH_TOKEN` yourself.

OAuth support is device grant only. `ANAPLAN_CLIENT_SECRET`, `ANAPLAN_OAUTH_AUTHORIZATION_CODE`, and `ANAPLAN_OAUTH_REDIRECT_URI` are ignored by the server.

If your config file already has content, add `mcpServers` inside the existing top-level object - don't create a second `{}` block.

**Step 3: Restart Claude Desktop**

Quit Claude Desktop completely (right-click the system tray icon and quit - don't just close the window) and reopen it. You should see the Anaplan tools available (look for the hammer icon in the chat input area).

**Troubleshooting:**

- **"Unexpected non-whitespace" error** - Your JSON is invalid. Make sure there's only one `{}` object in the file and no trailing commas. Paste your config into [jsonlint.com](https://jsonlint.com/) to check.
- **Server disconnected** - Run `node C:/path/to/anaplan-mcp/dist/index.js` in a terminal to see the actual error. Common causes: wrong path in `args`, missing `npm run build`, or Node.js not installed.
- **401 Unauthorized when using tools** - Your Anaplan credentials are wrong, or your account uses SSO (in which case basic auth won't work - use certificate or OAuth2 instead).
- **OAuth refresh failed / reauthorization required** - The MCP server is up and reached Anaplan, but the saved OAuth session is no longer valid. Re-authorize in your MCP client, then retry the tool.

### Connect to Claude Code

Copy `.mcp.json.example` to `.mcp.json` and fill in your credentials. The file is gitignored by default - never commit credentials to version control.

```bash
cp .mcp.json.example .mcp.json
```

Alternatively, use the CLI:

```bash
claude mcp add anaplan -- node /absolute/path/to/anaplan-mcp/dist/index.js
```

### Other MCP clients

Any MCP-compatible client that supports stdio transport can connect. The server expects to be launched as a subprocess with stdin/stdout for communication. Pass Anaplan credentials via environment variables.

### Browser-based AI (claude.ai, ChatGPT)

The server also supports **Streamable HTTP transport** for remote MCP connections from [claude.ai](https://claude.ai), [ChatGPT](https://chatgpt.com), and other browser-based AI assistants. Deploy to a cloud platform (Fly.io recommended) and connect via the remote MCP integration settings.

Remote HTTP mode is designed for **per-session Anaplan OAuth**, not a single shared Anaplan user. Set `ANAPLAN_CLIENT_ID` on the server so each remote session can authorize against Anaplan with its own identity. If you want an extra outer gate in front of the endpoint, you can also set `ANAPLAN_MCP_HTTP_AUTH_TOKEN` and have your client or reverse proxy send it as `Authorization: Bearer <token>`.

See the **[Remote Deployment Guide](docs/guides/deploying-remote.md)** for full setup instructions, platform recommendations, and troubleshooting.

## Configuration

### Environment variables

All configuration is done through environment variables. There are no config files, CLI flags, or settings menus.

| Method | Env Vars | Description |
|--------|----------|-------------|
| Certificate | `ANAPLAN_CERTIFICATE_PATH`, `ANAPLAN_PRIVATE_KEY_PATH`, `ANAPLAN_CERTIFICATE_ENCODED_DATA_FORMAT` (optional) | Highest priority. PEM certificate + private key, authenticates via CACertificate flow. Data format defaults to `v2` |
| OAuth2 (device grant) | `ANAPLAN_CLIENT_ID` | Device authorization flow. Claude shows you the URL and code in chat; authorize in browser then retry. Tokens stay in memory only, so restart or >60 minutes of idle time requires another device login unless you set `ANAPLAN_REFRESH_TOKEN` manually |
| Basic | `ANAPLAN_USERNAME`, `ANAPLAN_PASSWORD` | Lowest priority. Email + password, sends base64 credentials to auth endpoint |

You only need one set of credentials. If multiple are configured, the server picks the highest-priority method automatically.

### HTTP transport security

These apply only to `npm run start:http` / remote MCP deployments:

| Variable | Description |
|----------|-------------|
| `ANAPLAN_CLIENT_ID` | Required for remote HTTP mode. Each HTTP session uses this OAuth client to authenticate the end user with Anaplan |
| `ANAPLAN_MCP_HTTP_AUTH_TOKEN` | Optional extra edge protection. When set, callers must also send it as `Authorization: Bearer <token>`. `MCP_HTTP_AUTH_TOKEN` is accepted as an alias |
| `ANAPLAN_MCP_HTTP_BODY_LIMIT` | Optional JSON body limit for remote HTTP requests. Defaults to `100mb` to support large `run_import` and `upload_file` payloads. `MCP_HTTP_BODY_LIMIT` is accepted as an alias |

### Where to set environment variables

- **Claude Code config:** Use the `"env"` block in `.mcp.json` (file is gitignored by default)
- **Claude Desktop config:** Use the `"env"` block in the JSON config (keeps credentials scoped to the server)
- **Shell profile:** Export in `.bashrc` / `.zshrc` for Claude Code CLI usage
- **System environment:** Set at the OS level if you prefer

> **Security note:** Never commit credentials to version control. Env files and MCP config files are gitignored by default in this repo.

## Permissions and Safety

### What the server can do

This server has **full access** to whatever your Anaplan credentials allow. The 70 tools cover both read and write operations:

- **Read-only tools** (safe to use freely): `show_*` tools, `read_cells`, `get_list_items`, `download_file`, `get_action_status`
- **Write tools** (modify data): `write_cells`, `add_list_items`, `update_list_items`, `delete_list_items`
- **Action tools** (trigger Anaplan processes): `run_import`, `run_export`, `run_process`, `run_delete`
- **Admin tools** (model management): `close_model`, `open_model`, `bulk_delete_models`, `set_currentperiod`, `set_fiscalyear`

### Tool approval in Claude Desktop

Claude Desktop prompts you before each tool call. You'll see the tool name and parameters, and can approve or deny. This gives you a chance to review before any action runs. You can also use the "Allow for this chat" option for tools you trust.

### Recommendations

- **Start with read-only.** Ask Claude to explore your workspaces and models before running any write operations. Get comfortable with the tool output first.
- **Test in a dev workspace.** If you have a non-production Anaplan workspace, use that while getting familiar with the tools.
- **Use least-privilege credentials.** If your Anaplan admin can create a service account with limited workspace access, use that instead of your personal admin account.
- **Review before confirming write operations.** When Claude proposes to run an import, write cells, or delete items, read the parameters carefully before approving.
- **Exports and imports are asynchronous.** The server polls until they complete (up to 5 minutes). You can cancel a running task with `cancel_task` if needed.

## Tools

### Model Exploration (37 tools)

| Tool | Description |
|------|-------------|
| `show_workspaces` | List all accessible workspaces<br>`GET /workspaces` |
| `show_workspacedetails` | Get workspace details (size and active status)<br>`GET /workspaces/{workspaceId}` |
| `show_models` | List models in a workspace. Optional `state` filter: UNLOCKED, PRODUCTION, ARCHIVED, LOCKED, MAINTENANCE, PRODUCTION_MAINTENANCE<br>`GET /workspaces/{workspaceId}/models` |
| `show_allmodels` | List all models across all workspaces. Optional `state` filter: UNLOCKED, PRODUCTION, ARCHIVED, LOCKED, MAINTENANCE, PRODUCTION_MAINTENANCE<br>`GET /models` |
| `show_modeldetails` | Get model details including state and workspace<br>`GET /models/{modelId}` |
| `show_modelstatus` | Check model status (legacy endpoint, often returns 405)<br>`POST /workspaces/{workspaceId}/models/{modelId}/status` |
| `show_modules` | List modules in a model<br>`GET /workspaces/{workspaceId}/models/{modelId}/modules` |
| `show_moduledetails` | Get module details by filtering module list<br>`GET /workspaces/{workspaceId}/models/{modelId}/modules` |
| `show_lineitems` | List line items in a module (`includeAll` supported)<br>`GET /models/{modelId}/modules/{moduleId}/lineItems` |
| `show_alllineitems` | List all line items in a model (`includeAll` supported)<br>`GET /models/{modelId}/lineItems` |
| `show_lineitem_dimensions` | List dimensions for a line item<br>`GET /models/{modelId}/lineItems/{lineItemId}/dimensions` |
| `show_lineitem_dimensions_items` | List dimension items for a line item/dimension pair<br>`GET /models/{modelId}/lineItems/{lineItemId}/dimensions/{dimensionId}/items` |
| `show_savedviews` | List saved and default views in a module<br>`GET /workspaces/{workspaceId}/models/{modelId}/modules/{moduleId}/views` |
| `show_allviews` | List all views in a model (cross-module)<br>`GET /models/{modelId}/views` |
| `show_viewdetails` | Get view axis metadata (rows, columns, pages)<br>`GET /models/{modelId}/views/{viewId}` |
| `show_lists` | List lists (dimensions) in a model<br>`GET /workspaces/{workspaceId}/models/{modelId}/lists` |
| `get_list_items` | Get items from a list<br>`GET /workspaces/{workspaceId}/models/{modelId}/lists/{listId}/items` |
| `show_listmetadata` | Get list metadata including parent/properties/count<br>`GET /workspaces/{workspaceId}/models/{modelId}/lists/{listId}` |
| `show_dimensionitems` | List all items in a model-level dimension<br>`GET /models/{modelId}/dimensions/{dimensionId}/items` |
| `show_viewdimensionitems` | List selected dimension items for a view<br>`GET /models/{modelId}/views/{viewId}/dimensions/{dimensionId}/items` |
| `lookup_dimensionitems` | Resolve dimension items by names/codes<br>`POST /workspaces/{workspaceId}/models/{modelId}/dimensions/{dimensionId}/items` |
| `show_imports` | List import actions in a model<br>`GET /workspaces/{workspaceId}/models/{modelId}/imports` |
| `show_importdetails` | Get import metadata<br>`GET /workspaces/{workspaceId}/models/{modelId}/imports/{importId}` |
| `show_exports` | List export actions in a model<br>`GET /workspaces/{workspaceId}/models/{modelId}/exports` |
| `show_exportdetails` | Get export metadata<br>`GET /workspaces/{workspaceId}/models/{modelId}/exports/{exportId}` |
| `show_processes` | List process actions in a model<br>`GET /workspaces/{workspaceId}/models/{modelId}/processes` |
| `show_processdetails` | Get process metadata<br>`GET /workspaces/{workspaceId}/models/{modelId}/processes/{processId}` |
| `show_files` | List files in a model<br>`GET /workspaces/{workspaceId}/models/{modelId}/files` |
| `show_actions` | List model actions (including deletes)<br>`GET /workspaces/{workspaceId}/models/{modelId}/actions` |
| `show_actiondetails` | Get action metadata<br>`GET /workspaces/{workspaceId}/models/{modelId}/actions/{actionId}` |
| `show_currentperiod` | Get current period<br>`GET /workspaces/{workspaceId}/models/{modelId}/currentPeriod` |
| `show_modelcalendar` | Get fiscal year/calendar settings<br>`GET /workspaces/{workspaceId}/models/{modelId}/modelCalendar` |
| `show_versions` | List version metadata<br>`GET /models/{modelId}/versions` |
| `show_currentuser` | Get current authenticated user<br>`GET /users/me` |
| `show_users` | List users in tenant scope<br>`GET /users` |
| `show_userdetails` | Get user details by ID<br>`GET /users/{userId}` |
| `show_tasks` | List task history for imports/exports/processes/actions<br>`GET /workspaces/{workspaceId}/models/{modelId}/{actionType}/{actionId}/tasks` |

### Bulk Data Operations (28 tools)

| Tool | Description |
|------|-------------|
| `run_export` | Run export task, download output, optionally save locally with `saveToDownloads` and `fileName`<br>`POST .../exports/{exportId}/tasks` |
| `run_import` | Upload file chunks, run import, and poll task completion<br>`POST .../imports/{importId}/tasks` |
| `run_process` | Run process task and poll completion<br>`POST .../processes/{processId}/tasks` |
| `run_delete` | Run delete action task<br>`POST .../actions/{deleteActionId}/tasks` |
| `upload_file` | Initialize chunked upload, upload chunks, and complete file upload<br>`POST .../files/{fileId}` |
| `download_file` | Download file by reading all chunk payloads. Text returns inline; binary files should use `saveToDownloads`<br>`GET .../files/{fileId}/chunks` |
| `delete_file` | Delete model file (irreversible)<br>`DELETE .../files/{fileId}` |
| `get_action_status` | Get status for import/export/process/action task<br>`GET .../{actionType}/{actionId}/tasks/{taskId}` |
| `close_model` | Close (archive) a model<br>`POST .../models/{modelId}/close` |
| `open_model` | Open (wake up) a closed model<br>`POST .../models/{modelId}/open` |
| `bulk_delete_models` | Delete multiple closed models<br>`POST /workspaces/{workspaceId}/bulkDeleteModels` |
| `set_currentperiod` | Set current period<br>`PUT .../models/{modelId}/currentPeriod` |
| `set_fiscalyear` | Update model fiscal year<br>`PUT .../models/{modelId}/modelCalendar/fiscalYear` |
| `set_versionswitchover` | Set version switchover date<br>`PUT /models/{modelId}/versions/{versionId}/switchover` |
| `download_importdump` | Download failed import dump chunks (CSV)<br>`GET .../imports/{importId}/tasks/{taskId}/dump/chunks` |
| `download_processdump` | Download failed process dump chunks (CSV)<br>`GET .../processes/{processId}/tasks/{taskId}/dumps/{objectId}/chunks` |
| `cancel_task` | Cancel running import/export/process/action task<br>`DELETE .../{actionType}/{actionId}/tasks/{taskId}` |
| `create_view_readrequest` | Create large-volume view read request<br>`POST .../views/{viewId}/readRequests` |
| `get_view_readrequest` | Get large-volume view read request status<br>`GET .../views/{viewId}/readRequests/{requestId}` |
| `get_view_readrequest_page` | Download a CSV page from view read request<br>`GET .../views/{viewId}/readRequests/{requestId}/pages/{pageNo}` |
| `delete_view_readrequest` | Delete large-volume view read request<br>`DELETE .../views/{viewId}/readRequests/{requestId}` |
| `preview_list` | Preview up to 1000 records from a large list (CSV) before a full large read request<br>`GET .../lists/{listId}/readRequests/preview` |
| `create_list_readrequest` | Create large-volume list read request<br>`POST .../lists/{listId}/readRequests` |
| `get_list_readrequest` | Get large-volume list read request status<br>`GET .../lists/{listId}/readRequests/{requestId}` |
| `get_list_readrequest_page` | Download a CSV page from list read request<br>`GET .../lists/{listId}/readRequests/{requestId}/pages/{pageNo}` |
| `delete_list_readrequest` | Delete large-volume list read request<br>`DELETE .../lists/{listId}/readRequests/{requestId}` |
| `reset_list_index` | Reset list item index numbering<br>`POST /models/{modelId}/lists/{listId}/resetIndex` |
| `download_optimizer_log` | Download Optimizer solver log for a completed action<br>`GET .../optimizeActions/{actionId}/tasks/{correlationId}/solutionLogs` |

### Transactional Operations (5 tools)

| Tool | Description |
|------|-------------|
| `read_cells` | Read cell data from a module view<br>`GET /models/{modelId}/views/{viewId}/data?format=v1` |
| `write_cells` | Write values to specific module cells<br>`POST /models/{modelId}/modules/{moduleId}/data` |
| `add_list_items` | Add new items to a list<br>`POST .../lists/{listId}/items?action=add` |
| `update_list_items` | Update existing list items<br>`PUT .../lists/{listId}/items` |
| `delete_list_items` | Delete list items<br>`POST .../lists/{listId}/items?action=delete` |

## Orchestration Guide

The server exposes a built-in MCP resource (`anaplan://orchestration-guide`) that AI assistants read automatically. This guide teaches the correct tool sequences for every workflow category:

- **Navigation** -- workspace -> model -> module -> line items/views
- **Reading data** -- discover modules, find views, read cells (with fallback to large volume reads for >1M cells)
- **Writing data** -- resolve line item dimensions and item IDs before calling write_cells
- **Bulk imports** -- inspect import definition, upload data to source file, run import, check status, download error dump if failed
- **Bulk exports** -- single-step run_export handles the full lifecycle
- **Processes** -- run chained actions, monitor with get_action_status
- **Large volume reads** -- create request, poll until complete, download pages, clean up
- **List mutations** -- find list items, then add/update/delete

Every tool description also includes prerequisite hints ("Use show_imports first to find importId") and parameter descriptions explain where each value comes from ("from show_lineitems or show_alllineitems"). Key workflow tools append "Next steps" guidance to their responses.

## Architecture

```
src/
  auth/       # Authentication providers (basic, certificate, oauth) + token manager
  api/        # HTTP client with retry logic + 17 domain-specific API wrappers
  tools/      # MCP tool registrations (exploration, bulk, transactional) + response hints
  resources/  # MCP resource content (orchestration guide)
  server.ts   # Wires auth > client > APIs > MCP server + registers resources
  index.ts    # Entry point (stdio transport)
  http.ts     # Entry point (Streamable HTTP transport)

docs/
  api/        # Anaplan API reference docs (Integration, ALM, SCIM, CloudWorks, Audit)
  architecture/ # Runtime diagrams (request flow, trust boundary, subsystem map)
  guides/     # Tool selection and workflow guides

examples/     # Example output - FY26 Sales Forecast deck generated via MCP
```

Three layers:

1. **Auth layer** - pluggable providers behind a common `AuthProvider` interface. The `AuthManager` selects the right provider from env vars and handles token lifecycle.
2. **API layer** - `AnaplanClient` handles all HTTP communication with the Anaplan API. 17 domain wrappers provide typed methods for each endpoint. Auto-paginates list endpoints using Anaplan's `meta.paging` metadata.
3. **Tools layer** - registers MCP tools on the server with zod schemas for input validation. Each tool delegates to the appropriate API wrapper and formats results. Key tools include next-step hints to guide multi-tool workflows.

For detailed runtime diagrams (request flow, trust boundary, subsystem map) see [docs/architecture/overview.md](docs/architecture/overview.md).

## Custom Skills

The `skills/` folder holds Claude Code project-level skills - reusable instruction sets that the AI assistant loads automatically during your session.

A template is provided at [`skills/example.md`](skills/example.md). Copy it, rename it, and fill in your instructions. Claude Code will pick it up as a skill available in this project.

Skills are gitignored by default (personal workflows vary), with only the example tracked. Add your own without worrying about committing them.

## Disclaimers

Unofficial personal project - not affiliated with, endorsed by, or supported by Anaplan. Uses the official [Anaplan Integration API v2](https://anaplan.docs.apiary.io/) - no undocumented endpoints. Users are responsible for compliance with [Anaplan's Terms of Service](https://www.anaplan.com/terms/). No warranty provided; use at your own risk.

## License

MIT - see [LICENSE](LICENSE) file for details. Covers the code in this repository only. Anaplan's API and service are subject to Anaplan's Terms of Service and Acceptable Use Policy.
