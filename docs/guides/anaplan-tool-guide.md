# Anaplan MCP Tool Guide

This guide maps common questions and tasks to the correct MCP tool sequences. Use it to select the right tool(s) and order of operations for any Anaplan request.

---

## Tool Inventory

### Exploration Tools (37) — read-only, safe to call any time

**Workspace & Model**

| Tool | Purpose | Required Params |
|------|---------|-----------------|
| `show_workspaces` | List workspaces visible to discovery (not a complete access inventory) | — |
| `show_workspacedetails` | Size, active status for one workspace | workspaceId |
| `show_models` | List models in a workspace | workspaceId |
| `show_allmodels` | List models visible to discovery across workspaces | — |
| `show_modeldetails` | Model metadata; read-only access checks if metadata returns 404 | workspaceId, modelId |
| `show_modelstatus` | Memory usage, current step (Open/Processing/Closed) | workspaceId, modelId |
| `show_modelcalendar` | Fiscal year start/end | workspaceId, modelId |
| `show_currentperiod` | Current period text and date | workspaceId, modelId |

**Modules, Views, Line Items**

| Tool | Purpose | Required Params |
|------|---------|-----------------|
| `show_modules` | List modules in model | workspaceId, modelId |
| `show_moduledetails` | Module + default view dimensions (rows/cols/pages) | workspaceId, modelId, moduleId |
| `show_savedviews` | Saved views in a module | workspaceId, modelId, moduleId |
| `show_allviews` | All views across entire model | modelId |
| `show_viewdetails` | Rows, columns, pages dimensions for a view | workspaceId, modelId, moduleId, viewId |
| `show_lineitems` | Line items in a module | workspaceId, modelId, moduleId |
| `show_alllineitems` | All line items across model | modelId |
| `show_lineitem_dimensions` | Dimension IDs for a line item | modelId, lineItemId |
| `show_lineitem_dimensions_items` | Items in one dimension for a line item | modelId, lineItemId, dimensionId |

**Lists & Dimensions**

| Tool | Purpose | Required Params |
|------|---------|-----------------|
| `show_lists` | All lists/dimensions in model | workspaceId, modelId |
| `show_listmetadata` | Properties, parent, item count | workspaceId, modelId, listId |
| `get_list_items` | Items in a list (up to 1M) | workspaceId, modelId, listId |
| `show_dimensionitems` | All items in a dimension (model-level, no view filter) | modelId, dimensionId |
| `show_viewdimensionitems` | Items in dimension filtered by view (respects Selective Access) | modelId, viewId, dimensionId |
| `lookup_dimensionitems` | Resolve names/codes to IDs | workspaceId, modelId, dimensionId, names/codes |

**Actions, Files, Tasks**

| Tool | Purpose | Required Params |
|------|---------|-----------------|
| `show_imports` | List import definitions | workspaceId, modelId |
| `show_importdetails` | Import source format, column headers | workspaceId, modelId, importId |
| `show_exports` | List export definitions | workspaceId, modelId |
| `show_exportdetails` | Export format, row count estimate, column count | workspaceId, modelId, exportId |
| `show_processes` | List processes | workspaceId, modelId |
| `show_processdetails` | Ordered list of actions in process | workspaceId, modelId, processId |
| `show_actions` | All actions (including delete actions) | workspaceId, modelId |
| `show_actiondetails` | Action type and metadata | workspaceId, modelId, actionId |
| `show_files` | Files available for import/export | workspaceId, modelId |
| `show_tasks` | Task history for an import/export/process/action | workspaceId, modelId, actionType, actionId |

**Users & Versions**

| Tool | Purpose | Required Params |
|------|---------|-----------------|
| `show_currentuser` | Who is authenticated | — |
| `show_users` | All users in tenant | — |
| `show_userdetails` | One user by ID | userId |
| `show_versions` | Version metadata (isCurrent, isActual, switchover dates) | modelId |

---

### Bulk Tools (28) — execute actions, mutate state

**Data Operations**

