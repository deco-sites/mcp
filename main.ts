import { Context } from "@deco/deco";
import { Hono } from "@hono/hono";
import { decoInstance, MCP_REGISTRY } from "./registry.ts";

const app = new Hono();
const envPort = Deno.env.get("PORT");

const APPS_INSTALL_URL = new URLPattern({
  pathname: "/apps/:appName/:installId/*",
});
app.use("/*", async (ctx) => {
  const url = new URL(ctx.req.url);
  const match = APPS_INSTALL_URL.exec({ pathname: url.pathname });

  const installId = url.searchParams.get("installId") ??
    match?.pathname?.groups?.installId;
  const appName = url.searchParams.get("appName") ??
    match?.pathname?.groups?.appName;
  if (installId && appName) {
    const instance = await decoInstance({ installId, appName });
    if (!instance) {
      return ctx.res = await ctx.notFound();
    }
    const run = Context.bind(instance.deco.ctx, async () => {
      return await instance.deco.fetch(ctx.req.raw);
    });
    return run();
  }
  return ctx.res = await MCP_REGISTRY.fetch(ctx.req.raw);
});

Deno.serve({ handler: app.fetch, port: envPort ? +envPort : 8000 });
