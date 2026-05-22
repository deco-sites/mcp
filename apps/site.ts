import { type App, type AppContext as AC } from "@deco/deco";
import { default as website, Props as WebsiteProps } from "apps/website/mod.ts";
import manifest, { Manifest } from "../manifest.gen.ts";

export interface Storage {
  getItem<T = unknown>(key: string): Promise<T | null>;
  setItem<T = unknown>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export interface State {
  installStorage: Storage;
}
const connectionUrl = Deno.env.get("DENO_KV_CONNECTION_URL");
const kv = await Deno.openKv?.(connectionUrl);

export const installStorage: Storage = {
  async getItem<T>(key: string) {
    const result = await kv.get<T>(["storage", key]);
    return result.value;
  },
  async setItem<T>(key: string, value: T) {
    await kv.set(["storage", key], value);

    return Promise.resolve();
  },
  async removeItem(key: string) {
    await kv.delete(["storage", key]);

    return Promise.resolve();
  },
};

export const appStorage: (appName: string) => Storage = (appName) => ({
  async getItem<T>(key: string) {
    const result = await kv.get<T>(["appstorage", appName, key]);
    return result.value;
  },
  async setItem<T>(key: string, value: T) {
    await kv.set(["appstorage", appName, key], value);

    return Promise.resolve();
  },
  async removeItem(key: string) {
    await kv.delete(["appstorage", appName, key]);

    return Promise.resolve();
  },
});
/**
 * @name main
 * @internal true
 * @title Site
 * @description Start your site from a template or from scratch.
 * @category Tool
 * @logo https://decoims.com/mcp/b17280d9-5972-4468-8d0c-76d9842e4ffe/0ac02239_0ac02239-61e6-4289-8a36-e78c0975bcc8.png
 */
export default function Site(props: WebsiteProps): App<Manifest, State> {
  return {
    state: { installStorage },
    manifest,
    dependencies: [website(props)],
  };
}
export type SiteApp = ReturnType<typeof Site>;
export type AppContext = AC<SiteApp>;
