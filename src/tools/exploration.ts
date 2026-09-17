import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AnaplanApiError } from "../api/client.js";
import type { WorkspacesApi } from "../api/workspaces.js";
import type { ModelsApi } from "../api/models.js";
import type { ModulesApi } from "../api/modules.js";
import type { ListsApi } from "../api/lists.js";
import type { ImportsApi } from "../api/imports.js";
import type { ExportsApi } from "../api/exports.js";
import type { ProcessesApi } from "../api/processes.js";
import type { FilesApi } from "../api/files.js";
import type { ActionsApi } from "../api/actions.js";
import type { TransactionalApi } from "../api/transactional.js";
import type { ModelManagementApi } from "../api/modelManagement.js";
import type { DimensionsApi } from "../api/dimensions.js";
import type { CalendarApi } from "../api/calendar.js";
import type { VersionsApi } from "../api/versions.js";
import type { UsersApi } from "../api/users.js";
import type { NameResolver } from "../resolver.js";
import { formatTable, type FormatOptions } from "./format.js";
import { withNextSteps } from "./hints.js";

interface ExplorationApis {
  workspaces: WorkspacesApi;
  models: ModelsApi;
  modules: ModulesApi;
  lists: ListsApi;
  imports: ImportsApi;
  exports: ExportsApi;
  processes: ProcessesApi;
  files: FilesApi;
  actions: ActionsApi;
  transactional: TransactionalApi;
  modelManagement: ModelManagementApi;
  dimensions: DimensionsApi;
  calendar: CalendarApi;
  versions: VersionsApi;
  users: UsersApi;
}

const paginationParams = {
  limit: z.number().optional().describe("Max items to return (default 50, max 1000)"),
  search: z.string().optional().describe("Filter by name or ID (case-insensitive substring match)"),
};

const DIRECT_MODEL_HINT = "Discovery may omit accessible models, including those in another customer/tenant. If you have a model URL, use the IDs after /workspaces/ and /models/ directly with show_modeldetails, show_modules, or show_imports; name resolution depends on discovery. A discovery 404 alone does not prove model access is denied.";

function discoveryErrorResult(error: unknown) {
  if (!(error instanceof AnaplanApiError) || error.status !== 404) throw error;
  return {
    isError: true,
    content: [{ type: "text" as const, text: `${error.message}\n\n${DIRECT_MODEL_HINT}` }],
  };
}

function tableResult(items: any[], columns: { header: string; key: string }[], label: string, options?: FormatOptions) {
  const { table, footer } = formatTable(items, columns, label, options);
  const content: { type: "text"; text: string }[] = [];
  if (table) content.push({ type: "text", text: table });
  content.push({ type: "text", text: footer });
  return { content };
}

function tableCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

function lineItemAppliesTo(item: any): string {
  if (Array.isArray(item.appliesTo)) {
    return item.appliesTo.map((dim: any) => dim?.name ?? dim?.id ?? "").filter(Boolean).join(", ");
  }
  return item.appliesTo ?? "";
}

function enrichLineItems(items: any[]) {
  return items.map((item) => ({
    ...item,
    formulaDisplay: tableCell(item.formula),
    formatDisplay: tableCell(item.format ?? item.formatMetadata?.dataType),
    versionDisplay: tableCell(item.version?.name ?? item.version?.id ?? item.version),
    appliesToDisplay: tableCell(lineItemAppliesTo(item)),
    notesDisplay: tableCell(item.notes),
    codeDisplay: tableCell(item.code),
  }));
}