| Tool | Purpose | Notes |
|------|---------|-------|
| `run_export` | Execute export, return data inline when safe | Polls until complete. Use `saveToDownloads=true` for binary exports or to save the full file locally. |
| `run_import` | Upload data then execute import | Internally handles upload + task execution. No need to call `upload_file` separately. |
| `run_process` | Execute a process (chained actions) | Returns nestedResults per step. |
| `run_delete` | Execute a delete action | Irreversible. |
| `upload_file` | Upload CSV/text to an Anaplan file | Use standalone when preparing data for a process, or when multiple imports share a file. Not needed before `run_import`. |
| `download_file` | Download file content | Text files return inline (truncated at 50k chars). Binary files should use `saveToDownloads=true`. |
| `delete_file` | Delete a private file | Irreversible. |

**Task Management**

| Tool | Purpose | Notes |
|------|---------|-------|
| `get_action_status` | Check status of a running task | Use when monitoring a task started externally. |
| `cancel_task` | Cancel running import/export/process/action | actionType: imports/exports/processes/actions |

**Model Management**

| Tool | Purpose | Notes |
|------|---------|-------|
| `close_model` | Close/archive model | Requires workspace admin. |
| `open_model` | Wake up a closed model | May return 202 if still loading. |
| `bulk_delete_models` | Delete multiple closed models | Models must be closed first. Irreversible. |

**Calendar & Version Mutations**

| Tool | Purpose | Warning |
|------|---------|---------|
| `set_currentperiod` | Set or reset current period | May delete data in removed time periods. |
| `set_fiscalyear` | Update fiscal year | May affect time ranges. |
| `set_versionswitchover` | Set version switchover date | Affects version boundaries. |

**Error Debugging**

| Tool | Purpose | Notes |
|------|---------|-------|
| `download_importdump` | Row-level errors from failed import | Only when `failureDumpAvailable=true` in task result. |
| `download_processdump` | Row-level errors from failed process step | Requires `objectId` from nestedResults. |

**Large Volume Reads (>1M cells/items)**

| Tool | Purpose |
|------|---------|
| `create_view_readrequest` | Start async read for large view |
| `get_view_readrequest` | Poll status (COMPLETE/IN_PROGRESS/FAILED) |
| `get_view_readrequest_page` | Download one page (0-based, CSV) |
| `delete_view_readrequest` | Clean up after all pages downloaded |
| `preview_list` | Preview up to 1000 CSV rows from a large list before starting a full request |
| `create_list_readrequest` | Start async read for large list |
| `get_list_readrequest` | Poll status |
| `get_list_readrequest_page` | Download one page |
| `delete_list_readrequest` | Clean up |
| `reset_list_index` | Reset list item index numbering |

**Optimizer**

| Tool | Purpose | Notes |
|------|---------|-------|
| `download_optimizer_log` | Download the solver log for a completed optimizer action | Requires `correlationId` from the Anaplan UI. Logs expire after ~48 hours. |

---

### Transactional Tools (5) — direct cell and list writes

| Tool | Purpose | Notes |
|------|---------|-------|
| `read_cells` | Read cell data from a module view (JSON) | Max 1M cells. Requires viewId. |
| `write_cells` | Write values to specific cell coordinates | Max 100k cells. Needs lineItemId + all dimension itemIds. |
| `add_list_items` | Add new items to a list | Max 100k items per call. |
| `update_list_items` | Update existing list items | Must include `code` if item already has one. |
| `delete_list_items` | Remove items from a list | Identify by id or code, not both. |

---

## Workflow Sequences

### Discover the Model Structure

```
Q: "What workspaces/models do I have?"
→ show_workspaces
→ show_models(workspace)        # models in one workspace
→ show_allmodels                # models visible to discovery across workspaces

Q: "What's inside model X?"
→ show_modules                  # list modules
→ show_lists                    # list dimensions/lists
→ show_exports / show_imports   # available data actions
→ show_processes                # available processes
```

### Model URL Works but Discovery Omits It

Workspace/model discovery and direct model access can differ, particularly for models in another customer/tenant. A missing list entry or metadata 404 does not by itself prove denied access.

1. Extract the IDs after `/workspaces/` and `/models/` in the browser URL. Pass the IDs, not the full URL or names, to `show_modules` or `show_imports`. Explicit IDs bypass discovery.
2. Use `show_modeldetails` with the same IDs for a read-only check: after a metadata 404 it lists modules/imports and reports each outcome. Unavailable model names, state, and size are not fabricated. If both checks fail, the tool returns an error with the individual failures.
3. A successful listing only verifies that read endpoint; it does not establish permission for writes or action execution. Do not change credentials, roles, or SSO settings solely because discovery omits a model.

