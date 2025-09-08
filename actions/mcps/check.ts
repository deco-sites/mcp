// deno-lint-ignore-file no-explicit-any
import Ajv from "ajv";
import { installStorage } from "../../apps/site.ts";
import getMCP from "../../loaders/mcps/get.ts";

const ajv = new Ajv.Ajv({ strict: false });

export interface Props {
  /**
   * @description ID of the install, its optional, if passed, will update the existing install
   */
  installId: string;
}

export interface CheckResult {
  /**
   * @description The errors found in the configuration
   */
  errors: string[];
  /**
   * @description Whether the installation was successful
   */
  success: boolean;
  /**
   * @description The JSON Schema of the MCP configuration
   */
  inputSchema?: any;
  /**
   * @description Configuration of the MCP
   */
  config?: any;
}

export const getConfig = async (
  installIdOrConfig: string | Record<string, any>,
  integrationId: string,
) => {
  const config = typeof installIdOrConfig === "string"
    ? await installStorage.getItem<Record<string, any>>(installIdOrConfig)
    : installIdOrConfig;
  const { __resolveType: _, ...configData } = config?.[integrationId];
  return configData;
};
/**
 * @name CONFIGURATION_CHECK
 * @description Check the configuration of an MCP if any error occurs so CONFIGURE should be used
 */
export default async function checkConfiguration(
  props: Props,
): Promise<CheckResult> {
  const installId = props.installId;

  if (!installId) {
    return {
      success: false,
      errors: ["Install ID is required"],
    };
  }

  const config = await installStorage.getItem<Record<string, any>>(installId);

  if (!config) {
    return { success: false, errors: ["Install not found"] };
  }
  const integrationId = Object.keys(config)[0];
  const integration = await getMCP({ id: integrationId });
  if (!integration) {
    return { success: false, errors: ["MCP not found"] };
  }

  const schema = integration.inputSchema;
  const validate = ajv.compile(schema);

  const { __resolveType: _, ...configData } = await getConfig(
    config,
    integrationId,
  );
  return {
    success: validate(configData),
    errors: validate.errors?.map((e) => e.message ?? e.keyword) ?? [],
    inputSchema: schema,
    // config: configData, // this should be masked.
  };
}
