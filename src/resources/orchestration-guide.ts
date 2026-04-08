export const ORCHESTRATION_GUIDE = `# Anaplan MCP Orchestration Guide

Read this guide before calling tools. Understanding Anaplan's data model is essential for efficient tool use.

## Anaplan Domain Knowledge

### Models, Modules, and Line Items
- A **model** is a self-contained planning application (e.g., "FY26 Sales Forecast"). Models live in workspaces.
- A **module** is a grid of data inside a model (like a spreadsheet tab). Each module has specific dimensions that define its structure.
- **Line items** are the measures/metrics in a module (e.g., Revenue, Cost, Margin). They occupy columns or rows. Line items can have formulas (calculated) or be input cells (writable).
- A **cell** is uniquely identified by its line item + one item from each of the line item's dimensions.

### Lists and Hierarchies (Critical for Data Retrieval)
- **Lists** are groups of items (Products, Customers, Regions). They define the dimensions of modules.
- Lists are **hierarchical**. Every list has a top-level "All" item (e.g., "All Products") that contains the total of all children. Children can have their own children (e.g., Region > Country > City).
- **The "All" item contains pre-computed totals.** To get "total across all products", select the "All Products" item -- do NOT loop through each product and sum manually. Anaplan already computed it.
- The terms "All item", "top-level item", "aggregate", "summary", and "rollup" all mean the same thing: the parent item in a hierarchy that contains the total of its children.
- Use show_listmetadata to find the topLevelItem. Use show_viewdimensionitems to see available items for a view dimension.
- **Subsets** are filtered views of a list (e.g., "Active Products" subset of the Products list).

### Dimensions
- Every module has dimensions that define its grid structure. Common dimensions: a list (Products), Time, and Versions.
- Dimensions appear on **rows**, **columns**, or **pages** of a view.
- A line item's dimensions determine what data it holds. Use show_lineitem_dimensions to see which dimensions apply.

### Views and Pages (Critical for read_cells)
- A **view** is a presentation of a module's data. The default view has the same ID as the module.
- **Saved views** preserve dimension arrangement, filters, and formatting -- not the data itself.
- Views organize dimensions onto three axes:
  - **Rows**: items listed vertically (e.g., Products on rows = one row per product)
  - **Columns**: items listed horizontally (e.g., Time on columns = one column per month)
  - **Pages**: filter selectors. Only data for the selected page item is shown. When a dimension is on pages, you must select one item to view.
- **Pages are NOT pagination.** They are dimension filters. If Products is on pages, you select ONE product (or "All Products" for the total). The API's pages parameter controls this: pages=[{dimensionId, itemId}].
- Use show_viewdetails to see which dimensions are on rows, columns, and pages.

### Time Dimension
- Time is a built-in dimension present in every model. It has a hierarchy: Day > Week > Month > Quarter > Half-Year > Year.
- The model calendar defines the fiscal year structure (Jan-Dec, Apr-Mar, etc.) and available time scales.
- **Summary periods** (Q1, H1, FY24) are the "All" items of the time hierarchy -- automatically computed totals, just like list hierarchies. To get annual totals, read the FY-level time period -- do not sum months manually.
- **Current Period** marks where actuals end and forecast begins. It is used in formulas and version switchover.

### Versions
- **Versions** are a built-in dimension. Default versions: Actual and Forecast.
- **Actual** stores historical data. **Forecast** stores projected data.
- **Switchover date** controls the boundary: before the switchover, Forecast mirrors Actual (read-only). After the switchover, Forecast is editable with independent values.
- Additional versions (Budget, Variance, etc.) can be created for scenario comparison.
- When importing data, use mappingParameters to target a specific version (e.g., import into "Actual").

### Summary Methods and Aggregation
- Each line item has a **summary method** that controls how values roll up in hierarchies: Sum, Average, Min, Max, None, Formula, etc.
- When you read the "All" item (like "All Products"), the value is already computed by Anaplan using the summary method. You never need to aggregate manually.
- Number line items default to Sum. Boolean line items default to Any. Text/Date/List default to FirstNonBlank.

### Workspaces and Tenants
- A **tenant** is your organization's Anaplan environment. It contains one or more workspaces.
- A **workspace** is a container for models. Each workspace has a size quota.
- **Workspace administrators** can manage models, users, and run any action regardless of model role.
- Most API operations require workspace admin permissions. Regular users have restricted access based on their model role.

### Imports (run_import)
- An **import** brings external data into Anaplan. The import definition specifies: source file, target (module or list), and column mapping.
- The **source file** must already exist in the model. Use upload_file to put data into the file, then run_import to execute the import action.
- **Column mapping** maps source file columns to target dimensions (lists, time, versions, line items). Mappings are pre-configured in the model by the builder.
- Use show_importdetails to see the source file ID and column count before running.
- **mappingParameters** let you override dimension mappings at runtime (e.g., import into "Actual" version instead of the default mapping).
- Import types: HIERARCHY_DATA (into lists), MODULE_DATA (into module cells), or from another MODEL.

### Exports (run_export)
- An **export** extracts data from Anaplan into a downloadable file. The export definition specifies the source view and format.
- Export layouts: **Grid** (preserves the view layout), **Tabular Single Column** (all dimensions as columns, one data column), **Tabular Multi-Column** (dimensions as columns, multiple line item columns).
- run_export handles the full lifecycle: run, wait for completion, download all chunks, return data inline.
- **For bulk data extraction across all items in a dimension, always prefer run_export over looping read_cells.**

### Processes (run_process)
- A **process** is a chain of actions (imports, exports, deletes) that execute in sequence.
- If any action in the process fails, the process stops to prevent data inconsistency.
- Use show_processdetails to see the ordered list of actions before running.
- Process task results include **nestedResults** -- one entry per action in the chain, each with its own success/failure status and objectId.

### Delete Actions (run_delete)
- **Delete from list using selection** removes items from a list based on a boolean control module. The model builder configures which items are selected for deletion.
- This is NOT a generic "delete anything" tool. It executes a pre-configured action that the model builder set up.
- The action determines which items to delete based on a filter line item (boolean checkbox). Items marked true are deleted.

### Files (upload_file, download_file)
- Models contain **files** that serve as data sources for imports or outputs from exports.
- **Private files** are user-specific and expire after 48 hours if not accessed. API uploads always create private files.
- **Default files** are shared (Admins Only or Everyone). They're used when no private file exists.
- To import data: upload_file puts your CSV/text into the model file, then run_import executes the import action that reads from that file.

### Model States
- **UNLOCKED** (Standard): Full editing of structure and data. Used during development.
- **PRODUCTION** (Deployed): Structure is locked, only data can be modified. Used for live models.
- **LOCKED**: Entirely read-only. No data or structure changes.
- **ARCHIVED**: Stored offline, doesn't count against workspace quota. Must be restored to access.
- **MAINTENANCE** (Offline): Temporarily inaccessible to end users.
- Use show_models with state filter or show_allmodels to find models by state.
- close_model archives a model. open_model restores it (may take time for large models).

### Numbered Lists vs General Lists
- **General lists**: Items have user-defined names. Names must be unique.
- **Numbered lists**: Items are auto-numbered (names are system-generated). Use **codes** as unique identifiers instead of names.
- List **properties** store additional metadata on items (e.g., a "Display Name" property on a numbered list, or "Region" property on a Customer list).
- When updating numbered list items via API, always use code to identify items, not name.

### Model Architecture Patterns (from Anaplan Community)

**PLANS methodology** -- the standard for Anaplan model building:
- **P**erformant: Optimize for speed. Avoid SUM+LOOKUP combinations, minimize text-formatted line items.
- **L**ogical: Follow D.I.S.C.O. module structure (Data, Inputs, System, Calculations, Output).
- **A**uditable: Break complex formulas into separate line items. Each line item should have a clear, single purpose.
- **N**ecessary: Don't duplicate data. Store once, reference many times.
- **S**ustainable: Build for change. Think about process cycles and future updates.

**D.I.S.C.O. module naming** -- modules are typically prefixed by function:
- **D**ata modules: Hold imported raw data (e.g., "DAT01 Sales Data")
- **I**nput modules: User-entered assumptions (e.g., "INP01 Growth Rates")
- **S**ystem modules: Settings and configuration (e.g., "SYS01 Time Settings")
- **C**alculation modules: Business logic (e.g., "CALC01 Revenue Forecast")
- **O**utput/Reporting modules: Views for end users (e.g., "REP01 P&L Summary")

When exploring a model, use these prefixes to understand module purpose. REP/OUT modules are usually what end users want to read from. DAT modules are import targets.

**Data Hub and Spoke pattern** -- common multi-model architecture:
- A central **Data Hub** model stores master data (flat lists, transactional data).
- **Spoke models** contain business logic and import data from the hub via saved views.
- Data Hub lists are typically flat (no hierarchy). Hierarchies are built in spoke models.
- When you see model-to-model imports (importType: "MODEL"), this is the hub-spoke pattern.

**Line item dimensionality and "Applies To":**
- Each line item in a module has an "Applies To" setting that controls which dimensions apply to it.
- A line item can have fewer dimensions than its module (e.g., a "Total Revenue" line item with no product dimension in a product-dimensioned module).
- **Subsidiary views** are line items with different dimensionality than their module. They appear as separate grids when viewed.
- When reading data, a subsidiary view line item may return different dimension structure than other line items in the same module.

**Common formula functions** (context for understanding show_lineitems output):
- **SUM**: Aggregates across a dimension. Used in most financial models.
- **LOOKUP**: Retrieves a value from another module using a mapping.
- **SELECT**: Picks a specific item from a dimension (avoid hard-coding when possible).
- **FINDITEM**: Finds a list item by name (performance-heavy, avoid in large lists).
- **COLLECT**: Builds a list from filtered data.

### The Planual (Anaplan Best Practice Rules)

The Planual is the official Anaplan best practice guide. Understanding these conventions helps interpret model structure when exploring with show_modules, show_lineitems, etc.

**Module conventions (Chapter 2):**
- Module names are brief with alphanumeric prefixes for ordering (e.g., "REV01 Price Book", "FIN03 P&L")
- Modules are grouped by functional area (Revenue, Finance, Supply Chain), NOT by DISCO category
- DISCO (Data/Input/System/Calculation/Output) describes module PURPOSE, not its name prefix
- Empty modules are used as section separators in the module list
- Each major hierarchy has a System module with standing data (code, parent, attributes)
- Calculation modules keep summaries OFF by default -- only enable when needed
- Dimensions should be in consistent order across modules for performance
- Subsidiary views are avoided in calculation modules -- use separate modules with matching dimensionality instead

**Line item conventions (Chapter 2):**
- Summary options (Sum, Average, etc.) are OFF by default -- only enabled for user-facing output
- Text-formatted line items are expensive (memory) -- models minimize text, prefer numbers/booleans
- Header line items are set to "No Data" to avoid unnecessary calculations
- Formulas are broken into separate line items for auditability (not combined into one complex formula)

**List conventions (Chapter 1):**
- Hierarchy lists use letter+level prefix: P1 Product Category, P2 Product Family, P3 Products
- Lists should always have codes (more efficient for loading and integration)
- Subsets are prefixed with the list name (e.g., "P3 Products: Active Products")
- Line Item Subsets are prefixed with "LIS" (e.g., "LIS Revenue Items")
- No emojis or special symbols in any naming (causes integration issues)

**Integration conventions (Chapter 5):**
- Import actions use numeric prefixes for sequencing: "1.1 Import Products", "1.2 Import Product Details"
- Separate files for attributes vs transactional data -- don't combine
- Data files have keys + values by dimension. Attribute files have codes + properties.
- Pre-aggregate in the source system when possible (don't import granular data then aggregate in Anaplan)
- Always import from saved views, never from default views or lists directly
- Exports include only needed line items -- column count affects performance
- Export views use single optimized filters (multiple filters are slow)
- One-off import actions should be deleted after use to keep the model clean
- Use processes to wrap related actions -- process actions auto-update when contents change

### Key Implications for Tool Usage
1. **To get totals, read the "All" item** -- don't loop through children.
2. **Time rollups are automatic** -- read FY24 directly, don't sum Jan through Dec.
3. **Pages are dimension filters, not pagination** -- select the right item on each page dimension.
4. **Versions are a dimension** -- if you need Actual vs Forecast, it's a page/row/column selection, not a separate API call.
5. **One read_cells call with the right page selections replaces dozens of per-item calls.**
6. **For bulk reports across all items, use run_export** -- not read_cells in a loop.
7. **Upload data before importing** -- upload_file puts data into the model file, then run_import executes.
8. **Processes are ordered chains** -- if one step fails, the rest don't run. Check nestedResults for per-step status.
9. **Model state determines what operations are allowed** -- PRODUCTION models can't be structurally changed, ARCHIVED models must be opened first.
10. **Module prefixes indicate purpose** -- REV/FIN/SUP = functional area. DAT/INP/SYS/CALC/REP = DISCO type. Use these to navigate large models efficiently.
11. **Hierarchy lists use level prefixes** -- P1/P2/P3 = hierarchy depth. Higher number = more granular.

## MCP Server Concepts

- **Name resolution**: Most tools accept human-readable names OR 32-character hex IDs for workspace, model, module, list, import, export, process, file, view, and action parameters. The server resolves names automatically.
- **ID-only tools**: 9 tools use Anaplan's transactional API and only accept model IDs (not names): show_allviews, show_alllineitems, show_versions, show_lineitem_dimensions, show_lineitem_dimensions_items, show_dimensionitems, show_viewdimensionitems, set_versionswitchover, reset_list_index. Use show_models or show_allmodels first to get the model ID.
- **Filtering**: All list tools accept limit (default 50) and search (case-insensitive substring) parameters. Use search to filter large result sets by name, ID, or any displayed column value (e.g., search "PRODUCTION" to find models by state).
- **Default views**: Every module has a default view whose ID equals the module ID. You can pass moduleId as viewId to read_cells without calling show_savedviews first.

## Workflow 1: Navigate and Discover

\`\`\`
show_workspaces
  -> show_models(workspaceId)
    -> show_modules(workspaceId, modelId)
      -> show_lineitems(workspaceId, modelId, moduleId)
      -> show_savedviews(workspaceId, modelId, moduleId)
    -> show_lists(workspaceId, modelId)
    -> show_imports / show_exports / show_processes / show_actions
\`\`\`

Shortcut: Use show_allmodels to list models across all workspaces (no workspaceId needed).

## Workflow 2: Read Cell Data

**Standard read (< 1M cells):**
\`\`\`
1. show_modules(workspaceId, modelId) -> get moduleId
2. [Optional] show_savedviews(workspaceId, modelId, moduleId) -> get viewId
3. read_cells(workspaceId, modelId, moduleId, viewId)
   - viewId can be a saved view ID OR the moduleId itself (default view)
   - Use pages param to filter by page dimensions: pages=[{dimensionId, itemId}]
     Get page dimension IDs from show_viewdetails, item IDs from show_viewdimensionitems
   - Use maxRows to limit output size
\`\`\`

**If read_cells returns a truncation warning** (>50K chars), the view is too large. DO NOT start looping per item. Instead:
1. First try: add pages param to select the "All" item for each dimension (e.g., "All Customers") to reduce data
2. If still too large: use maxRows to limit rows
3. If still too large: use create_view_readrequest for large volume CSV download
4. If an export action exists for this data: use run_export instead
**NEVER iterate read_cells per list item** -- this is always wrong. One large read is better than 40 small reads.

**Large volume read (> 1M cells):**
\`\`\`
1. create_view_readrequest(workspaceId, modelId, viewId)
   -> returns requestId
2. get_view_readrequest(workspaceId, modelId, viewId, requestId)
   -> poll until status is COMPLETE (returns page count)
3. get_view_readrequest_page(workspaceId, modelId, viewId, requestId, pageNo)
   -> download each page (0-based) as CSV
4. delete_view_readrequest(workspaceId, modelId, viewId, requestId)
   -> ALWAYS clean up to free server resources
\`\`\`

## Workflow 2b: Reports Across "All [Dimension]" (Critical Pattern)

When the user asks for a report "for all products", "across all customers", or "by region":

**"All [dimension]" means:** Leave that dimension on rows/columns to show every item. Lock the OTHER page dimensions to their "All" item (the top-level total). Do NOT loop through individual items. Do NOT use TABULAR_MULTI_COLUMN. Two targeted read_cells calls maximum -- one per dimension breakdown needed.

**Step-by-step:**
\`\`\`
1. show_viewdetails -> identify which dimensions are on rows, columns, pages

2. For "report for all products and all customers":
   Call 1 - Product breakdown:
     read_cells(pages: [{customersId, "All Customers" itemId}])
     -> Products stays on its axis, customers locked to "All" item. One call.

   Call 2 - Customer breakdown:
     read_cells(pages: [{productsId, "All Products" itemId}])
     -> Customers stays on its axis, products locked to "All" item. One call.

   That's it. Two calls. Not 40.

3. For "report for all products" (single dimension):
   read_cells(pages: [{customersId, "All Customers" itemId}])
   -> One call. All products visible, customers locked to "All" item.

4. For grand total only:
   read_cells(pages: [{productsId, "All Products" itemId}, {customersId, "All Customers" itemId}])
   -> One call. Both dimensions locked to their "All" item.
\`\`\`

**If a call returns truncated data** (>50K chars), the view has too many time periods or line items. Solutions:
- Use maxRows to limit rows
- Use create_view_readrequest to download as CSV (handles any size)
- Parse the annual totals (FY24, FY25, etc.) from the response and ignore monthly detail

**Rules:**
- NEVER call read_cells in a loop per list item. Not for 5 items, not for 50.
- NEVER use exportType TABULAR_MULTI_COLUMN for reports -- it explodes the response size.
- Two calls maximum for a two-dimension report. One call for single dimension.
- Find "All" item IDs: use show_viewdimensionitems (first item is usually the "All" item) or show_listmetadata (topLevelItem field).

## Workflow 3: Write Cell Data

Two approaches: name-based (simpler) or ID-based (when you already have IDs).

**Name-based write (recommended -- no prerequisite calls needed):**
\`\`\`
write_cells(workspaceId, modelId, moduleId, data=[{
  lineItemName: "Revenue",
  dimensions: [
    { dimensionName: "Product", itemName: "Laptops" },
    { dimensionName: "Time", itemName: "Jan 24" },
    { dimensionName: "Version", itemName: "Actual" }
  ],
  value: 50000
}])
\`\`\`

**ID-based write (full prerequisite chain):**
This is the explicit prerequisite chain when you need to discover IDs from scratch. Each step depends on the previous.
\`\`\`
1. show_modules(workspaceId, modelId) -> get moduleId
2. show_alllineitems(modelId) or show_lineitems(workspaceId, modelId, moduleId)
   -> get lineItemId for the target measure (e.g., "Revenue")
3. show_lineitem_dimensions(modelId, lineItemId)
   -> get dimensionIds (e.g., Products, Time, Versions) -- this tells you which dimensions the line item uses
4. For each dimensionId:
   lookup_dimensionitems(workspaceId, modelId, dimensionId, names=["Product Z"])
   -> resolves human-readable names to itemIds in one call
   OR show_dimensionitems(modelId, dimensionId) -> browse all items, then pick the right ones
5. write_cells(workspaceId, modelId, moduleId, data=[{
     lineItemId, dimensions: [{ dimensionId, itemId }, ...], value
   }])
\`\`\`

**Key points:**
- Name-based write is simpler and recommended when you know the exact names of line items and dimension items.
- ID-based write is necessary when names are ambiguous or when you need to validate available items first.
- ID-only tools (show_lineitem_dimensions, show_dimensionitems, show_alllineitems) require the 32-char hex model ID, not a name. Use show_models first to get it.
- lookup_dimensionitems is the fastest way to resolve a few known names to IDs -- prefer it over show_dimensionitems when you already know the item names.

## Workflow 4: Run an Import

**Typical flow (run_import handles upload internally):**
\`\`\`
1. show_imports(workspaceId, modelId) -> get importId
2. show_importdetails(workspaceId, modelId, importId)
   -> see source fileId, column headers, and expected format
3. show_files(workspaceId, modelId) -> confirm the source fileId matches
4. run_import(workspaceId, modelId, importId, fileId, csvData)
   - run_import INTERNALLY uploads the csvData to the file, then executes the import action
   - You do NOT need to call upload_file separately -- run_import handles both steps
   - Optional: mappingParameters=[{entityType:"Version", entityName:"Actual"}] to override dimension mappings
   -> polls until complete, returns task result with success/ignored/failure counts
5. [If failed] download_importdump(workspaceId, modelId, importId, taskId)
   -> get CSV with row-level error details (available ~48 hours)
\`\`\`

**When to call upload_file separately:**
- When you want to upload a file without immediately running an import (e.g., preparing data for a later process run)
- When the import is part of a process and you need the file uploaded before calling run_process
- When you need to upload data to a file that multiple imports share

**Debugging a failed import:**
\`\`\`
1. show_tasks(workspaceId, modelId, actionType="imports", actionId=importId)
   -> find the taskId where taskState=COMPLETE but successful=false
2. Check if failureDumpAvailable=true in the task result
3. download_importdump(workspaceId, modelId, importId, taskId)
   -> CSV with row-level error details
\`\`\`

## Workflow 5: Run an Export

run_export is a fully self-contained tool -- it handles the entire lifecycle (execute task, poll for completion, download all file chunks, return data) in one call:

\`\`\`
1. show_exports(workspaceId, modelId) -> find the export action and get exportId
2. [Optional] show_exportdetails(workspaceId, modelId, exportId)
   -> check exportFormat, headerNames, rowCount estimate before running
3. run_export(workspaceId, modelId, exportId)
   -> returns data inline (truncated at 50k chars)
   -> set saveToDownloads=true and optional fileName to save the full file to ~/Downloads
\`\`\`

**No prerequisites beyond knowing the exportId.** Unlike imports, exports don't require file uploads or multi-step setup. The export definition in the model already specifies the source view, format, and layout.

## Workflow 6: Run a Process

\`\`\`
1. show_processes(workspaceId, modelId) -> get processId
2. [Optional] show_processdetails(workspaceId, modelId, processId) -> see chained actions
3. run_process(workspaceId, modelId, processId)
   -> returns task result
4. [If async] get_action_status(workspaceId, modelId, "processes", processId, taskId)
5. [If failed] download_processdump(workspaceId, modelId, processId, taskId, objectId)
   - objectId identifies which step failed (from task result's nestedResults)
\`\`\`

## Workflow 6b: Run a Delete Action

\`\`\`
1. show_actions(workspaceId, modelId) -> find delete actions and get actionId
2. [Optional] show_actiondetails(workspaceId, modelId, actionId) -> see what the action deletes
3. run_delete(workspaceId, modelId, actionId)
   -> executes the pre-configured delete action (removes list items based on boolean filter)
4. [If needed] get_action_status(workspaceId, modelId, "actions", actionId, taskId)
\`\`\`

**WARNING:** Delete actions are irreversible. The action deletes items from a list based on a boolean control line item -- items marked true are removed permanently. Always check show_actiondetails first to understand what will be deleted.

## Workflow 7: List Item Mutations

\`\`\`
1. show_lists(workspaceId, modelId) -> get listId
2. get_list_items(workspaceId, modelId, listId) -> see existing items, IDs, and codes
3. add_list_items(workspaceId, modelId, listId, items)
   OR update_list_items(workspaceId, modelId, listId, items)
   OR delete_list_items(workspaceId, modelId, listId, items)
\`\`\`

**Critical: update_list_items and the code field:**
When updating an item that already has a \`code\` value, you MUST include the \`code\` field in the update payload. Omitting it causes Anaplan to return an HTTP 500 error. Always call get_list_items first to check which items have codes, then include those codes in the update.

**Delete list items:** Identify items by \`id\` or \`code\`, not both. Pass an array like \`[{id: "..."}, {id: "..."}]\`.

**Numbered lists:** Items have auto-generated names. Always use \`code\` (not \`name\`) to identify items in add/update/delete operations.

For lists with > 1M items, use the large volume list read workflow:
\`\`\`
create_list_readrequest -> get_list_readrequest (poll) -> get_list_readrequest_page -> delete_list_readrequest
\`\`\`

## Workflow 8: File Management

\`\`\`
show_files(workspaceId, modelId) -> list files
upload_file(workspaceId, modelId, fileId, data) -> upload (typically before run_import)
download_file(workspaceId, modelId, fileId) -> download content
delete_file(workspaceId, modelId, fileId) -> WARNING: irreversible
\`\`\`

## Workflow 9: Calendar & Versions

\`\`\`
show_currentperiod / show_modelcalendar -> view calendar settings
set_currentperiod(workspaceId, modelId, periodText) -> WARNING: may cause data loss
set_fiscalyear(workspaceId, modelId, year) -> WARNING: may affect time ranges

show_versions(modelId) -> get version IDs (ID-only tool)
set_versionswitchover(modelId, versionId, date) -> WARNING: affects version boundaries
\`\`\`

## Workflow 10: Model & Admin

\`\`\`
show_modelstatus(workspaceId, modelId) -> check memory usage
close_model(workspaceId, modelId) -> archive (requires workspace admin)
open_model(workspaceId, modelId) -> wake up (may return 202 while loading)
bulk_delete_models(workspaceId, modelIds[]) -> WARNING: irreversible, models must be closed first
\`\`\`

## Workflow 11: Task Management

\`\`\`
show_tasks(workspaceId, modelId, actionType, actionId) -> view task history
get_action_status(workspaceId, modelId, actionType, actionId, taskId) -> check specific task
cancel_task(workspaceId, modelId, actionType, actionId, taskId) -> cancel running task
download_importdump(workspaceId, modelId, importId, taskId) -> CSV error details for failed imports
download_processdump(workspaceId, modelId, processId, taskId, objectId) -> CSV error details for failed process steps
download_optimizer_log(workspaceId, modelId, actionId, correlationId) -> solver log for optimizer actions
\`\`\`

actionType must be one of: imports, exports, processes, actions.

## Anaplan List Hierarchies and Aggregation

Anaplan lists are hierarchical. Every list has an "All" item (e.g., "All Products", "All Customers") that contains the pre-computed total of all children. You do NOT need to read each child item individually.

**Key principle:** To get "all products" data, select the "All Products" item on the pages dimension. Anaplan has already computed the total. One API call, not N calls.

**How to find the "All" item:**
\`\`\`
1. show_viewdetails -> find which dimensions are on pages
2. show_viewdimensionitems(modelId, viewId, dimensionId) -> first item is usually the "All" item
   OR show_listmetadata -> topLevelItem field gives you the "All" item
\`\`\`

**Examples using the pages parameter on read_cells:**

"Report for all products, all customers" (grand total):
\`\`\`
read_cells(view, pages: [
  { dimensionId: productsId, itemId: allProductsItemId },
  { dimensionId: customersId, itemId: allCustomersItemId }
])
\`\`\`
-> One call. Returns the grand total.

"Report by each product, across all customers":
\`\`\`
read_cells(view, pages: [
  { dimensionId: customersId, itemId: allCustomersItemId }
])
\`\`\`
-> One call. Products on rows, customer totals already rolled up.

"Report for Laptop Pro across all customers":
\`\`\`
read_cells(view, pages: [
  { dimensionId: productsId, itemId: laptopProItemId },
  { dimensionId: customersId, itemId: allCustomersItemId }
])
\`\`\`
-> One call. Single product, aggregated customers.

"Report by each customer for a specific product":
\`\`\`
read_cells(view, pages: [
  { dimensionId: productsId, itemId: laptopProItemId }
])
\`\`\`
-> One call. Customers on rows, single product selected.

## Decision Rules: read_cells vs run_export

**Use read_cells when:**
- Reading a specific slice of data using page selections ("All" items or specific items)
- You need JSON format for programmatic processing
- The view has < 1M cells

**Use run_export when:**
- A pre-configured export already exists for the data you need
- You need CSV format with a specific layout (tabular, grid)
- The data is too large for read_cells (> 1M cells or > 50K chars in response)

**NEVER do this:** Call read_cells in a loop for each dimension member (e.g., once per product, once per customer). Anaplan pre-computes totals in the "All" item -- select it on pages instead. If you need all individual items, read the view once with no page filter or use run_export.

## Common Patterns

**Check who you are**: show_currentuser (no parameters needed)
**List all users**: show_users
**User details**: show_userdetails(userId)

**View module structure before reading**: show_moduledetails returns the default view's row/column/page dimension layout. This tells you what data read_cells will return.

**Explore view dimensions**: show_viewdetails(workspaceId, modelId, moduleId, viewId) shows row, column, and page dimensions for any view. Use show_viewdimensionitems to see the items in each dimension.

## Tool Dependency Reference: Standalone vs Prerequisites Required

**Truly standalone tools (no prerequisites):**
- show_workspaces, show_allmodels, show_currentuser, show_users -- work with zero prior context
- show_models, show_modules, show_lists, show_imports, show_exports, show_processes, show_actions, show_files -- only need workspaceId + modelId (which accept names)
- read_cells -- can use moduleId as viewId (default view), so only needs workspace + model + module names
- run_export -- only needs workspace + model + export name (fully self-contained after that)
- write_cells with name-based data -- only needs workspace + model + module name + human-readable line item/dimension/item names

**Tools that require prerequisite discovery:**
- write_cells with ID-based data: needs show_alllineitems -> show_lineitem_dimensions -> lookup_dimensionitems chain
- run_import: needs show_importdetails to find the source fileId and expected columns
- download_importdump / download_processdump: needs show_tasks to get taskId (and objectId for processes)
- show_viewdetails / show_viewdimensionitems: needs viewId from show_savedviews or show_allviews
- create_view_readrequest / large read flow: needs viewId
- set_versionswitchover: needs versionId from show_versions
- bulk_delete_models: models must be closed first via close_model
- cancel_task: needs taskId from show_tasks

## Session Handling for Remote MCP (Claude Web / Claude Desktop)

When using this MCP server through Claude Web or Claude Desktop (remote transport), be aware of session lifecycle:

**Session timeout behavior:**
- The MCP server maintains an active connection with cached auth tokens and resolved names.
- If the underlying transport connection drops (network interruption, server restart, idle timeout), the session becomes stale.
- Stale sessions manifest as tools suddenly failing with connection errors, auth errors, or unexpected empty responses mid-conversation.

**What to do when tools start failing mid-conversation:**
1. If a single tool fails, retry it once -- transient network errors do happen.
2. If multiple tools fail in succession, the session is likely stale.
3. Start a new chat/conversation to get a fresh MCP session with a new auth token.
4. Do NOT keep retrying in the same conversation -- each failed call wastes time and tokens.

**How to interpret connection/auth failures:**
- \`Anaplan OAuth reauthorization required\` means the MCP server is alive and reached Anaplan auth successfully, but the saved OAuth session could not be refreshed. Re-authorize, then retry.
- \`Anaplan authorization required\` means the server needs the user to complete the OAuth device login flow before tool calls can proceed.
- \`No Anaplan credentials configured\` means the MCP server started without any usable Anaplan auth configuration.
- \`Anaplan API error (401)\` means the request reached Anaplan's API but the credentials/token were rejected.
- \`Anaplan API error (403)\` means the request reached Anaplan's API and authenticated, but the user lacks permission for that resource or action.

**Best practices for long conversations:**
- Front-load discovery calls (show_workspaces, show_models, show_modules) early when the session is fresh.
- Save important IDs (workspaceId, modelId) in the conversation so they can be reused in a new session if needed.
- For multi-step workflows (import, large read), complete the entire sequence without long pauses between steps.
`;
