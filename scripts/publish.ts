/**
 * Lista de apps que devem ser excluídos da atualização automática.
 */
const blacklistedApps: string[] = [
  "flux",
  "clearsale",
  "pncp",
  "perplexity",
  "mcp-perplexity",
  "meta-ads",
  "http",
  "tools",
  "views",
  "documents",
  "workflows",
  "time",
  "secrets",
  "teams",
  "ai-models",
  "knowledge-base",
  "hosting",
  "oauth-management",
  "threads",
  "file-system",
  "deconfig",
  "prompts",
  "wallet",
  "ai-gateway",
  "agent-crud",
  "registry",
  "agents",
  "api-keys",
  "integrations",
  "triggers",
  "channels",
  "event-bus",
  "event-subscriber",
  "vtex",
  "dataforseo",
  "connection",
  "postgres",
  "vibecoding-toolkit",
  "discord-bot",
  "github-projects",
  "billing",
];

function isBlacklisted(appName: string): boolean {
  return blacklistedApps.includes(appName.toLowerCase());
}

interface App {
  name: string;
  appName?: string;
  description: string;
  icon: string;
  provider: string;
  scope: string;
}

interface PublishPayload {
  scopeName: string;
  name: string;
  friendlyName: string;
  description: string;
  icon: string;
  connection: {
    type: string;
    url: string;
  };
  unlisted: boolean;
}

interface RegistryApp {
  id: string;
  workspace: string | null;
  scopeId: string;
  scopeName: string;
  name: string;
  appName: string;
  friendlyName?: string;
  description?: string;
  icon?: string;
  unlisted: boolean;
  verified?: boolean;
  createdAt: string;
  updatedAt: string;
  connection: {
    url: string;
    type: string;
  };
}

function buildApiUrl(toolName: string): string {
  const workspace = Deno.env.get("WORKSPACE");

  if (!workspace) {
    throw new Error("WORKSPACE environment variable is required");
  }

  return `https://api.decocms.com${workspace}/mcp/tool/${toolName}`;
}

async function parseSSEResponse(
  response: Response,
): Promise<Record<string, unknown> | null> {
  const text = await response.text();

  // Check if it's SSE format (starts with "event:")
  if (text.trim().startsWith("event:")) {
    // Parse SSE format: extract data lines
    const lines = text.split("\n");
    let dataLine = "";

    for (const line of lines) {
      if (line.startsWith("data:")) {
        const data = line.substring(5).trim();
        if (data) {
          dataLine = data;
          break;
        }
      }
    }

    if (dataLine) {
      try {
        return JSON.parse(dataLine);
      } catch (_e) {
        // If parsing fails, try to find JSON in the text
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        // Return empty result if we can't parse
        return null;
      }
    }

    // If no data line found, return null
    return null;
  }

  // Try to parse as regular JSON
  try {
    return JSON.parse(text);
  } catch (_e) {
    // If it's not JSON, return null (might be empty response or error)
    return null;
  }
}

async function getExistingApp(
  token: string,
  scopeName: string,
  appName: string,
): Promise<RegistryApp | null> {
  try {
    const url = buildApiUrl("INTEGRATIONS_CALL_TOOL");
    const fullAppName = `@${scopeName}/${appName}`;

    // Use REGISTRY_LIST_PUBLISHED_APPS and filter locally
    // This is more reliable than REGISTRY_GET_APP for checking existence
    const requestBody = {
      method: "tools/call",
      params: {
        name: "INTEGRATIONS_CALL_TOOL",
        arguments: {
          id: "i:registry-management",
          params: {
            name: "REGISTRY_LIST_PUBLISHED_APPS",
            arguments: {},
          },
        },
      },
      jsonrpc: "2.0",
      id: 1,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status !== 404) {
        console.error(
          `⚠️  Error fetching apps: ${response.status} ${errorText}`,
        );
      }
      return null;
    }

    const result = await parseSSEResponse(response);

    if (!result) {
      return null;
    }

    // Parse JSON-RPC response format
    const resultAny = result as {
      result?: { structuredContent?: { apps?: RegistryApp[] } };
      structuredContent?: { apps?: RegistryApp[] };
      content?: { structuredContent?: { apps?: RegistryApp[] } };
    };

    let apps: RegistryApp[] = [];
    if (resultAny.result?.structuredContent?.apps) {
      apps = resultAny.result.structuredContent.apps;
    } else if (resultAny.structuredContent?.apps) {
      apps = resultAny.structuredContent.apps;
    } else if (resultAny.content?.structuredContent?.apps) {
      apps = resultAny.content.structuredContent.apps;
    }

    // Find the app by exact appName match first, then by name
    let foundApp = apps.find((app) => app.appName === fullAppName);

    if (!foundApp) {
      // Fallback: try to find by name without scope
      foundApp = apps.find((app) => app.name === appName);
    }

    return foundApp || null;
  } catch (_error) {
    // Silently fail - app might not exist yet
    return null;
  }
}

