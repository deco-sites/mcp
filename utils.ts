// deno-lint-ignore-file no-explicit-any
import { Context } from "@deco/deco";
import { getTools } from "@deco/mcp";
import { Context as HonoContext } from "@hono/hono";
import { MCPInstance, MCPState } from "./registry.ts";

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

export const invoke = async (
  key: string,
  props: any,
  c: HonoContext<MCPState>,
): Promise<Response | null> => {
  const response: unknown = await c.var.invoke(key, props);
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
