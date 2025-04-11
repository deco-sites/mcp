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
        class="w-full max-w-screen-sm lg:max-w-screen-lg overflow-hidden relative min-h-[100px] empty:before:content-[''] empty:before:absolute empty:before:top-1/2 empty:before:left-1/2 empty:before:w-12 empty:before:h-12 empty:before:border-4 empty:before:border-gray-300 empty:before:border-t-black empty:before:rounded-full empty:before:-translate-x-1/2 empty:before:-translate-y-1/2 empty:before:animate-[spinner_1s_linear_infinite] empty:after:content-['Loading_form...'] empty:after:absolute empty:after:top-[calc(50%+2rem)] empty:after:left-1/2 empty:after:-translate-x-1/2"
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