async function fetchApps(): Promise<App[]> {
  console.log("Fetching apps from MCP API...");

  const response = await fetch(
    "https://mcp.deco.site/live/invoke/site/loaders/mcps/search.ts?provider=deco",
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch apps: ${response.status} ${response.statusText}`,
    );
  }

  const apps: App[] = await response.json();
  console.log(`Found ${apps.length} apps to publish`);

  return apps;
}

async function publishApp(
  app: App,
): Promise<
  { success: boolean; error?: string; isNew?: boolean; skipped?: boolean }
> {
  if (!app.appName) {
    console.log(`Skipping app: ${app.name} (no appName)`);
    return { success: true, isNew: false, skipped: true };
  }

  // Validate appName to avoid invalid values that cause UUID errors
  if (app.appName === "mcp" || app.appName.length < 2) {
    console.log(
      `⚠️  Skipping app: ${app.name} (invalid appName: ${app.appName})`,
    );
    return { success: true, isNew: false, skipped: true };
  }

  // Check if app is blacklisted
  if (isBlacklisted(app.name)) {
    console.log(`⛔ Skipping blacklisted app: ${app.name}`);
    return { success: true, isNew: false, skipped: true };
  }

  const token = Deno.env.get("DECO_TOKEN");

  if (!token) {
    throw new Error("DECO_TOKEN environment variable is required");
  }

  const workspace = Deno.env.get("WORKSPACE");

  if (!workspace) {
    throw new Error("WORKSPACE environment variable is required");
  }

  const scopeName = app.scope ?? "deco";

  // 1. Fetch existing app from registry
  const existingApp = await getExistingApp(
    token,
    scopeName,
    app.appName,
  );

  // 2. Values that the script wants to publish (original source)
  const scriptValues = {
    friendlyName: app.name,
    description: app.description,
    icon: app.icon,
    unlisted: false,
  };

  // 3. Strategy: If app exists, preserve ALL editable fields (may have been edited by admin)
  let finalValues = scriptValues; // Default: use script values for new apps
  const isNewApp = !existingApp;

  if (existingApp) {
    // App exists - preserve all editable fields to respect potential admin edits
    // Only update connection URL
    finalValues = {
      friendlyName: existingApp.friendlyName || scriptValues.friendlyName,
      description: existingApp.description || scriptValues.description,
      icon: existingApp.icon || scriptValues.icon,
      unlisted: existingApp.unlisted,
    };

    console.log(`\n✏️  Updating existing app: ${app.name}`);
  } else {
    console.log(`\n🆕 New app: ${app.name}`);
  }

  // 4. Prepare payload with final values
  const payload: PublishPayload = {
    scopeName,
    name: app.appName,
    ...finalValues,
    connection: {
      type: "HTTP",
      url: `https://mcp.deco.site/apps/${app.name}/mcp/messages`,
    },
  };

  const url = buildApiUrl("INTEGRATIONS_CALL_TOOL");

  try {
    // Use JSON-RPC format for REGISTRY_PUBLISH_APP
    const requestBody = {
      method: "tools/call",
      params: {
        name: "INTEGRATIONS_CALL_TOOL",
        arguments: {
          id: "i:registry-management",
          params: {
            name: "REGISTRY_PUBLISH_APP",
            arguments: payload,
          },
        },
      },
      jsonrpc: "2.0",
      id: 1,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();

      // Check if it's the UUID error from Deco API
      if (errorText.includes("string_to_uuid") || errorText.includes('"mcp"')) {
        console.error(
          `⚠️  Deco API error: Trying to use "mcp" as UUID. This is a backend issue.`,
        );
        console.error(
          `💡 Tip: Check if WORKSPACE format is correct. Expected format: /shared/deco`,
        );
      }

      return {
        success: false,
        error: `${response.status} ${response.statusText}: ${errorText}`,
      };
    }

    console.log(`✅ Successfully published: ${app.name}\n`);

    return { success: true, isNew: isNewApp };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      isNew: false,
    };
  }
}

async function publishInBatches(
  apps: App[],
  batchSize: number = 10,
): Promise<void> {
  const totalBatches = Math.ceil(apps.length / batchSize);
  let successCount = 0;
  let errorCount = 0;
  let newAppsCount = 0;
  let skippedCount = 0;

  console.log(
    `Publishing ${apps.length} apps in ${totalBatches} batches of ${batchSize}...`,
  );

  for (let i = 0; i < apps.length; i += batchSize) {
    const batch = apps.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;

    console.log(
      `\n🚀 Processing batch ${batchNumber}/${totalBatches} (${batch.length} apps)...`,
    );

    // Process batch in parallel
    const promises = batch.map((app) => publishApp(app));
    const results = await Promise.all(promises);

    // Count results
    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const app = batch[j];

      if (result.success) {
        if (result.skipped) {
          skippedCount++;
        } else {
          successCount++;
          if (result.isNew) {
            newAppsCount++;
          }
        }
      } else {
        errorCount++;
        console.error(`❌ Failed to publish ${app.name}: ${result.error}`);
      }
    }

    console.log(
      `Batch ${batchNumber} completed. Success: ${
        results.filter((r) => r.success && !r.skipped).length
      }, Skipped: ${results.filter((r) => r.skipped).length}, Errors: ${
        results.filter((r) => !r.success).length
      }`,
    );

    // Small delay between batches to avoid overwhelming the API
    if (i + batchSize < apps.length) {
      console.log("Waiting 500ms before next batch...");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log(`\n📊 Final Results:`);
  console.log(`✅ Successfully published: ${successCount} apps`);
  console.log(`🆕 New apps: ${newAppsCount} apps`);
  console.log(`♻️  Updated apps: ${successCount - newAppsCount} apps`);
  console.log(`⛔ Skipped (blacklist/invalid): ${skippedCount} apps`);
  console.log(`❌ Failed to publish: ${errorCount} apps`);
  console.log(
    `📈 Success rate: ${
      ((successCount / (apps.length - skippedCount)) * 100).toFixed(1)
    }%`,
  );
}

async function main() {
  try {
    // Fetch apps
    const apps = await fetchApps();

    if (apps.length === 0) {
      console.log("No apps found to publish");
      return;
    }

    // Publish apps in batches
    await publishInBatches(apps, 10);
  } catch (error) {
    console.error(
      "❌ Error:",
      error instanceof Error ? error.message : String(error),
    );
    Deno.exit(1);
  }
}

// Run the script
await main();
