import { fromJSON } from "@deco/deco/engine";
import { Deco, DecoOptions } from "@deco/deco";
import { installStorage } from "site/apps/site.ts";
import manifest, { Manifest } from "site/manifest.gen.ts";
import { mcpServer } from "@deco/mcp";
import { LRUCache } from "lru-cache";
import { bindings as HTMX } from "@deco/deco/htmx";
import { Layout } from "./_app.tsx";
import { middlewaresFor } from "site/middleware.ts";

export interface MCPInstance {
  deco: Deco<Manifest>;
}

const contexts = new LRUCache<string, Promise<MCPInstance>>({
  max: 100,
  ttl: 1000 * 60 * 60,
  updateAgeOnGet: true,
});

export interface MCPInstanceOptions {
  installId?: string;
  appName?: string;
  bindings?: DecoOptions<Manifest>["bindings"];
}

export const decoInstance = async (
  { installId, appName, bindings }: MCPInstanceOptions,
): Promise<MCPInstance | undefined> => {
  let decofile: DecoOptions["decofile"] | undefined = undefined;

  if (!installId) {
    installId = "default";
  } else {
    const form = await installStorage.getItem(installId);
    if (!form) {
      return undefined;
    }
    decofile = fromJSON(form as Record<string, unknown>);
  }

  const basePath = appName && installId
    ? `/apps/${appName}/${installId}`
    : undefined;

  let instance = contexts.get(installId);
  if (!instance) {
    instance = Deco.init<Manifest>({
      manifest,
      decofile,
      bindings: {
        ...bindings ?? {},
        useServer: (deco, hono) => {
          hono.use(
            "/*",
            mcpServer(
              deco,
              appName && installId
                ? {
                  middlewares: middlewaresFor({ appName, installId }),
                  basePath,
                }
                : {
                  include: [
                    "site/loaders/mcps/search.ts" as const,
                    "site/actions/mcps/configure.ts" as const,
                    "site/actions/mcps/check.ts" as const,
                  ],
                },
            ),
          ); // some type errors may occur
        },
      },
    }).then((deco) => ({
      deco,
    }));
    contexts.set(installId, instance);
  }

  return instance;
};

export const cleanInstance = (installId: string) => {
  contexts.delete(installId);
};

export const { deco: MCP_REGISTRY } = (await decoInstance({
  bindings: HTMX<Manifest>({
    Layout,
  }),
}))!;
