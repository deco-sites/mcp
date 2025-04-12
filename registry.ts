import { fromJSON } from "@deco/deco/engine";
import { buildImportMap, Deco, DecoOptions } from "@deco/deco";
import { installStorage } from "./apps/site.ts";
import manifest, { Manifest } from "./manifest.gen.ts";
import { mcpServer } from "@deco/mcp";
import { LRUCache } from "lru-cache";
import { bindings as HTMX } from "@deco/deco/htmx";
import { Layout } from "./_app.tsx";
import { middlewaresFor } from "./middleware.ts";
import { parseArgs } from "jsr:@std/cli/parse-args";
import { basename, dirname } from "jsr:@std/path";

const flags = parseArgs(Deno.args, {
  string: ["apps"],
});

let importMap: ReturnType<typeof buildImportMap> | undefined = undefined;
if (flags.apps) {
  importMap = buildImportMap(manifest);
  const appPaths = flags.apps.split(",");
  for (const appPath of appPaths) {
    console.log("[importing]:", appPath);
    const appName = basename(dirname(appPath));
    const appFile = `file://${appPath}`;
    const appMod = await import(appFile);
    const appTsName = `site/apps/deco/${appName}.ts`;
    importMap.imports[appTsName] = appFile;
    // @ts-ignore: This is a hack to get the app module into the manifest
    manifest.apps[appTsName] = appMod;
  }
}

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
    ? `/apps/${encodeURIComponent(appName)}/${installId}`
    : undefined;

  let instance = contexts.get(installId);
  if (!instance) {
    instance = Deco.init<Manifest>({
      manifest,
      importMap,
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