The browser URL's `/customers/{customerId}` segment is not an Integration API prefix or a customer-selection header.

### Read Cell Data

```
Q: "Show me data from module X"

Standard (≤ 1M cells):
1. show_modules           → get moduleId
2. [Optional] show_savedviews → pick a saved view for a specific layout
   → If no saved view needed, use moduleId as viewId (reads the default view)
3. read_cells(workspace, model, module, view)
   → Use pages param to filter by page dimensions: pages=[{dimensionId, itemId}]
   → Use maxRows to limit output size

If read_cells returns truncated data (>50K chars):
→ First try: add pages param to select "All" items for large dimensions
→ If still too large: use maxRows to limit rows
→ If still too large: use the large volume read flow below
→ NEVER iterate read_cells per list item — one large read is always better

Large (> 1M cells):
1. show_allviews          → get viewId (or use moduleId for default view)
2. create_view_readrequest(workspace, model, viewId)
   → returns requestId
3. get_view_readrequest(workspace, model, viewId, requestId)
   → poll until requestState=COMPLETE (returns page count)
4. get_view_readrequest_page(workspace, model, viewId, requestId, pageNo=0,1,2...)
   → download each page (0-based) as CSV — repeat for all pages
5. delete_view_readrequest(workspace, model, viewId, requestId)
   → ALWAYS clean up to free server resources
```

### Export Data

```
Q: "Export data from model X"

1. show_exports           → find the export action
2. [Optional] show_exportdetails → check exportFormat, headerNames, rowCount estimate
3. run_export(workspace, model, exportId)
   → Fully self-contained: executes task, polls completion, downloads all chunks, returns data
   → Returns data inline (truncated at 50k chars)
   → Set saveToDownloads=true and optional fileName to save full file to ~/Downloads

No prerequisites beyond knowing the exportId. The export definition in the model
already specifies the source view, format, and layout.

Q: "What format/columns does this export have?"
→ show_exportdetails      → check exportFormat, headerNames, rowCount
```

### Import Data

```
Q: "Import data into model X"

1. show_imports           → find the import action
2. show_importdetails     → check expected column headers, file format, source fileId
3. show_files             → confirm the source fileId matches
4. run_import(workspace, model, importId, fileId, csvData)
   → INTERNALLY uploads csvData to the file, then executes the import action
   → You do NOT need to call upload_file separately — run_import handles both steps
   → Optional: mappingParameters to override dimension mappings (e.g., target "Actual" version)
   → Polls internally until complete, returns task result with success/ignored/failure counts

When to call upload_file separately:
- Uploading data without immediately running an import (e.g., preparing for a later process)
- The import is part of a process — upload the file first, then call run_process
- Multiple imports share the same source file

On failure:
5. show_tasks(actionType=imports, actionId)  → get taskId where successful=false
6. Check if failureDumpAvailable=true in the task result
7. download_importdump(workspace, model, importId, taskId)
   → CSV with row-level error details (available ~48 hours)
```

### Run a Process

```
Q: "Run process X"

1. show_processes         → find processId
2. show_processdetails    → see what actions it contains (optional)
3. run_process(workspace, model, processId)
   → returns task with nestedResults per step

On failure:
4. show_tasks(actionType=processes)  → get taskId
5. download_processdump(workspace, model, processId, taskId, objectId)
   → objectId comes from the failed nestedResult entry
```

### Write Cell Values

