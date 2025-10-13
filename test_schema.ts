// Test script to verify schema title sanitization
import { listFromDeco } from "./utils.ts";

console.log("🧪 Testing Schema Title Sanitization\n");
console.log("=".repeat(60));

try {
  const tools = await listFromDeco();
  console.log(`\n✅ Successfully loaded ${tools.length} tools\n`);

  // List all tool names to help identify Google Sheets
  console.log("📋 Available tools:");
  const googleTools = tools.filter((t) =>
    t.name.toLowerCase().includes("google"),
  );
  googleTools.forEach((t) => console.log(`   - ${t.name}`));

  // Test Google Sheets specifically (known to have the issue)
  const googleSheets = tools.find(
    (t) =>
      t.name.toLowerCase().includes("google") &&
      t.name.toLowerCase().includes("sheet"),
  );

  if (googleSheets) {
    console.log("📊 Testing Google Sheets schema...\n");
    const schemaStr = JSON.stringify(googleSheets.inputSchema, null, 2);

    // Check for bad titles
    const badTitleMatches = schemaStr.match(/tl@\d+-\d+/g);
    const badTitleCount = badTitleMatches?.length ?? 0;

    if (badTitleCount === 0) {
      console.log("✅ SUCCESS: No bad 'tl@' titles found!");
    } else {
      console.log(`❌ FAIL: Found ${badTitleCount} bad 'tl@' titles:`);
      console.log(badTitleMatches);
    }

    // Check for preserved good titles
    const goodTitles = [
      "Spreadsheet Title",
      "Sheet Title",
      "Row Count",
      "Column Count",
    ];
    const preservedTitles = goodTitles.filter((title) =>
      schemaStr.includes(title),
    );

    console.log(
      `\n✅ Preserved ${preservedTitles.length}/${goodTitles.length} good titles`,
    );
    if (preservedTitles.length > 0) {
      console.log(`   - ${preservedTitles.join(", ")}`);
    }

    // Show a preview of the schema
    console.log("\n📋 Schema Preview (first 1500 chars):");
    console.log("-".repeat(60));
    console.log(schemaStr.substring(0, 1500) + "...");
  } else {
    console.log("⚠️  Google Sheets tool not found");
  }

  // Check all tools for any remaining bad titles
  console.log("\n" + "=".repeat(60));
  console.log("\n🔍 Scanning ALL tools for bad titles...\n");

  let totalBadTitles = 0;
  const toolsWithBadTitles: string[] = [];

  for (const tool of tools) {
    if (tool.name.toUpperCase().includes("GOOGLESHEETS")) {
      console.log(tool);
    }
    const inputSchemaStr = JSON.stringify(tool.inputSchema);
    const outputSchemaStr = JSON.stringify(tool.outputSchema);
    const combinedSchema = inputSchemaStr + outputSchemaStr;

    const matches = combinedSchema.match(/tl@\d+-\d+/g);
    if (matches && matches.length > 0) {
      totalBadTitles += matches.length;
      toolsWithBadTitles.push(`${tool.name} (${matches.length})`);
    }
  }

  if (totalBadTitles === 0) {
    console.log("🎉 EXCELLENT: No bad titles found in ANY tool!");
  } else {
    console.log(`❌ Found ${totalBadTitles} bad titles across tools:`);
    toolsWithBadTitles.forEach((tool) => console.log(`   - ${tool}`));
  }

  console.log("\n" + "=".repeat(60));
  console.log("\n✨ Test Complete!\n");
} catch (error) {
  console.error("❌ Error during testing:", error);
  Deno.exit(1);
}
