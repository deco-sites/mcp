import { Hono } from "@hono/hono";
import { env } from "@hono/hono/adapter";
import { MCPState } from "./registry.ts";
import { findCompatibleApp, invoke } from "./utils.ts";

const OAUTH_START_LOADER = "/loaders/oauth/start.ts";
const OAUTH_CALLBACK_ACTION = "/actions/oauth/callback.ts";

interface StateProvider {
  original_state?: string;
  code_verifier?: string;
}
interface State {
  appName: string;
  installId: string;
  invokeApp: string;
  returnUrl?: string | null;
  redirectUri?: string | null;
}

export const StateBuilder = {
  build: (
    appName: string,
    installId: string,
    invokeApp: string,
    returnUrl?: string | null,
    redirectUri?: string | null,
  ) => {
    return encodeURIComponent(btoa(JSON.stringify({
      appName,
      installId,
      invokeApp,
      returnUrl,
      redirectUri,
    })));
  },
  parse: (state: string): State & StateProvider => {
    const decoded = atob(decodeURIComponent(state));
    const parsed = JSON.parse(decoded) as State & StateProvider;

    if (parsed.original_state) {
      return StateBuilder.parse(parsed.original_state);
    }

    return parsed;
  },
};

interface WellKnownOAuthApps {
  [key: string]: {
    clientIdKey: string;
    clientSecretKey: string;
    scopes?: string;
  };
}

const WELL_KNOWN_OAUTH_APPS: WellKnownOAuthApps = {
  "github": {
    clientIdKey: "OAUTH_CLIENT_ID_GITHUB",
    clientSecretKey: "OAUTH_CLIENT_SECRET_GITHUB",
  },
  "google": {
    clientIdKey: "OAUTH_CLIENT_ID_GOOGLE",
    clientSecretKey: "OAUTH_CLIENT_SECRET_GOOGLE",
  },
  "airtable": {
    clientIdKey: "OAUTH_CLIENT_ID_AIRTABLE",
    clientSecretKey: "OAUTH_CLIENT_SECRET_AIRTABLE",
  },
  "slack": {
    clientIdKey: "OAUTH_CLIENT_ID_SLACK",
    clientSecretKey: "OAUTH_CLIENT_SECRET_SLACK",
  },
  "spotify": {
    clientIdKey: "SPOTIFY_CLIENT_ID",
    clientSecretKey: "SPOTIFY_CLIENT_SECRET",
  },
};

const extractProviderFromAppName = (appName: string): string | null => {
  const normalizedName = appName?.toLowerCase();
  const knownProviders = Object.keys(WELL_KNOWN_OAUTH_APPS);

  if (knownProviders.includes(normalizedName)) {
    return normalizedName;
  }

  for (const provider of knownProviders) {
    if (normalizedName?.startsWith(provider)) {
      const afterProvider = normalizedName.substring(provider.length);
      const hasSeparator = afterProvider?.startsWith("-") ||
        afterProvider?.startsWith("_");
      const hasUppercase = /^[A-Z]/.test(appName?.substring(provider.length));

      if (afterProvider === "" || hasSeparator || hasUppercase) {
        return provider;
      }
    }
  }

  return null;
};

const getOAuthConfigForApp = (appName: string) => {
  const provider = extractProviderFromAppName(appName);
  return provider ? WELL_KNOWN_OAUTH_APPS[provider] : null;
};

export const withOAuth = (
  app: Hono<
    MCPState
  >,
) => {
  app.get("/oauth/start", async (c) => {
    const appName = c.var.appName;
    const installId = c.var.installId;

    const reqUrl = new URL(c.req.url);
    const redirectUri = new URL(
      `/oauth/callback`,
      c.req.url,
    );

    redirectUri.protocol = "https:";

    const returnUrl = reqUrl.searchParams.get("returnUrl");
    const invokeApp = await findCompatibleApp(
      c.var.instance,
      OAUTH_START_LOADER,
    );

    if (!invokeApp) {
      return c.json({ error: "App not found" }, 404);
    }

    const envVars = env(c);
    const oauthApp = getOAuthConfigForApp(appName);

    if (!oauthApp) {
      return c.json({ error: `App ${appName} not supported` }, 404);
    }

    const clientId = envVars[oauthApp.clientIdKey];
    const scopes = oauthApp.scopes;

    const state = StateBuilder.build(
      appName,
      installId,
      invokeApp,
      returnUrl,
      redirectUri.href,
    );
    const oauthStartLoader = `${invokeApp}${OAUTH_START_LOADER}`;
    const props = {
      installId,
      appName,
      redirectUri,
      state,
      returnUrl,
      clientId,
      scopes,
    };

    return await invoke(oauthStartLoader, props, c) ??
      new Response(null, { status: 204 });
  });
  app.get("/oauth/callback", async (c) => {
    const state = c.req.query("state");

    if (!state) {
      return c.json({ error: "State is required" }, 400);
    }

    const { appName, installId, invokeApp, returnUrl, redirectUri } =
      StateBuilder.parse(
        state,
      );

    const envVars = env(c);

    const oauthApp = getOAuthConfigForApp(appName);

    if (!oauthApp) {
      return c.json({ error: `App ${appName} not found` }, 404);
    }
    interface OAuthCallbackProps {
      installId: string;
      appName: string;
      code: string | undefined;
      state: string;
      returnUrl?: string | null;
      redirectUri?: string | null;
      clientId: string;
      clientSecret: string;
      queryParams?: Record<string, string | boolean | undefined>;
    }

    const oauthCallbackAction = `${invokeApp}${OAUTH_CALLBACK_ACTION}`;
    const props: OAuthCallbackProps = {
      installId,
      appName,
      code: c.req.query("code"),
      state,
      returnUrl,
      redirectUri,
      clientId: envVars[oauthApp.clientIdKey] as string,
      clientSecret: envVars[oauthApp.clientSecretKey] as string,
      queryParams: {
        savePermission: c.req.query("savePermission") === "true" ? true : false,
        continue: c.req.query("continue") === "true" ? true : false,
        permissions: c.req.query("permissions") ?? undefined,
      },
    };

    const response = await invoke(oauthCallbackAction, props, c);
    const isHtml = response?.headers.get("content-type")?.includes("text/html");

    if (response && returnUrl && !isHtml) {
      const { installId, name, account } = await response.json();
      const thisUrl = new URL(c.req.url);
      thisUrl.protocol = "https:";
      if (thisUrl.hostname === "localhost") {
        thisUrl.protocol = "http:";
      }
      const url = new URL(returnUrl);
      url.searchParams.set("appName", appName);
      url.searchParams.set("installId", installId);
      url.searchParams.set(
        "mcpUrl",
        new URL(`/apps/${appName}/${installId}/mcp/messages`, thisUrl.origin)
          .href,
      );
      name && url.searchParams.set("name", name);
      account && url.searchParams.set("account", account);
      return c.redirect(url.toString());
    }

    if (!response) {
      return c.html(
        "<html><body>Success! You may close this window.</body></html>",
      );
    }
    return response;
  });
};
