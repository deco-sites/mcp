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
  metadata?: {
    lastScriptValues?: {
      friendlyName?: string;
      description?: string;
      icon?: string;
      unlisted?: boolean;
    };
  };
}

interface RegistryApp {
  id: string;
  friendlyName?: string;
  description?: string;
  icon?: string;
  unlisted: boolean;
  metadata?: {
    lastScriptValues?: {
      friendlyName?: string;
      description?: string;
      icon?: string;
      unlisted?: boolean;
    };
  };
}

async function getExistingApp(
  workspace: string,
  token: string,
  scopeName: string,
  appName: string,
): Promise<RegistryApp | null> {
  try {
    const url = `https://api.deco.chat${workspace}/tools/call/REGISTRY_GET_APP`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `@${scopeName}/${appName}`,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const result = await response.json();
    return result.data || null;
  } catch (error) {
    console.error(`Error fetching existing app: ${error}`);
    return null;
  }
}

function wasEditedByAdmin(
  currentValue: string | boolean | undefined,
  scriptValue: string | boolean,
  lastScriptValue?: string | boolean,
): boolean {
  // If no previous script value exists, compare directly
  if (lastScriptValue === undefined) {
    return currentValue !== scriptValue;
  }

  // If currentValue != lastScriptValue = admin edited
  return currentValue !== lastScriptValue;
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
): Promise<{ success: boolean; error?: string }> {
  if (!app.appName) {
    console.log(`Skipping app: ${app.name} (no appName)`);
    return { success: true };
  }

  const workspace = Deno.env.get("WORKSPACE");
  const token = Deno.env.get("DECO_TOKEN");

  if (!workspace) {
    throw new Error("WORKSPACE environment variable is required");
  }

  if (!token) {
    throw new Error("DECO_TOKEN environment variable is required");
  }

  const scopeName = app.scope ?? "deco";

  // 1. Fetch existing app from registry
  const existingApp = await getExistingApp(
    workspace,
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

  // 3. If app exists, detect manually edited fields
  let finalValues = scriptValues; // Default: use script values

  if (existingApp) {
    const lastScriptValues = existingApp.metadata?.lastScriptValues;

    console.log(`\n🔍 Checking ${app.name} for admin edits...`);

    // Check each field individually
    finalValues = {
      friendlyName: wasEditedByAdmin(
          existingApp.friendlyName,
          scriptValues.friendlyName,
          lastScriptValues?.friendlyName,
        )
        ? existingApp.friendlyName || scriptValues.friendlyName
        : scriptValues.friendlyName,

      description: wasEditedByAdmin(
          existingApp.description,
          scriptValues.description,
          lastScriptValues?.description,
        )
        ? existingApp.description || scriptValues.description
        : scriptValues.description,

      icon: wasEditedByAdmin(
          existingApp.icon,
          scriptValues.icon,
          lastScriptValues?.icon,
        )
        ? existingApp.icon || scriptValues.icon
        : scriptValues.icon,

      unlisted: wasEditedByAdmin(
          existingApp.unlisted,
          scriptValues.unlisted,
          lastScriptValues?.unlisted,
        )
        ? existingApp.unlisted
        : scriptValues.unlisted,
    };

    // Log decisions
    const preserved = [];
    if (finalValues.friendlyName !== scriptValues.friendlyName) {
      preserved.push("friendlyName");
    }
    if (finalValues.description !== scriptValues.description) {
      preserved.push("description");
    }
    if (finalValues.icon !== scriptValues.icon) preserved.push("icon");
    if (finalValues.unlisted !== scriptValues.unlisted) {
      preserved.push("unlisted");
    }

    if (preserved.length > 0) {
      console.log(`  ⚠️  Preserving admin edits: ${preserved.join(", ")}`);
    } else {
      console.log(`  ✅ No admin edits detected, updating all fields`);
    }
  } else {
    console.log(`\n🆕 Creating new app: ${app.name}`);
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
    // Save script values for next comparison
    metadata: {
      lastScriptValues: scriptValues,
    },
  };

  const url =
    `https://api.deco.chat${workspace}/tools/call/REGISTRY_PUBLISH_APP`;

  try {
    console.log(`📤 Publishing: ${app.name} (@${scopeName}/${app.appName})`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `${response.status} ${response.statusText}: ${errorText}`,
      };
    }

    console.log(`✅ Successfully published: ${app.name}\n`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
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
        successCount++;
      } else {
        errorCount++;
        console.error(`❌ Failed to publish ${app.name}: ${result.error}`);
      }
    }

    console.log(
      `Batch ${batchNumber} completed. Success: ${
        results.filter((r) => r.success).length
      }, Errors: ${results.filter((r) => !r.success).length}`,
    );

    // Small delay between batches to avoid overwhelming the API
    if (i + batchSize < apps.length) {
      console.log("Waiting 500ms before next batch...");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log(`\n📊 Final Results:`);
  console.log(`✅ Successfully published: ${successCount} apps`);
  console.log(`❌ Failed to publish: ${errorCount} apps`);
  console.log(
    `📈 Success rate: ${((successCount / apps.length) * 100).toFixed(1)}%`,
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

// Run the script if this file is executed directly
if (import.meta.main) {
  await main();
}
