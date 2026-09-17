import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthManager } from "../auth/manager.js";
import { createServer } from "../server.js";

const workspaceId = "11111111111111111111111111111111";
const modelId = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const modelPath = `/models/${modelId}`;
const scopedPath = `/workspaces/${workspaceId}/models/${modelId}`;

describe("exploration across discovery boundaries", () => {
  let server: McpServer;
  let client: Client;
  let routes: Map<string, { status?: number; body: unknown }>;

  beforeEach(async () => {
    routes = new Map();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
      expect(options?.method).toBe("GET");
      const route = routes.get(String(url).replace("https://api.anaplan.com/2/0", ""));
      if (!route) throw new Error(`Unexpected request: ${url}`);
      return new Response(JSON.stringify(route.body), { status: route.status ?? 200 });
    });
    server = createServer({
      getAuthHeaders: async () => ({ Authorization: "AnaplanAuthToken test" }),
    } as unknown as AuthManager);
    client = new Client({ name: "exploration-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
    vi.restoreAllMocks();
  });

  async function call(name: string, args: Record<string, unknown> = { workspaceId, modelId }) {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as Array<{ type: string; text?: string }>;
    return { isError: result.isError, text: content.map((item) => item.text ?? "").join("\n") };
  }

  function hideModelMetadata() {
    routes.set(modelPath, { status: 404, body: { status: { code: 404, message: "Not found" } } });
  }

  it("preserves normal model details and does not probe when metadata is available", async () => {
    routes.set(`${modelPath}?modelDetails=true`, { body: { model: {
      id: modelId, name: "Known model", activeState: "UNLOCKED", currentWorkspaceId: workspaceId,
    } } });

    const result = await call("show_modeldetails", { workspaceId, modelId, modelDetails: true });

    expect(result.isError).not.toBe(true);
    expect(result.text).toContain("Known model");
    expect(result.text).toContain("UNLOCKED");
    expect(result.text).not.toContain("metadata unavailable");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("verifies scoped model access after a metadata 404 without querying discovery lists", async () => {
    hideModelMetadata();
    routes.set(`${scopedPath}/modules`, { body: { modules: [{ id: "1" }, { id: "2" }] } });
    routes.set(`${scopedPath}/imports`, { body: { imports: [{ id: "3" }] } });

    const result = await call("show_modeldetails");

    expect(result.isError).not.toBe(true);
    expect(result.text).toContain("Read-only model access confirmed");
    expect(result.text).toContain("Model discovery metadata unavailable");
    expect(result.text).toContain("Name, state, size, and other model details are unavailable");
    expect(result.text).toContain(modelId);
    expect(result.text).toContain(workspaceId);
    expect(result.text).toContain("modules | Accessible | 2");
    expect(result.text).toContain("imports | Accessible | 1");
    expect(result.text).toContain("does not establish permission");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it.each(["modules", "imports"])("accepts an empty successful %s listing while reporting the other check's error", async (resource) => {
    hideModelMetadata();
    const other = resource === "modules" ? "imports" : "modules";
    routes.set(`${scopedPath}/${resource}`, { body: { [resource]: [] } });
    routes.set(`${scopedPath}/${other}`, { status: 403, body: { message: "Forbidden" } });

    const result = await call("show_modeldetails");

    expect(result.isError).not.toBe(true);
    expect(result.text).toContain(`${resource} | Accessible | 0`);
    expect(result.text).toContain(`${other} | Not verified |  | Anaplan API error (403)`);
    expect(result.text).toContain("Read-only model access confirmed");
  });

  it("returns an error with both probe failures when direct access cannot be verified", async () => {
    hideModelMetadata();
    routes.set(`${scopedPath}/modules`, { status: 404, body: { message: "Modules not found" } });
    routes.set(`${scopedPath}/imports`, { status: 403, body: { message: "Imports forbidden" } });

    const result = await call("show_modeldetails");

    expect(result.isError).toBe(true);
    expect(result.text).toContain("Direct model access could not be verified");
    expect(result.text).toContain("Modules not found");
    expect(result.text).toContain("Imports forbidden");
    expect(result.text).not.toContain("Read-only model access confirmed");
  });

  it.each([401, 403, 400])("does not fall back on metadata HTTP %i", async (status) => {
    routes.set(modelPath, { status, body: { message: "Original failure" } });

    const result = await call("show_modeldetails");

    expect(result.isError).toBe(true);
    expect(result.text).toContain(`Anaplan API error (${status}): Original failure`);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not mistake text containing 404 for an HTTP discovery error", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Connection failure 404"));

    const result = await call("show_modeldetails");

    expect(result.isError).toBe(true);
    expect(result.text).toContain("Connection failure 404");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["modules", "imports"])("allows show_%s with explicit IDs without any discovery preflight", async (resource) => {
    routes.set(`${scopedPath}/${resource}`, { body: { [resource]: [{ id: "123", name: "Scoped resource" }] } });

    const result = await call(`show_${resource}`);

    expect(result.isError).not.toBe(true);
    expect(result.text).toContain("Scoped resource");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["show_models", `/workspaces/${workspaceId}/models`],
    ["show_workspacedetails", `/workspaces/${workspaceId}`],
  ])("keeps %s discovery failures as errors and offers the direct-ID path", async (tool, path) => {
    routes.set(path, { status: 404, body: { message: "Not found" } });

    const result = await call(tool, { workspaceId });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("Anaplan API error (404)");
    expect(result.text).toContain("show_modeldetails");
    expect(result.text).toContain("A discovery 404 alone does not prove model access is denied");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["show_workspaces", "/workspaces", "workspaces"],
    ["show_allmodels", "/models", "models"],
  ])("warns that %s results are not a complete access inventory", async (tool, path, key) => {
    routes.set(path, { body: { [key]: [] } });

    const result = await call(tool, {});

    expect(result.isError).not.toBe(true);
    expect(result.text).toContain(`No ${key} found.`);
    expect(result.text).toContain("Discovery may omit accessible models");
    expect(result.text).toContain("IDs after /workspaces/ and /models/");
    const advertised = new Set((await client.listTools()).tools.map((tool) => tool.name));
    for (const suggested of result.text.match(/\bshow_[a-z_]+\b/g) ?? []) {
      expect(advertised.has(suggested), `Suggested tool ${suggested} must be available`).toBe(true);
    }
  });
});
