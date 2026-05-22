import { MCP } from "../loaders/mcps/search.ts";
import { AppContext } from "../apps/site.ts";
import { useId } from "../sdk/useId.ts";
import { useScript } from "@deco/deco/hooks";

export interface Props {
  mcps?: MCP[];
}

export const loader = async (
  props: Props,
  _req: Request,
  ctx: AppContext,
) => {
  const mcps = await ctx.invoke.site.loaders.mcps.search();
  return { ...props, mcps };
};

interface MCPCardProps {
  mcp: MCP;
}

function Image(
  { src, alt, class: className }: { src: string; alt: string; class: string },
) {
  const id = useId();
  const script = useScript((id) => {
    const img = document.getElementById(id) as HTMLImageElement;

    img.src =
      "https://decoims.com/mcp/b17280d9-5972-4468-8d0c-76d9842e4ffe/0ac02239_0ac02239-61e6-4289-8a36-e78c0975bcc8.png";
  }, id);

  return <img id={id} src={src} alt={alt} class={className} onerror={script} />;
}

function MCPCard({ mcp }: MCPCardProps) {
  return (
    <a
      href={`/mcp/${mcp.id}`}
      class="flex flex-col h-full border rounded-lg p-6 hover:shadow-lg transition-shadow gap-4 cursor-pointer"
    >
      <div class="grid grid-cols-[min-content_1fr] gap-2 items-center">
        <div class="w-14 h-14 shadow rounded-xl overflow-hidden">
          <Image
            src={mcp.icon || "/fallback-icon.png"}
            alt={`${mcp.id} icon`}
            class="w-full h-full object-contain"
          />
        </div>
        <div class="flex flex-col gap-1">
          <h2 class="font-medium text-gray-900 truncate" data-name>
            {mcp.name}
          </h2>
          <div class="text-gray-400 text-xs">
            <span>by</span> <span class="capitalize">{mcp.provider}</span>
          </div>
        </div>
      </div>
      <p class="text-gray-600 line-clamp-3 flex-grow" data-description>
        {mcp.description}
      </p>
    </a>
  );
}

export default function Home({ mcps = [] }: Props) {
  return (
    <div class="container mx-auto p-4">
      <h1 class="text-4xl font-bold mb-8">Available MCPs</h1>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mcps.map((mcp) => <MCPCard key={mcp.id} mcp={mcp} />)}
      </div>
    </div>
  );
}
