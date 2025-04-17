import { JSONSchema } from "@deco/deco";
import registry from "./registry.json" with { type: "json" };

const MCP_URL = "https://mcp.composio.dev";

export type ComposioMCP = {
  id: string;
  name: string;
  description: string;
  icon: string;
  provider: "composio";
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
};

/**
 * Open https://mcp.composio.dev/ and run this query selector to fulfill this list
 *
 * const integrations = [];
 * document.querySelectorAll('a').forEach((node) => {
 *  const url = new URL(node.href);
 *  if (url.origin !== 'https://mcp.composio.dev' || url.pathname.split('/').length !== 2) {
 *    return;
 *  }
 *  const [_, id] = url.pathname.split('/');
 *  const imageNode = node.querySelector('div[role="img"]');
 *  const bgImage = imageNode.style.backgroundImage;
 *  const imageUrl = bgImage.match(/url\("(.*)"\)/)[1];
 *  const title = node.querySelector('h3').innerText;
 *  const description = node.querySelector('p').innerText;
 *  integrations.push({ id, icon: imageUrl, name: title, description });
 * })
 * copy(integrations.sort((a,b) => a.id < b.id));
 */
export const list = (): ComposioMCP[] => {
  return registry.map((integration) => ({
    ...integration,
    provider: "composio",

    inputSchema: {
      type: "object",
      additionalProperties: true,
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
    },
  }));
};

export const get = (id: string) => {
  const integration = registry.find((integration) => integration.id === id);
  if (!integration) {
    throw new Error(`Integration with id ${id} not found`);
  }
  return integration;
};

const getInstanceId = async (name: string) => {
  const targetUrl = new URL(`/${name}/`, MCP_URL);
  const response = await fetch(targetUrl, {
    headers: { "accept": "text/html" },
    redirect: "manual",
  });

  const to = response.headers.get("Location");

  if (!to) {
    return [null, "Location header not found"] as const;
  }

  const id = to.split("/").pop() ?? "";

  return [id, null] as const;
};

const installApp = async (name: string, instanceId: string) => {
  const targetUrl = new URL(`/api/apps/${name}/install`, MCP_URL);

  const requestInit: RequestInit = {
    method: "POST",
    body: JSON.stringify({ framework: "cursor-vscode" }),
    headers: {
      "Content-Type": "application/json",
      cookie: [["uuid", instanceId], ["isActiveUser", instanceId]]
        .map(([key, value]) => `${key}=${value}`)
        .join("; "),
    },
  };

  const response = await fetch(targetUrl, requestInit);

  if (!response.ok) {
    return [null, "Failed to install"] as const;
  }

  return [response.json(), null] as const;
};

export const install = async (id: string) => {
  const [instanceId, instanceError] = await getInstanceId(id);

  if (instanceError) {
    throw new Error(instanceError);
  }

  const [_installOk, installError] = await installApp(id, instanceId);

  if (installError) {
    throw new Error(installError);
  }

  return new URL(`/${id}/${instanceId}`, MCP_URL).href;
};
