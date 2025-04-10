import { asset } from "@deco/deco/htmx";

const RJSF_ID = "MCP_RJSF_FORM";

export default function RJSF(
  {
    schema,
    formData,
    formId = "rjsf-form",
    onsubmit,
  }: {
    schema: Record<string, any>;
    formData?: Record<string, any>;
    formId?: string;
  },
) {
  return (
    <>
      <div id={RJSF_ID} data-form-id={formId} />
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
      onsubmit: ${onsubmit},
    });
  `,
        }}
      />
    </>
  );
}