```
Q: "Set value X in module Y for product Z, time Jan 25, version Actual"

Name-based write (recommended — no prerequisite calls needed):
→ write_cells(workspace, model, module, data=[{
    lineItemName: "Revenue",
    dimensions: [
      { dimensionName: "Product", itemName: "Product Z" },
      { dimensionName: "Time", itemName: "Jan 25" },
      { dimensionName: "Version", itemName: "Actual" }
    ],
    value: 50000
  }])

ID-based write (full prerequisite chain — when you need to discover IDs):
1. show_modules           → get moduleId
2. show_alllineitems(modelId) or show_lineitems(module)
                          → get lineItemId for the target measure
3. show_lineitem_dimensions(modelId, lineItemId)
                          → get dimensionIds (e.g. Products, Time, Versions)
                          → this tells you WHICH dimensions the line item uses
4. lookup_dimensionitems(dimensionId, names=["Product Z"])
   → resolves human-readable names to itemIds in one call
   OR show_dimensionitems(dimensionId) → browse all items
   (repeat for each dimension)
5. write_cells(workspace, model, module, data=[{
     lineItemId, dimensions: [{dimensionId, itemId}, ...], value
   }])

Key points:
- Name-based is simpler and recommended when you know exact names
- ID-based is needed when names are ambiguous or you need to validate available items
- ID-only tools (show_lineitem_dimensions, show_dimensionitems, show_alllineitems)
  require the 32-char hex model ID, not a name — use show_models first to get it
- lookup_dimensionitems is faster than show_dimensionitems when you already know names
```

### Manage List Items

```
Q: "Add items to list X"
1. show_lists             → get listId
2. add_list_items(workspace, model, listId, items[])

Q: "Update items in list X"
1. show_lists             → get listId
2. get_list_items         → get current items with IDs and codes
   IMPORTANT: Check which items already have `code` values
3. update_list_items      → MUST include `code` field if item already has one
   Omitting `code` on an item that has one causes Anaplan HTTP 500 error

Q: "Delete items from list X"
1. show_lists             → get listId
2. get_list_items         → get item IDs
3. delete_list_items      → pass [{id: "..."}] array (identify by id or code, not both)

Q: "Update numbered list items"
→ Numbered lists have auto-generated names — always use `code` to identify items
→ get_list_items first to see existing codes

Q: "Read a list with millions of items"
1. show_lists             → get listId
2. [Optional] preview_list → inspect a quick CSV sample first
3. create_list_readrequest
4. get_list_readrequest   → poll until COMPLETE
5. get_list_readrequest_page(pageNo=0,1,2...)
6. delete_list_readrequest
```

### Debug & Monitor

```
Q: "Did my import/export/process succeed?"
→ show_tasks(actionType, actionId)   → check taskState and successful flag

Q: "Why did my import fail?"
→ show_tasks(imports, importId)      → find taskId where taskState=COMPLETE, successful=false
→ download_importdump(importId, taskId) → row-level CSV errors

Q: "Why did my process fail?"
→ show_tasks(processes, processId)   → find taskId
→ check nestedResults for failed step's objectId
→ download_processdump(processId, taskId, objectId)

Q: "Is the model busy / what is it doing?"
→ show_modelstatus                   → currentStep: Open|Processing|Updating|Closed

Q: "Cancel a running task"
→ show_tasks(actionType, actionId)   → get taskId
→ cancel_task(actionType, actionId, taskId)

Q: "Download the Optimizer solver log"
→ download_optimizer_log(workspace, model, actionId, correlationId)
```

### Model Administration

```
Q: "Close a model"
→ close_model(workspace, model)   # requires workspace admin

Q: "Open/wake a model"
→ open_model(workspace, model)    # 202 response means still loading

Q: "Delete models"
1. close_model(workspace, model)  # must close first
2. bulk_delete_models(workspace, [modelId1, modelId2])
   # irreversible — confirm with user first
```

### Calendar & Versions

```
Q: "What is the current period?"
→ show_currentperiod

Q: "Set current period to May 2025"
→ set_currentperiod(workspace, model, "2025-05-01")
  WARNING: may delete data in removed time periods — confirm first

Q: "What versions does this model have?"
→ show_versions(modelId)

Q: "Set version switchover date"
1. show_versions          → get versionId
2. set_versionswitchover(modelId, versionId, "2025-06-01")
   WARNING: affects version boundaries — confirm first
```

---

## Decision Rules

**1. Name resolution order**
Always chain resolution workspace → model → resource. Tools accept names or IDs — the resolver handles lookup automatically.

**2. Standard read vs large read**
- View ≤ 1M cells: `read_cells`
- View > 1M cells: `create_view_readrequest` flow
- List ≤ 1M items: `get_list_items`
- List > 1M items: `create_list_readrequest` flow
- If unsure: check `show_listmetadata` (itemCount) or `show_viewdetails` (dimension sizes)

