import { Hono } from "@hono/hono";
import { env } from "@hono/hono/adapter";
import { MCPInstance, MCPState } from "./registry.ts";
import {
  findCompatibleApp,
  invoke,
  parseInvokeResponse,
  schemaFromAppName,
} from "./utils.ts";

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
  integrationId?: string | null;
}

export const StateBuilder = {
  build: (
    appName: string,
    installId: string,
    invokeApp: string,
    returnUrl?: string | null,
    redirectUri?: string | null,
    integrationId?: string | null,
  ) => {
    return encodeURIComponent(btoa(JSON.stringify({
      appName,
      installId,
      invokeApp,
      returnUrl,
      redirectUri,
      integrationId,
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

interface OAuthStartParams {
  appName: string;
  returnUrl?: string | null;
  integrationId?: string | null;
  installId: string;
  instance: MCPInstance;
  envVars: Record<string, unknown>;
  invoke: MCPState["Variables"]["invoke"];
}

// deno-lint-ignore no-explicit-any
export const startOAuth = async (params: OAuthStartParams): Promise<any> => {
  const { appName, installId, instance, returnUrl, envVars, integrationId } =
    params;

  const redirectUri = new URL(
    `/oauth/callback`,
    "https://mcp.deco.site",
  );

  const invokeApp = await findCompatibleApp(
    instance,
    OAUTH_START_LOADER,
  );

  if (!invokeApp) {
    const stateSchema = await schemaFromAppName(appName);
    if (stateSchema) {
      return {
        stateSchema,
      };
    }
    return null;
  }

  const oauthApp = getOAuthConfigForApp(appName);

  if (!oauthApp) {
    return null;
  }

  const clientId = envVars[oauthApp.clientIdKey];
  const scopes = oauthApp.scopes;

  const state = StateBuilder.build(
    appName,
    installId,
    invokeApp,
    returnUrl,
    redirectUri.href,
    integrationId,
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
    integrationId,
  };

  // deno-lint-ignore no-explicit-any
  return await params.invoke(oauthStartLoader, props as any);
};

export const withOAuth = (
  app: Hono<
    MCPState
  >,
) => {
  app.get("/oauth/start", async (c) => {
    const appName = c.var.appName;
    const installId = c.var.installId;
    const envVars = env(c);
    const url = new URL(c.req.url);
    const returnUrl = url.searchParams.get("returnUrl");
    const integrationId = url.searchParams.get("integrationId");

    const result = await startOAuth({
      returnUrl,
      appName,
      installId,
      instance: c.var.instance,
      integrationId,
      envVars,
      invoke: c.var.invoke,
    });

    if (!result) {
      return c.json({ error: "App not found" }, 404);
    }

    return parseInvokeResponse(result, c) ??
      new Response(null, { status: 204 });
  });
  app.get("/oauth/callback", async (c) => {
    console.log("[OAuth Callback] Iniciando callback");
    
    const urlObj = new URL(c.req.url);
    const queryParamsKeys = Array.from(urlObj.searchParams.keys());
    console.log("[OAuth Callback] Query params recebidos:", queryParamsKeys);
    
    // Log adicional para params específicos (sem valores sensíveis)
    const scopeParam = c.req.query("scope");
    const authUser = c.req.query("authuser");
    const errorParam = c.req.query("error");
    
    console.log("[OAuth Callback] Params adicionais:", {
      hasScope: !!scopeParam,
      scopeLength: scopeParam?.length,
      authUser,
      error: errorParam,
    });

    try {
      const state = c.req.query("state");

      if (!state) {
        console.error("[OAuth Callback] State não fornecido");
        return c.json({ error: "State is required" }, 400);
      }

      console.log("[OAuth Callback] Fazendo parse do state");

      let parsedState;
      try {
        parsedState = StateBuilder.parse(state);
        console.log("[OAuth Callback] State parseado:", {
          appName: parsedState.appName,
          installId: parsedState.installId,
          invokeApp: parsedState.invokeApp,
          hasReturnUrl: !!parsedState.returnUrl,
          integrationId: parsedState.integrationId,
        });
      } catch (parseError) {
        console.error("[OAuth Callback] Erro ao parsear state:", parseError);
        return c.json({ error: "Invalid state format" }, 400);
      }

      const {
        appName,
        installId,
        invokeApp,
        returnUrl,
        redirectUri,
        integrationId,
      } = parsedState;

      const envVars = env(c);
      const oauthApp = getOAuthConfigForApp(appName);

      if (!oauthApp) {
        console.error("[OAuth Callback] App OAuth não encontrado:", appName);
        return c.json({ error: `App ${appName} not found` }, 404);
      }

      console.log("[OAuth Callback] App OAuth encontrado:", appName);

      interface OAuthCallbackProps {
        installId: string;
        appName: string;
        code: string | undefined;
        state: string;
        returnUrl?: string | null;
        redirectUri?: string | null;
        integrationId?: string | null;
        clientId: string;
        clientSecret: string;
        queryParams?: Record<string, string | boolean | undefined>;
      }

      const code = c.req.query("code");
      const hasCode = !!code;
      console.log("[OAuth Callback] Code presente:", hasCode);

      const clientId = envVars[oauthApp.clientIdKey] as string;
      const clientSecret = envVars[oauthApp.clientSecretKey] as string;
      
      console.log("[OAuth Callback] Credenciais:", {
        hasClientId: !!clientId,
        clientIdLength: clientId?.length,
        hasClientSecret: !!clientSecret,
        clientSecretLength: clientSecret?.length,
        clientSecretPrefix: clientSecret ? clientSecret.substring(0, 12) : undefined,
      });

      const oauthCallbackAction = `${invokeApp}${OAUTH_CALLBACK_ACTION}`;
      const props: OAuthCallbackProps = {
        installId,
        appName,
        code,
        state,
        returnUrl,
        redirectUri,
        integrationId,
        clientId,
        clientSecret,
        queryParams: {
          savePermission: c.req.query("savePermission") === "true" ? true : false,
          continue: c.req.query("continue") === "true" ? true : false,
          permissions: c.req.query("permissions") ?? undefined,
        },
      };

      console.log("[OAuth Callback] Invocando action:", oauthCallbackAction);

      let response;
      try {
        response = await invoke(oauthCallbackAction, props, c);
        console.log("[OAuth Callback] Action executada:", {
          status: response?.status,
          statusText: response?.statusText,
          hasResponse: !!response,
          contentType: response?.headers.get("content-type"),
        });
      } catch (invokeError) {
        console.error("[OAuth Callback] Erro ao invocar action:", {
          error: invokeError instanceof Error ? invokeError.message : String(invokeError),
          stack: invokeError instanceof Error ? invokeError.stack : undefined,
        });
        throw invokeError;
      }

      // Verifica se a response indica erro
      if (response && !response.ok) {
        console.error("[OAuth Callback] Response com erro:", {
          status: response.status,
          statusText: response.statusText,
        });
        
        try {
          const errorText = await response.text();
          console.error("[OAuth Callback] Corpo do erro:", errorText.substring(0, 500));
        } catch (_e) {
          console.error("[OAuth Callback] Não foi possível ler corpo do erro");
        }
      }

      const isHtml = response?.headers.get("content-type")?.includes("text/html");

      if (response && returnUrl && !isHtml) {
        console.log("[OAuth Callback] Preparando redirect");
        
        let jsonData;
        try {
          jsonData = await response.json();
          console.log("[OAuth Callback] Dados da resposta:", {
            hasInstallId: !!jsonData?.installId,
            hasName: !!jsonData?.name,
            hasAccount: !!jsonData?.account,
          });
        } catch (jsonError) {
          console.error("[OAuth Callback] Erro ao parsear JSON da resposta:", {
            error: jsonError instanceof Error ? jsonError.message : String(jsonError),
          });
          throw jsonError;
        }

        const { installId: respInstallId, name, account } = jsonData;
        const thisUrl = new URL(c.req.url);
        thisUrl.protocol = "https:";
        if (thisUrl.hostname === "localhost") {
          thisUrl.protocol = "http:";
        }

        const url = new URL(returnUrl);
        url.searchParams.set("appName", appName);
        url.searchParams.set("installId", respInstallId);
        integrationId && url.searchParams.set("integrationId", integrationId);
        url.searchParams.set(
          "mcpUrl",
          new URL(`/apps/${appName}/${respInstallId}/mcp/messages`, thisUrl.origin)
            .href,
        );
        name && url.searchParams.set("name", name);
        account && url.searchParams.set("account", account);

        console.log("[OAuth Callback] Redirecionando para returnUrl");
        return c.redirect(url.toString());
      }

      if (!response) {
        console.log("[OAuth Callback] Sem response - retornando página de sucesso");
        return c.html(
          "<html><body>Success! You may close this window.</body></html>",
        );
      }

      console.log("[OAuth Callback] Retornando response original");
      return response;
    } catch (error) {
      console.error("[OAuth Callback] ERRO:", {
        tipo: error?.constructor?.name,
        mensagem: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      
      return c.json({
        error: "OAuth callback failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }, 500);
    }
  });
};
