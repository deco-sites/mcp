import { ConfigurationResult } from "../actions/mcps/configure.ts";
import { AppContext } from "../apps/site.ts";

export interface Props {
  id: string;
}

export const action = async (
  props: Props,
  req: Request,
  ctx: AppContext,
) => {
  const form = await req.formData();
  const formProps = Object.fromEntries(form.entries());

  const configuration = await ctx.invoke.site.actions.mcps.configure({
    id: props.id,
    props: formProps,
  });

  return { ...props, configuration };
};

export default function PDPResults(
  { configuration }: { configuration: ConfigurationResult },
) {
  if (configuration?.success) {
    return (
      <div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mt-4">
        <h2 class="text-xl font-bold mb-2">Installation Successful!</h2>
        <p class="mb-4">Your MCP URL:</p>
        <code class="block bg-green-50 p-4 rounded">
          {configuration.data.connection.url}
        </code>
      </div>
    );
  }

  return (
    <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mt-4">
      Installation failed. Please try again.
    </div>
  );
}
