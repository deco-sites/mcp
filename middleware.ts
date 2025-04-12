import { CallToolMiddleware, ListToolsMiddleware, Tool } from "@deco/mcp";
import checkConfiguration from "./actions/mcps/check.ts";
import configure from "./actions/mcps/configure.ts";
import searchMCPs from "./loaders/mcps/search.ts";

export interface MiddlewareOptions {
  appName: string;
  installId: string;
}
const CHECK_CONFIGURATION_TOOL = "CONFIGURATION_CHECK";
const CONFIGURE_MCP_TOOL = "CONFIGURE";

export const middlewaresFor = (
  { appName, installId }: MiddlewareOptions,
): {
  listTools: ListToolsMiddleware[];
  callTool: CallToolMiddleware[];
} => {
  const checkConfigurationTool = `${slugify(appName)}_${CHECK_CONFIGURATION_TOOL}`;
  const configureMcpTool = `${slugify(appName)}_${CONFIGURE_MCP_TOOL}`;
  
  return {
    callTool: [
      async (req, next) => {
        if (req.params.name === configureMcpTool) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify(
                await configure({
                  id: appName,
                  installId,
                  props: req.params.arguments!,
                }),
              ),
            }],
          };
        }
        if (req.params.name === checkConfigurationTool) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify(await checkConfiguration({ installId })),
            }],
          };
        }
        return next!();
      },
    ],
    listTools: [async (_req, next) => {
      const [{ tools }, apps] = await Promise.all([next!(), searchMCPs()]);

      const inputSchema = apps.find((app) => app.name === decodeURIComponent(appName))?.inputSchema;

      return {
        tools: [...tools, {
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
          inputSchema,
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