export function registerExplorationTools(server: McpServer, apis: ExplorationApis, resolver: NameResolver) {
  server.tool("show_workspaces", "List workspaces visible to Anaplan discovery (not necessarily every accessible workspace). Use tenantDetails=true for size/quota info. For a known model URL, use its workspace/model IDs directly with show_modules or show_modeldetails.", {
    ...paginationParams,
    tenantDetails: z.boolean().optional().describe("Include workspace size and quota information"),
  }, async ({ limit, search, tenantDetails }) => {
    const workspaces = await apis.workspaces.list(tenantDetails);
    const columns = [{ header: "Name", key: "name" }, { header: "ID", key: "id" }, { header: "Active", key: "active" }];
    if (tenantDetails) {
      columns.push({ header: "Size", key: "sizeAllowance" }, { header: "Quota", key: "currentSize" });
    }
    return withNextSteps(
      tableResult(workspaces, columns, "workspaces", { limit, search }),
      ["Use show_models with a workspaceId to explore a workspace's models.", DIRECT_MODEL_HINT],
    );
  });

  server.tool("show_models", "List models visible to discovery in a workspace. Filter by state param (PRODUCTION, UNLOCKED, etc). Use modelDetails=true for memory/dates. If missing or 404, use known workspace/model IDs with show_modules or show_modeldetails to check direct access.", {
    workspaceId: z.string().describe("Anaplan workspace ID or name"),
    state: z.enum(["UNLOCKED", "PRODUCTION", "ARCHIVED", "LOCKED", "MAINTENANCE", "PRODUCTION_MAINTENANCE"]).optional().describe("Filter by model state"),
    modelDetails: z.boolean().optional().describe("Include memory usage, creation date, and last modified"),
    ...paginationParams,
  }, async ({ workspaceId, state, modelDetails, limit, search }) => {
    const wId = await resolver.resolveWorkspace(workspaceId);
    let models;
    try {
      models = await apis.models.list(wId, modelDetails);
    } catch (error) {
      return discoveryErrorResult(error);
    }
    if (state) models = models.filter((m: any) => m.activeState === state);
    return withNextSteps(
      tableResult(models, [{ header: "Name", key: "name" }, { header: "State", key: "activeState" }, { header: "ID", key: "id" }], "models", { limit, search }),
      ["Use show_modules to explore modules, show_imports/show_exports for bulk actions.", DIRECT_MODEL_HINT],
    );
  });

  server.tool("show_modeldetails", "Get model details including status and workspace binding. If model metadata returns 404, verify direct access using read-only module/import listings and report partial results without inventing metadata. Use explicit IDs from a model URL when discovery omits it.", {
    workspaceId: z.string().describe("Anaplan workspace ID or name"),
    modelId: z.string().describe("Anaplan model ID or name"),
    modelDetails: z.boolean().optional().describe("Include memory usage, creation date, and last modified"),
  }, async ({ workspaceId, modelId, modelDetails }) => {
    const wId = await resolver.resolveWorkspace(workspaceId);
    const mId = await resolver.resolveModel(wId, modelId);
    let model;
    try {
      model = await apis.models.get(wId, mId, modelDetails);
    } catch (error) {
      // Global model metadata can be hidden while workspace-scoped APIs still work.
      // Only fall back on a metadata 404, never on authentication or service errors.
      if (!(error instanceof AnaplanApiError) || error.status !== 404) throw error;
      const resources = ["modules", "imports"] as const;
      const results = await Promise.allSettled([
        apis.modules.list(wId, mId),
        apis.imports.list(wId, mId),
      ]);
      const accessConfirmed = results.some((result) => result.status === "fulfilled");
      const checks = results.map((result, index) => ({
        resource: resources[index],
        status: result.status === "fulfilled" ? "Accessible" : "Not verified",
        count: result.status === "fulfilled" ? result.value.length : undefined,
        error: result.status === "rejected"
          ? tableCell(result.reason instanceof Error ? result.reason.message : String(result.reason))
          : "",
      }));
      const summary = [
        `Model ID: ${mId}`,
        `Workspace ID: ${wId}`,
        `Model discovery metadata unavailable: ${error.message}`,
        "Name, state, size, and other model details are unavailable from this endpoint.",
        accessConfirmed
          ? "Read-only model access confirmed via the workspace-scoped endpoint(s) marked Accessible below. This does not establish permission to read every resource or execute actions."
          : "Direct model access could not be verified. Check the supplied IDs and the individual endpoint errors below; a discovery 404 alone is inconclusive.",
      ].join("\n");
      return {
        ...withNextSteps({ content: [
          { type: "text" as const, text: summary },
          ...tableResult(checks, [
            { header: "Resource", key: "resource" },
            { header: "Read access", key: "status" },
            { header: "Count", key: "count" },
            { header: "Error", key: "error" },
          ], "access checks").content,
        ] }, [DIRECT_MODEL_HINT]),
        ...(!accessConfirmed ? { isError: true } : {}),
      };
    }
    return tableResult(
      [model],
      [
        { header: "Model", key: "name" },
        { header: "Model ID", key: "id" },
        { header: "Workspace", key: "currentWorkspaceName" },
        { header: "Workspace ID", key: "currentWorkspaceId" },
        { header: "State", key: "activeState" },
      ],
      "model details",
    );
  });

  server.tool("show_modules", "List all modules in a model. Use show_lineitems to see a module's line items, or show_savedviews to find views for read_cells.", {
    workspaceId: z.string().describe("Anaplan workspace ID or name"),
    modelId: z.string().describe("Anaplan model ID or name"),
    ...paginationParams,
  }, async ({ workspaceId, modelId, limit, search }) => {
    const wId = await resolver.resolveWorkspace(workspaceId);
    const mId = await resolver.resolveModel(wId, modelId);
    const modules = await apis.modules.list(wId, mId);
    return withNextSteps(
      tableResult(modules, [{ header: "Name", key: "name" }, { header: "ID", key: "id" }], "modules", { limit, search }),
      ["Use show_lineitems to see line items, show_savedviews for views, or show_moduledetails for dimension layout."],
    );
  });

  server.tool("show_moduledetails", "Get module details with default view dimension metadata (rows, columns, pages). The default viewId equals the moduleId -- use it with read_cells directly.", {
    workspaceId: z.string().describe("Anaplan workspace ID or name"),
    modelId: z.string().describe("Anaplan model ID or name"),
    moduleId: z.string().describe("Anaplan module ID or name"),
  }, async ({ workspaceId, modelId, moduleId }) => {
    const wId = await resolver.resolveWorkspace(workspaceId);
    const mId = await resolver.resolveModel(wId, modelId);
    const modId = await resolver.resolveModule(wId, mId, moduleId);
    const mod = await apis.modules.get(wId, mId, modId);

    let defaultView: {
      viewId: string;
      viewName: string;
      rows: Array<{ id: string; name: string }>;
      columns: Array<{ id: string; name: string }>;
      pages: Array<{ id: string; name: string }>;
    } | null = null;
    let dimensionWarning: string | undefined;

    try {
      // Default module view ID matches module ID in Anaplan.
      const view = await apis.transactional.getViewMetadata(mId, modId);
      defaultView = {
        viewId: view.viewId ?? modId,
        viewName: view.viewName ?? mod.name ?? modId,
        rows: view.rows ?? [],
        columns: view.columns ?? [],
        pages: view.pages ?? [],
      };
    } catch (error) {
      dimensionWarning = `Unable to load default view metadata: ${error instanceof Error ? error.message : String(error)}`;
    }

    const response: any = {
      ...mod,
      defaultView,
    };
    if (dimensionWarning) response.dimensionWarning = dimensionWarning;

    return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
  });

  server.tool("show_lineitems", "List line items in a module. Line item IDs are needed for write_cells. Use includeAll=true for formulas, formats, and dimensions.", {
    workspaceId: z.string().describe("Anaplan workspace ID or name"),
    modelId: z.string().describe("Anaplan model ID or name"),
    moduleId: z.string().describe("Anaplan module ID or name"),
    includeAll: z.boolean().optional().describe("Include full metadata (formula, format, version, appliesTo)"),
    ...paginationParams,
  }, async ({ workspaceId, modelId, moduleId, includeAll, limit, search }) => {
    const wId = await resolver.resolveWorkspace(workspaceId);
    const mId = await resolver.resolveModel(wId, modelId);
    const modId = await resolver.resolveModule(wId, mId, moduleId);
    const items = await apis.transactional.getModuleLineItems(mId, modId, includeAll ?? false);
    if (includeAll) {
      return withNextSteps(
        tableResult(enrichLineItems(items), [
          { header: "Name", key: "name" },
          { header: "Formula", key: "formulaDisplay" },
          { header: "Format", key: "formatDisplay" },
          { header: "Applies To", key: "appliesToDisplay" },
          { header: "Version", key: "versionDisplay" },
          { header: "Notes", key: "notesDisplay" },
          { header: "Code", key: "codeDisplay" },
          { header: "ID", key: "id" },
        ], "line items", { limit, search }),
        ["Use line item IDs with write_cells. Use show_lineitem_dimensions to find dimension coordinates."],
      );
    }
    return withNextSteps(
      tableResult(items, [{ header: "Name", key: "name" }, { header: "Module", key: "moduleName" }, { header: "ID", key: "id" }], "line items", { limit, search }),
      ["Use line item IDs with write_cells. Use show_lineitem_dimensions to find dimension coordinates."],
    );
  });

  server.tool("show_savedviews", "List saved views in a module. Use includeSubsidiaryViews=true for unsaved subsidiary views. View IDs needed for read_cells. Tip: moduleId works as default viewId.", {
    workspaceId: z.string().describe("Anaplan workspace ID or name"),
    modelId: z.string().describe("Anaplan model ID or name"),
    moduleId: z.string().describe("Anaplan module ID or name"),
    includeSubsidiaryViews: z.boolean().optional().describe("Include unsaved subsidiary views in results"),
    ...paginationParams,
  }, async ({ workspaceId, modelId, moduleId, includeSubsidiaryViews, limit, search }) => {
    const wId = await resolver.resolveWorkspace(workspaceId);
    const mId = await resolver.resolveModel(wId, modelId);
    const modId = await resolver.resolveModule(wId, mId, moduleId);
    const views = await apis.modules.listViews(wId, mId, modId, includeSubsidiaryViews);
    return withNextSteps(
      tableResult(views, [{ header: "Name", key: "name" }, { header: "Module", key: "moduleId" }, { header: "ID", key: "id" }], "views", { limit, search }),
      ["Use a viewId with read_cells to read data. Tip: moduleId itself works as the default viewId."],
    );
  });

  server.tool("show_lists", "List all dimensions (lists) in a model. List IDs are needed for get_list_items, add/update/delete_list_items, and large volume list reads.", {
    workspaceId: z.string().describe("Anaplan workspace ID or name"),
    modelId: z.string().describe("Anaplan model ID or name"),
    ...paginationParams,
  }, async ({ workspaceId, modelId, limit, search }) => {
    const wId = await resolver.resolveWorkspace(workspaceId);
    const mId = await resolver.resolveModel(wId, modelId);
    const lists = await apis.lists.list(wId, mId);
    return tableResult(lists, [{ header: "Name", key: "name" }, { header: "ID", key: "id" }], "dimensions", { limit, search });
  });

  server.tool("get_list_items", "Get items in a list. Use includeAll=true for subsets, properties, and selective access details. Returns item IDs for write_cells. For >1M items, use create_list_readrequest.", {
    workspaceId: z.string().describe("Anaplan workspace ID or name"),
    modelId: z.string().describe("Anaplan model ID or name"),
    listId: z.string().describe("Anaplan list ID or name"),
    includeAll: z.boolean().optional().describe("Include subsets, properties, and selective access details"),
    ...paginationParams,
  }, async ({ workspaceId, modelId, listId, includeAll, limit, search }) => {
    const wId = await resolver.resolveWorkspace(workspaceId);
    const mId = await resolver.resolveModel(wId, modelId);
    const lId = await resolver.resolveList(wId, mId, listId);
    const items = await apis.lists.getItems(wId, mId, lId, includeAll);
    const columns = [{ header: "Name", key: "name" }, { header: "Code", key: "code" }, { header: "ID", key: "id" }];
    if (includeAll) {
      columns.push({ header: "Parent", key: "parent" }, { header: "Subsets", key: "subsets" }, { header: "Properties", key: "properties" });
    }
    return tableResult(items, columns, "list items", { limit, search });
  });

  server.tool("show_imports", "List available import actions in a model. Use show_importdetails to see source file and mapping, then run_import to execute.", {
    workspaceId: z.string().describe("Anaplan workspace ID or name"),
    modelId: z.string().describe("Anaplan model ID or name"),
    ...paginationParams,
  }, async ({ workspaceId, modelId, limit, search }) => {
    const wId = await resolver.resolveWorkspace(workspaceId);
    const mId = await resolver.resolveModel(wId, modelId);
    const imports = await apis.imports.list(wId, mId);
    return tableResult(imports, [{ header: "Name", key: "name" }, { header: "Type", key: "importType" }, { header: "ID", key: "id" }], "imports", { limit, search });
  });

  server.tool("show_exports", "List available export actions. Use run_export to execute and download data in one step.", {
    workspaceId: z.string().describe("Anaplan workspace ID or name"),
    modelId: z.string().describe("Anaplan model ID or name"),
    ...paginationParams,
  }, async ({ workspaceId, modelId, limit, search }) => {
    const wId = await resolver.resolveWorkspace(workspaceId);
    const mId = await resolver.resolveModel(wId, modelId);
    const exports = await apis.exports.list(wId, mId);
    return tableResult(exports, [{ header: "Name", key: "name" }, { header: "Format", key: "exportFormat" }, { header: "ID", key: "id" }], "exports", { limit, search });
  });

  server.tool("show_processes", "List available processes (chained import/export actions). Use run_process to execute, then get_action_status to monitor.", {
    workspaceId: z.string().describe("Anaplan workspace ID or name"),
    modelId: z.string().describe("Anaplan model ID or name"),
    ...paginationParams,
  }, async ({ workspaceId, modelId, limit, search }) => {
    const wId = await resolver.resolveWorkspace(workspaceId);
    const mId = await resolver.resolveModel(wId, modelId);
    const processes = await apis.processes.list(wId, mId);
    return tableResult(processes, [{ header: "Name", key: "name" }, { header: "ID", key: "id" }], "processes", { limit, search });
  });

  server.tool("show_files", "List files in a model. File IDs are needed for upload_file (before run_import) and download_file.", {
    workspaceId: z.string().describe("Anaplan workspace ID or name"),
    modelId: z.string().describe("Anaplan model ID or name"),
    ...paginationParams,
  }, async ({ workspaceId, modelId, limit, search }) => {
    const wId = await resolver.resolveWorkspace(workspaceId);
    const mId = await resolver.resolveModel(wId, modelId);
    const files = await apis.files.list(wId, mId);
    return tableResult(files, [{ header: "Name", key: "name" }, { header: "Format", key: "format" }, { header: "ID", key: "id" }], "files", { limit, search });
  });

  server.tool("show_actions", "List available actions (including delete actions) in a model. Use run_delete to execute a delete action.", {
    workspaceId: z.string().describe("Anaplan workspace ID or name"),
    modelId: z.string().describe("Anaplan model ID or name"),
    ...paginationParams,
  }, async ({ workspaceId, modelId, limit, search }) => {
    const wId = await resolver.resolveWorkspace(workspaceId);
    const mId = await resolver.resolveModel(wId, modelId);
    const actions = await apis.actions.list(wId, mId);
    return tableResult(actions, [{ header: "Name", key: "name" }, { header: "Type", key: "actionType" }, { header: "ID", key: "id" }], "actions", { limit, search });
  });

  server.tool("show_viewdetails", "Get view dimension layout (rows, columns, pages). Dimension IDs from here are needed for write_cells and show_viewdimensionitems.", {
    workspaceId: z.string().describe("Anaplan workspace ID or name"),
    modelId: z.string().describe("Anaplan model ID or name"),
    moduleId: z.string().describe("Anaplan module ID or name"),
    viewId: z.string().describe("Saved view ID or name (from show_savedviews, or use moduleId as default view)"),
  }, async ({ workspaceId, modelId, moduleId, viewId }) => {
    const wId = await resolver.resolveWorkspace(workspaceId);
    const mId = await resolver.resolveModel(wId, modelId);
    const modId = await resolver.resolveModule(wId, mId, moduleId);
    const vId = await resolver.resolveView(wId, mId, modId, viewId);
    const view = await apis.transactional.getViewMetadata(mId, vId);

    const lines: string[] = [];
    lines.push(`**View:** ${view.viewName ?? vId}`);
    lines.push(`**View ID:** ${view.viewId ?? vId}`);
    lines.push("");

    const formatDimList = (label: string, dims: Array<{ id: string; name: string }>) => {
      if (!dims || dims.length === 0) {
        lines.push(`**${label}:** (none)`);
        return;
      }
      lines.push(`**${label}:**`);
      for (const dim of dims) {
        lines.push(`  - ${dim.name} (${dim.id})`);
      }
    };

    formatDimList("Rows", view.rows);
    formatDimList("Columns", view.columns);
    formatDimList("Pages", view.pages);

    return { content: [{ type: "text", text: lines.join("\n") }] };
  });

  server.tool("show_workspacedetails", "Get workspace discovery details including size and active status. A 404 does not rule out model access; use known workspace/model IDs with show_modeldetails or show_modules.", {
    workspaceId: z.string().describe("Anaplan workspace ID or name"),
    tenantDetails: z.boolean().optional().describe("Include workspace size and quota information"),
  }, async ({ workspaceId, tenantDetails }) => {
    const wId = await resolver.resolveWorkspace(workspaceId);
    try {
      const workspace = await apis.workspaces.get(wId, tenantDetails);
      return { content: [{ type: "text" as const, text: JSON.stringify(workspace, null, 2) }] };
    } catch (error) {
      return discoveryErrorResult(error);
    }
  });

  server.tool("show_allmodels", "List models visible to discovery across workspaces; models in other customer/tenants may be omitted. Filter by state param (PRODUCTION, UNLOCKED, etc). Use modelDetails=true for memory/dates. Known model IDs can be used directly even when absent here.", {
    state: z.enum(["UNLOCKED", "PRODUCTION", "ARCHIVED", "LOCKED", "MAINTENANCE", "PRODUCTION_MAINTENANCE"]).optional().describe("Filter by model state"),
    modelDetails: z.boolean().optional().describe("Include memory usage, creation date, and last modified"),
    ...paginationParams,
  }, async ({ state, modelDetails, limit, search }) => {
    let models = await apis.models.listAll(modelDetails);
    if (state) models = models.filter((m: any) => m.activeState === state);
    return withNextSteps(tableResult(models, [
      { header: "Name", key: "name" },
      { header: "ID", key: "id" },
      { header: "Workspace", key: "currentWorkspaceName" },
      { header: "State", key: "activeState" }, // This is Manchester United, we are talking about
    ], "models", { limit, search }), [DIRECT_MODEL_HINT]);
  });

  server.tool("show_modelstatus", "Check model status including memory usage and export progress.", {
    workspaceId: z.string().describe("Anaplan workspace ID or name"),
    modelId: z.string().describe("Anaplan model ID or name"),
  }, async ({ workspaceId, modelId }) => {
    const wId = await resolver.resolveWorkspace(workspaceId);
    const mId = await resolver.resolveModel(wId, modelId);
    const status = await apis.modelManagement.getStatus(wId, mId);
    return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
  });

  server.tool("show_listmetadata", "Get list metadata including properties, parent, and item count.", {
    workspaceId: z.string().describe("Anaplan workspace ID or name"),
    modelId: z.string().describe("Anaplan model ID or name"),
    listId: z.string().describe("List ID or name"),
  }, async ({ workspaceId, modelId, listId }) => {
    const wId = await resolver.resolveWorkspace(workspaceId);
    const mId = await resolver.resolveModel(wId, modelId);
    const lId = await resolver.resolveList(wId, mId, listId);
    const metadata = await apis.lists.getMetadata(wId, mId, lId);
    return { content: [{ type: "text", text: JSON.stringify(metadata, null, 2) }] };
  });

  server.tool("show_importdetails", "Get import definition metadata including source file and column mapping. Check this before run_import to understand the expected data format.", {
    workspaceId: z.string().describe("Anaplan workspace ID or name"),
    modelId: z.string().describe("Anaplan model ID or name"),
    importId: z.string().describe("Import ID or name"),
  }, async ({ workspaceId, modelId, importId }) => {
    const wId = await resolver.resolveWorkspace(workspaceId);
    const mId = await resolver.resolveModel(wId, modelId);
    const iId = await resolver.resolveImport(wId, mId, importId);
    const detail = await apis.imports.get(wId, mId, iId);
    return { content: [{ type: "text", text: JSON.stringify(detail, null, 2) }] };
  });

  server.tool("show_exportdetails", "Get export definition metadata including format and target.", {
    workspaceId: z.string().describe("Anaplan workspace ID or name"),
    modelId: z.string().describe("Anaplan model ID or name"),
    exportId: z.string().describe("Export ID or name"),
  }, async ({ workspaceId, modelId, exportId }) => {
    const wId = await resolver.resolveWorkspace(workspaceId);
    const mId = await resolver.resolveModel(wId, modelId);
    const eId = await resolver.resolveExport(wId, mId, exportId);
    const detail = await apis.exports.get(wId, mId, eId);
    return { content: [{ type: "text", text: JSON.stringify(detail, null, 2) }] };
  });

  server.tool("show_processdetails", "Get process definition metadata including the chain of import/export actions.", {
    workspaceId: z.string().describe("Anaplan workspace ID or name"),
    modelId: z.string().describe("Anaplan model ID or name"),
    processId: z.string().describe("Process ID or name"),
    showImportDataSource: z.boolean().optional().describe("Include import data source details for IMPORT actions"),
  }, async ({ workspaceId, modelId, processId, showImportDataSource }) => {
    const wId = await resolver.resolveWorkspace(workspaceId);
    const mId = await resolver.resolveModel(wId, modelId);
    const pId = await resolver.resolveProcess(wId, mId, processId);
    const detail = await apis.processes.get(wId, mId, pId, showImportDataSource ?? false);
    return { content: [{ type: "text", text: JSON.stringify(detail, null, 2) }] };
  });

  server.tool("show_actiondetails", "Get action definition metadata. Use run_delete to execute delete actions.", {
    workspaceId: z.string().describe("Anaplan workspace ID or name"),
    modelId: z.string().describe("Anaplan model ID or name"),
    actionId: z.string().describe("Action ID or name"),
  }, async ({ workspaceId, modelId, actionId }) => {
    const wId = await resolver.resolveWorkspace(workspaceId);
    const mId = await resolver.resolveModel(wId, modelId);
    const aId = await resolver.resolveAction(wId, mId, actionId);
    const detail = await apis.actions.get(wId, mId, aId);
    return { content: [{ type: "text", text: JSON.stringify(detail, null, 2) }] };
  });

  server.tool("show_allviews", "List all views in a model (cross-module, includes default and saved). Note: requires model ID (name resolution not supported).", {
    modelId: z.string().describe("Anaplan model ID (name resolution not supported -- use show_models to find the ID)"),
    includeSubsidiaryViews: z.boolean().optional().describe("Include unsaved subsidiary views in results"),
    ...paginationParams,
  }, async ({ modelId, includeSubsidiaryViews, limit, search }) => {
    const views = await apis.transactional.getAllViews(modelId, includeSubsidiaryViews);
    return tableResult(views, [
      { header: "Name", key: "name" },
      { header: "Module", key: "moduleName" },
      { header: "ID", key: "id" },
    ], "views", { limit, search });
  });

  server.tool("show_alllineitems", "List all line items in a model (cross-module). Note: requires model ID (name resolution not supported). Use includeAll=true for formulas and dimensions.", {
    modelId: z.string().describe("Anaplan model ID (name resolution not supported -- use show_models to find the ID)"),
    includeAll: z.boolean().optional().describe("Include full metadata (formula, format, version, appliesTo)"),
    ...paginationParams,
  }, async ({ modelId, includeAll, limit, search }) => {
    const items = await apis.transactional.getAllLineItems(modelId, includeAll ?? false);
    if (includeAll) {
      return tableResult(enrichLineItems(items), [
        { header: "Name", key: "name" },
        { header: "Module", key: "moduleName" },
        { header: "Formula", key: "formulaDisplay" },
        { header: "Format", key: "formatDisplay" },
        { header: "Applies To", key: "appliesToDisplay" },
        { header: "Version", key: "versionDisplay" },
        { header: "Notes", key: "notesDisplay" },
        { header: "Code", key: "codeDisplay" },
        { header: "ID", key: "id" },
      ], "line items", { limit, search });
    }
    return tableResult(items, [
      { header: "Name", key: "name" },
      { header: "Module", key: "moduleName" },
      { header: "ID", key: "id" },
    ], "line items", { limit, search });
  });

  server.tool("show_lineitem_dimensions", "List dimensions for a line item. Returns dimensionId values needed by write_cells and show_dimensionitems. Note: requires model ID (name resolution not supported).", {
    modelId: z.string().describe("Anaplan model ID (name resolution not supported -- use show_models to find the ID)"),
    lineItemId: z.string().describe("Line item ID (from show_lineitems or show_alllineitems)"),
  }, async ({ modelId, lineItemId }) => {
    const dims = await apis.transactional.getLineItemDimensions(modelId, lineItemId);
    return withNextSteps(
      tableResult(dims, [
        { header: "Name", key: "name" },
        { header: "ID", key: "id" },
      ], "dimensions"),
      ["Use show_dimensionitems with each dimensionId to get itemIds for write_cells."],
    );
  });

  server.tool("show_dimensionitems", "List all items in a dimension. Returns itemId values needed for write_cells dimension coordinates. Note: requires model ID (name resolution not supported).", {
    modelId: z.string().describe("Anaplan model ID (name resolution not supported -- use show_models to find the ID)"),
    dimensionId: z.string().describe("Dimension ID (from show_lineitem_dimensions or show_viewdetails)"),
    ...paginationParams,
  }, async ({ modelId, dimensionId, limit, search }) => {
    const items = await apis.dimensions.getAllItems(modelId, dimensionId);
    return tableResult(items, [
      { header: "Name", key: "name" },
      { header: "Code", key: "code" },
      { header: "ID", key: "id" },
    ], "dimension items", { limit, search });
  });

  server.tool("show_viewdimensionitems", "List items in a dimension as filtered by a view. Useful for understanding what data a view includes. Note: requires model ID (name resolution not supported).", {
    modelId: z.string().describe("Anaplan model ID (name resolution not supported -- use show_models to find the ID)"),
    viewId: z.string().describe("View ID (from show_savedviews, or use moduleId as default view)"),
    dimensionId: z.string().describe("Dimension ID (from show_lineitem_dimensions or show_viewdetails)"),
    ...paginationParams,
  }, async ({ modelId, viewId, dimensionId, limit, search }) => {
    const items = await apis.dimensions.getSelectedItems(modelId, viewId, dimensionId);
    return tableResult(items, [
      { header: "Name", key: "name" },
      { header: "Code", key: "code" },
      { header: "ID", key: "id" },
    ], "view dimension items", { limit, search });
  });

  server.tool("lookup_dimensionitems", "Look up dimension items by name or code to get their IDs. Useful for resolving human-readable names to itemIds before write_cells.", {
    workspaceId: z.string().describe("Anaplan workspace ID or name"),
    modelId: z.string().describe("Anaplan model ID or name"),
    dimensionId: z.string().describe("Dimension ID (from show_lineitem_dimensions or show_viewdetails)"),
    names: z.array(z.string()).optional().describe("Item names to look up"),
    codes: z.array(z.string()).optional().describe("Item codes to look up"),
  }, async ({ workspaceId, modelId, dimensionId, names, codes }) => {
    const wId = await resolver.resolveWorkspace(workspaceId);
    const mId = await resolver.resolveModel(wId, modelId);
    const items = await apis.dimensions.lookupByNameOrCode(wId, mId, dimensionId, names, codes);
    return tableResult(items, [
      { header: "Name", key: "name" },
      { header: "Code", key: "code" },
      { header: "ID", key: "id" },
    ], "matched items");
  });

  server.tool("show_lineitem_dimensions_items", "List dimension items for a specific line item's dimension. Combines show_lineitem_dimensions + show_dimensionitems in one call. Note: requires model ID (name resolution not supported).", {
    modelId: z.string().describe("Anaplan model ID (name resolution not supported -- use show_models to find the ID)"),
    lineItemId: z.string().describe("Line item ID (from show_lineitems or show_alllineitems)"),
    dimensionId: z.string().describe("Dimension ID (from show_lineitem_dimensions or show_viewdetails)"),
    ...paginationParams,
  }, async ({ modelId, lineItemId, dimensionId, limit, search }) => {
    const items = await apis.dimensions.getLineItemDimensionItems(modelId, lineItemId, dimensionId);
    return tableResult(items, [
      { header: "Name", key: "name" },
      { header: "Code", key: "code" },
      { header: "ID", key: "id" },
    ], "line item dimension items", { limit, search });
  });

  // Calendar
  server.tool("show_currentperiod", "Get current period for a model. Use set_currentperiod to change it.", {
    workspaceId: z.string().describe("Anaplan workspace ID or name"),
    modelId: z.string().describe("Anaplan model ID or name"),
  }, async ({ workspaceId, modelId }) => {
    const wId = await resolver.resolveWorkspace(workspaceId);
    const mId = await resolver.resolveModel(wId, modelId);
    const result = await apis.calendar.getCurrentPeriod(wId, mId);
    return { content: [{ type: "text" as const, text: JSON.stringify(result.currentPeriod ?? result, null, 2) }] };
  });

  server.tool("show_modelcalendar", "Get model calendar including fiscal year settings. Use set_fiscalyear to change the fiscal year.", {
    workspaceId: z.string().describe("Anaplan workspace ID or name"),
    modelId: z.string().describe("Anaplan model ID or name"),
  }, async ({ workspaceId, modelId }) => {
    const wId = await resolver.resolveWorkspace(workspaceId);
    const mId = await resolver.resolveModel(wId, modelId);
    const result = await apis.calendar.getModelCalendar(wId, mId);
    return { content: [{ type: "text" as const, text: JSON.stringify(result.modelCalendar ?? result, null, 2) }] };
  });

  // Versions
  server.tool("show_versions", "List version metadata (Current, Forecast, etc.) for a model. Version IDs are needed for set_versionswitchover. Note: requires model ID (name resolution not supported).", {
    modelId: z.string().describe("Anaplan model ID (name resolution not supported -- use show_models to find the ID)"),
    ...paginationParams,
  }, async ({ modelId, limit, search }) => {
    const versions = await apis.versions.list(modelId);
    return tableResult(versions, [
      { header: "Name", key: "name" },
      { header: "Current", key: "isCurrent" },
      { header: "Actual", key: "isActual" },
      { header: "ID", key: "id" },
    ], "versions", { limit, search });
  });

  // Users
  server.tool("show_currentuser", "Get current authenticated user info", {}, async () => {
    const user = await apis.users.getCurrentUser();
    const lines = [
      `**Name:** ${user.firstName} ${user.lastName}`,
      `**Email:** ${user.email}`,
      `**ID:** ${user.id}`,
      `**Active:** ${user.active}`,
      `**Last Login:** ${user.lastLoginDate ?? "N/A"}`,
    ];
    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  });

  server.tool("show_users", "List all users in the tenant", {
    sort: z.string().optional().describe("Sort field (e.g., '%2BemailAddress' for ascending email)"),
    ...paginationParams,
  }, async ({ sort, limit, search }) => {
    const users = await apis.users.list(sort);
    return tableResult(users, [
      { header: "Name", key: "firstName" },
      { header: "Email", key: "email" },
      { header: "Active", key: "active" },
      { header: "ID", key: "id" },
    ], "users", { limit, search });
  });

  server.tool("show_userdetails", "Get user details by ID", {
    userId: z.string().describe("Anaplan user ID"),
  }, async ({ userId }) => {
    const user = await apis.users.get(userId);
    return { content: [{ type: "text" as const, text: JSON.stringify(user, null, 2) }] };
  });

  // Task history (polymorphic)
  server.tool("show_tasks", "List task history for an import, export, process, or action. Returns taskIds for use with get_action_status, cancel_task, or download_importdump/download_processdump.", {
    workspaceId: z.string().describe("Anaplan workspace ID or name"),
    modelId: z.string().describe("Anaplan model ID or name"),
    actionType: z.enum(["imports", "exports", "processes", "actions"]).describe("Type of action"),
    actionId: z.string().describe("Action ID or name"),
    ...paginationParams,
  }, async ({ workspaceId, modelId, actionType, actionId, limit, search }) => {
    const wId = await resolver.resolveWorkspace(workspaceId);
    const mId = await resolver.resolveModel(wId, modelId);
    const resolveMap: Record<string, (wId: string, mId: string, name: string) => Promise<string>> = {
      imports: (w, m, n) => resolver.resolveImport(w, m, n),
      exports: (w, m, n) => resolver.resolveExport(w, m, n),
      processes: (w, m, n) => resolver.resolveProcess(w, m, n),
      actions: (w, m, n) => resolver.resolveAction(w, m, n),
    };
    const aId = await resolveMap[actionType](wId, mId, actionId);
    const apiMap: Record<string, { listTasks: (w: string, m: string, a: string) => Promise<any[]> }> = {
      imports: apis.imports,
      exports: apis.exports,
      processes: apis.processes,
      actions: apis.actions,
    };
    const tasks = await apiMap[actionType].listTasks(wId, mId, aId);
    return tableResult(tasks, [
      { header: "Task ID", key: "taskId" },
      { header: "State", key: "taskState" },
      { header: "Created", key: "creationTime" },
    ], "tasks", { limit, search });
  });
}
