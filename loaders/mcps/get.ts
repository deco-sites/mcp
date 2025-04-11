import searchMCPs from "./search.ts";

/**
 * @name GET
 * @description Get an MCP by id.
 */
export default async function loader(
  { id }: { id: string },
): Promise<MCP | undefined> {
  const list = await searchMCPs();
  
  return list.find((mcp) => mcp.id === id);
}
