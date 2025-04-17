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
import { basename, relative } from "jsr:@std/path";
import { walk } from "jsr:@std/fs";

const flags = parseArgs(Deno.args, {
  string: ["apps", "static-root"],
});

const isExportDefaultClass = (value: unknown | { default: unknown }) => {
  return typeof value === "object" && value && "default" in value &&
    value.default?.toString().substring(0, 5) === "class";
};
let importMap: ReturnType<typeof buildImportMap> | undefined = undefined;

const registerAppModule = async (
  appTsName: string,
  appFile: string,
) => {
  const appMod = await import(appFile);
  if (isExportDefaultClass(appMod)) {
    importMap!.imports[appTsName] = appFile;
    // @ts-ignore: This is a hack to get the app module into the manifest
    manifest.apps[appTsName] = appMod;
  }
};

if (flags.apps) {
  importMap = buildImportMap(manifest);
  const appPaths = flags.apps.split(",");
  for (const appPath of appPaths) {
    const stat = await Deno.stat(appPath);
    if (stat.isDirectory) {
      for await (
        const entry of walk(appPath, {
          exts: [".ts", ".tsx"],
          includeDirs: false,
        })
      ) {
        const relPath = relative(appPath, entry.path);
        const appTsName = `site/apps/deco/${relPath}`;
        const appFile = `file://${entry.path}`;
        await registerAppModule(appTsName, appFile);
      }
    } else {
      const relPath = basename(appPath);
      const appTsName = `site/apps/deco/${relPath}`;
      const appFile = `file://${appPath}`;
      await registerAppModule(appTsName, appFile);
    }
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
    staticRoot: flags["static-root"],
  }),
}))!;