**3. Export vs read_cells**
- Use `run_export` when a pre-configured export action exists — it uses the model's defined layout and filters
- Use `read_cells` for ad-hoc reads from any view without needing a pre-configured export

**4. Import vs write_cells**
- Use `run_import` for bulk data loads (many rows, CSV format, existing import definition)
- Use `write_cells` for targeted individual cell updates (few cells, known coordinates)

**5. Task polling**
`run_import`, `run_export`, `run_process` poll internally (2s interval, 5min timeout) — no need to manually call `get_action_status` unless monitoring a task started outside this session.

**6. update_list_items and codes**
If a list item already has a `code` value, the update payload must include `code` or Anaplan returns HTTP 500.

**7. Destructive actions — always confirm first**
These are irreversible: `delete_list_items`, `run_delete`, `delete_file`, `bulk_delete_models`, `set_currentperiod`, `set_fiscalyear`, `set_versionswitchover`. Always surface the action and confirm with the user before executing.

**8. Model must be open**
Most operations require the model to be in UNLOCKED state. If getting unexpected errors, check `show_modelstatus` — `currentStep: Closed` means call `open_model` first.

**9. File expiry**
Private files (uploads and export outputs) expire after 48 hours of inactivity. Import dump files also expire 48 hours after last access. Re-upload if needed.

**10. show_viewdimensionitems vs show_dimensionitems**
Use `show_viewdimensionitems` when Selective Access or view filters may hide items. Use `show_dimensionitems` to see all items regardless of access rules.

---

## Tool Dependency Reference: Standalone vs Prerequisites

### Truly Standalone Tools (no prerequisites)
These tools work with zero or minimal prior context:
- `show_workspaces`, `show_allmodels`, `show_currentuser`, `show_users` — zero parameters needed
- `show_models`, `show_modules`, `show_lists`, `show_imports`, `show_exports`, `show_processes`, `show_actions`, `show_files` — only need workspaceId + modelId (accept names)
- `read_cells` — can use moduleId as viewId (default view), so only needs workspace + model + module names
- `run_export` — only needs workspace + model + export name; fully self-contained after that
- `write_cells` with name-based data — only needs workspace + model + module name + human-readable names for line items, dimensions, and items

### Tools That Require Prerequisite Discovery
- `write_cells` with ID-based data: needs `show_alllineitems` -> `show_lineitem_dimensions` -> `lookup_dimensionitems` chain
- `run_import`: needs `show_importdetails` to find the source fileId and expected columns
- `download_importdump` / `download_processdump`: needs `show_tasks` to get taskId (and objectId for processes)
- `show_viewdetails` / `show_viewdimensionitems`: needs viewId from `show_savedviews` or `show_allviews`
- `create_view_readrequest` / large read flow: needs viewId
- `set_versionswitchover`: needs versionId from `show_versions`
- `bulk_delete_models`: models must be closed first via `close_model`
- `cancel_task`: needs taskId from `show_tasks`

---

## Session Handling for Remote MCP (Claude Web / Claude Desktop)

When using this MCP server through Claude Web or Claude Desktop (remote transport), be aware of session lifecycle:

### Session timeout behavior
- The MCP server maintains an active connection with cached auth tokens and resolved names.
- If the underlying transport connection drops (network interruption, server restart, idle timeout), the session becomes stale.
- Stale sessions manifest as tools suddenly failing with connection errors, auth errors, or unexpected empty responses mid-conversation.

### What to do when tools start failing mid-conversation
1. If a single tool fails, retry it once — transient network errors do happen.
2. If multiple tools fail in succession, the session is likely stale.
3. **Start a new chat/conversation** to get a fresh MCP session with a new auth token.
4. Do NOT keep retrying in the same conversation — each failed call wastes time and tokens.

### Best practices for long conversations
- Front-load discovery calls (`show_workspaces`, `show_models`, `show_modules`) early when the session is fresh.
- Save important IDs (workspaceId, modelId) in the conversation so they can be reused in a new session if needed.
- For multi-step workflows (import, large read), complete the entire sequence without long pauses between steps.
