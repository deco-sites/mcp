// deno-lint-ignore-file no-explicit-any
import { CallToolMiddleware, ListToolsMiddleware, Tool } from "@deco/mcp";
import checkConfiguration from "./actions/mcps/check.ts";
import configure from "./actions/mcps/configure.ts";
import searchMCPs from "./loaders/mcps/search.ts";
import { startOAuth } from "./oauth.ts";
import { MCPInstance, MCPState } from "./registry.ts";

export interface MiddlewareOptions {
  appName: string;
  installId: string;
  instance: Promise<MCPInstance>;
}
const CHECK_CONFIGURATION_TOOL = "CONFIGURATION_CHECK";
const CONFIGURE_MCP_TOOL = "CONFIGURE";
const OAUTH_START_TOOL = "DECO_CHAT_OAUTH_START";

const OAUTH_TOOL: Tool = {
  name: OAUTH_START_TOOL,
  description: "Start the OAuth flow for the given app",
  inputSchema: {
    type: "object",
    properties: {
      appName: { type: "string" },
      installId: { type: "string" },
      returnUrl: { type: "string" },
      integrationId: { type: "string" },
    },
    required: [],
    additionalProperties: false,
  },
  resolveType: OAUTH_START_TOOL,
  outputSchema: {
    type: "object",
    properties: {
      redirectUri: { type: "string" },
    },
    required: ["redirectUri"],
    additionalProperties: false,
  },
};
export const middlewaresFor = (
  { appName, installId, instance }: MiddlewareOptions,
): {
  listTools: ListToolsMiddleware[];
  callTool: CallToolMiddleware[];
} => {
  const checkConfigurationTool = `${
    slugify(appName)
  }_${CHECK_CONFIGURATION_TOOL}`;
  const configureMcpTool = `${slugify(appName)}_${CONFIGURE_MCP_TOOL}`;

  return {
    callTool: [
      async (req, next) => {
        if (req.params.name === OAUTH_START_TOOL) {
          const inst = await instance;
          const response = await startOAuth({
            integrationId: req.params.arguments?.integrationId as string | null,
            appName,
            installId: req.params.arguments?.installId as string ??
              crypto.randomUUID(),
            returnUrl: req.params.arguments?.returnUrl as string | null,
            instance: inst,
            envVars: Deno.env.toObject(),
            invoke: (async (name, args) => {
              const state = await inst.deco.prepareState({
                req: {
                  raw: new Request("https://localhost:8000"),
                  param: () => ({}),
                },
              });
              return await inst.deco.invoke(
                name as any,
                args,
                undefined,
                state,
              );
            }) as MCPState["Variables"]["invoke"],
          });
          const url = response && typeof response === "object" &&
              response instanceof Response
            ? response.headers.get("Location")
            : null;
          const result = {
            redirectUrl: url,
          };
          return {
            content: [{
              type: "text",
              text: JSON.stringify(result),
            }],
            structuredContent: result,
          };
        }
        if (req.params.name === configureMcpTool) {
          const result = await configure({
            id: appName,
            installId,
            props: req.params.arguments!,
          });
          return {
            content: [{
              type: "text",
              text: JSON.stringify(result),
            }],
            structuredContent: result as any,
          };
        }
        if (req.params.name === checkConfigurationTool) {
          const result = await checkConfiguration({ installId });
          return {
            content: [{
              type: "text",
              text: JSON.stringify(result),
            }],
            structuredContent: result,
          };
        }
        return next!();
      },
    ],
    listTools: [async (_req, next) => {
      const [{ tools }, apps] = await Promise.all([next!(), searchMCPs()]);

      const inputSchema = apps.find((app) =>
        app.name === decodeURIComponent(appName)
      )?.inputSchema;

      const hasOAuth = tools.some((tool) => tool.name === OAUTH_START_TOOL);

      return {
        tools: [...tools, ...(!hasOAuth ? [OAUTH_TOOL] : []), {
          name: checkConfigurationTool,
          description:
            "Check if the configuration is valid, no input is needed, you should ensure first (once) if the configuration is valid before calling any tool, once checked, you can freely call tools. It also returns the JSON Schema of the configuration.",
          inputSchema: {
            type: "object",
          },
          resolveType: checkConfigurationTool,
          outputSchema: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              errors: { type: "array", items: { type: "string" } },
              inputSchema: { type: "object" },
              schema: { type: "object" },
            },
          },
        } as Tool, {
          name: configureMcpTool,
          description: "Configure the MCP, input is the configuration",
          inputSchema: inputSchema || { type: "object" },
          outputSchema: {
            type: "object",
          },
        } as Tool],
      };
    }],
  };
};

function slugify(appName: string) {
  return appName.replace(/ /g, "_");
}
