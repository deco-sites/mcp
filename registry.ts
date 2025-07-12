// deno-lint-ignore-file no-explicit-any
import { buildImportMap, Deco, DecoOptions, DecoRouteState } from "@deco/deco";
import { fromJSON } from "@deco/deco/engine";
import { bindings as HTMX } from "@deco/deco/htmx";
import { mcpServer } from "@deco/mcp";
import { Context, Hono } from "@hono/hono";
import { parseArgs } from "jsr:@std/cli/parse-args";
import { walk } from "jsr:@std/fs";
import { basename, relative } from "jsr:@std/path";
import { Layout } from "./_app.tsx";
import { appStorage, installStorage } from "./apps/site.ts";
import { withChannelHooks } from "./channels.ts";
import manifest, { Manifest } from "./manifest.gen.ts";
import { middlewaresFor } from "./middleware.ts";
import { withOAuth } from "./oauth.ts";

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

export interface MCPInstanceOptions {
  isInstallIdFromHeader?: boolean;
  installId?: string;
  appName?: string;
  bindings?: DecoOptions<Manifest>["bindings"];
}

const configure = manifest["actions"]["site/actions/mcps/configure.ts"].default;

export interface MCPState extends DecoRouteState<any> {
  Variables: DecoRouteState<any>["Variables"] & {
    installId: string;
    appName: string;
    instance: MCPInstance;
  };
}

export const { deco: MCP_REGISTRY } = (await decoInstance({
  bindings: HTMX<Manifest>({
    Layout,
    staticRoot: flags["static-root"],
  }),
}))!;

export async function decoInstance(
  { installId, appName, bindings, isInstallIdFromHeader }: MCPInstanceOptions,
): Promise<MCPInstance | undefined> {
  let decofile: DecoOptions["decofile"] | undefined = undefined;

  let form = null;
  if (installId) {
    form = await installStorage.getItem(installId);
    if (form == null) {
      await configure({
        id: appName!,
        installId,
        props: {},
      });
      form = await installStorage.getItem(installId);
    }
  }

  decofile = form ? fromJSON(form as Record<string, unknown>) : undefined;

  const basePath = appName && installId
    ? `/apps/${encodeURIComponent(appName)}${
      isInstallIdFromHeader ? "" : `/${installId}`
    }`
    : undefined;

  installId ??= "default";
  const instance = Deco.init<Manifest>({
    manifest,
    importMap,
    decofile,
    bindings: {
      ...bindings ?? {},
      useServer: (deco, hono) => {
        // sets default parameters
        hono.use("/*", async (_c, next) => {
          const c = _c as unknown as Context<MCPState>;
          c.set("installId", installId);
          appName && c.set("appName", appName);
          const mInstance = await instance;
          mInstance && c.set("instance", mInstance);

          const global = (c.var.global ?? {}) as Record<string, unknown>;
          global.installId = installId;
          global.appName = appName;
          if (appName) {
            global.appStorage = appStorage(appName);
          }
          global.configure = (props: Record<string, unknown>) =>
            configure({
              id: appName!,
              installId,
              props,
            });
          global.getConfiguration = async (installId?: string) => {
            if (!appName) {
              return {};
            }
            let currentForm = form;
            if (installId) {
              currentForm = await installStorage.getItem(installId);
            }
            const { [appName]: config } = currentForm as any ??
              {};
            const { __resolveType: _, ...props } = config ?? {};
            return props;
          };
          c.set("global", global);
          await next();
        });

        const mcp = hono as unknown as Hono<
          MCPState
        >;
        withChannelHooks(
          mcp,
        );
        withOAuth(
          mcp,
        );
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

  return instance;
}
