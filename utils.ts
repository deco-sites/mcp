// deno-lint-ignore-file no-explicit-any
import { Context } from "@deco/deco";
import { getTools } from "@deco/mcp";
import { Context as HonoContext } from "@hono/hono";
import { MCP_REGISTRY, MCPInstance, MCPState } from "./registry.ts";
import type { MCP } from "./loaders/mcps/search.ts";

export const listFromDeco = async () => {
  const names = new Map<string, string>();
  const schemas = await MCP_REGISTRY?.meta();

  const tools = getTools(
    names,
    schemas?.value.schema,
    { blocks: ["apps"] },
    schemas?.value?.manifest?.blocks?.apps,
  );

  const list = tools.filter((t) =>
    t.name !== "site-apps-deco-htmx-ts" && t.name !== "JS_BUNDLER"
  ) as MCP[];

  return list;
};

export const schemaFromAppName = async (appName: string) => {
  const deco = await listFromDeco();
  const schema = deco.find((d) => d.name === appName)?.inputSchema;
  return schema;
};

export const findCompatibleApp = async (
  instance: MCPInstance,
  blockSuffix: string,
) => {
  const names = new Map<string, string>();
  const run = Context.bind(instance.deco.ctx, async () => {
    return await instance.deco.meta();
  });
  const schemas = await run();

  const tools = getTools(
    names,
    schemas?.value.schema,
    { blocks: ["actions", "loaders"] },
    schemas?.value?.manifest?.blocks?.apps,
  );

  const action = tools.find((t) => t.resolveType.endsWith(blockSuffix)) as
    | { resolveType: string }
    | undefined;

  return action
    ? action.resolveType.substring(
      0,
      action.resolveType.length - blockSuffix.length,
    )
    : undefined;
};

export const parseInvokeResponse = (
  response: unknown,
  c: HonoContext<MCPState>,
) => {
  if (response instanceof Response) {
    return response;
  }

  if (typeof response === "string") {
    return c.text(response);
  }

  if (typeof response === "object") {
    return c.json(response);
  }
  return null;
};
export const invoke = async (
  key: string,
  props: any,
  c: HonoContext<MCPState>,
): Promise<Response | null> => {
  const response: unknown = await c.var.invoke(key, props);
  return parseInvokeResponse(response, c);
};
