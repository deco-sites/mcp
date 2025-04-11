import { asset } from "@deco/deco/htmx";

const RJSF_ID = "MCP_RJSF_FORM";

export default function RJSF(
  {
    schema,
    formData,
    formId = "rjsf-form",
    slotId = "",
  }: {
    schema: Record<string, any>;
    formData?: Record<string, any>;
    formId?: string;
    slotId?: string;
  },
) {
  return (
    <>
      <div
        id={RJSF_ID}
        data-form-id={formId}
        class="w-full max-w-screen-sm lg:max-w-screen-lg overflow-hidden"
      />
      {/* Script file at static/rjsf.js */}
      <script
        type="module"
        dangerouslySetInnerHTML={{
          __html: `
    import {renderForm, updateFormData, getFormData} from "${
            asset("/rjsf.js")
          }";

    renderForm({ 
      schema: ${JSON.stringify(schema)}, 
      rootId: "${RJSF_ID}",
      formData: ${formData ? JSON.stringify(formData) : "null"},
      formId: "${formId}",
      slotId: "${slotId}",
    });
  `,
        }}
      />
    </>
  );
}
