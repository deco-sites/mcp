import { type ConfigurationResult } from "../actions/mcps/configure.ts";
import { AppContext } from "../apps/site.ts";
import { type MCP } from "../loaders/mcps/search.ts";
import { useId } from "site/sdk/useId.ts";
import { useScript } from "@deco/deco/hooks";

export interface Props {
  id?: string;
  mcp?: MCP;
  installation?: ConfigurationResult;
  error?: string;
}

export const loader = async (props: Props, _req: Request, ctx: AppContext) => {
  if (!props.id) {
    return { ...props, error: "MCP id not provided" };
  }

  const mcp = await ctx.invoke.site.loaders.mcps.get({ id: props.id });

  if (!mcp) {
    return { ...props, error: "MCP not found" };
  }

  return { ...props, mcp };
};

export const action = async (
  props: Props,
  req: Request,
  ctx: AppContext,
) => {
  try {
    const form = await req.formData();
    const formProps = Object.fromEntries(form.entries());
    const config = formProps.config;

    const result = await ctx.invoke.site.actions.mcps.configure({
      id: props.id!,
      // deno-lint-ignore no-explicit-any
      props: JSON.parse(config as any as string),
    });

    return { ...props, instalation: result };
  } catch (err) {
    return { ...props, error: err.message };
  }
};

export default function PDP({ mcp, error, instalation }: Props) {
  const slot = useId();
  const editorId = useId();
  const schemaId = useId();
  const errorId = useId();
  const loadingId = useId();
  const btnTextId = useId();

  // Log the input schema to console for debugging
  if (mcp?.inputSchema) {
    console.log("MCP Input Schema:", mcp.inputSchema);
  }

  // Parse input schema and extract required properties
  function SchemaPropertiesTable({ schema }: { schema: any }) {
    if (!schema || !schema.properties) {
      return null;
    }

    // Extract required properties
    const requiredProps = schema.required || [];
    const properties = schema.properties;
    
    // Only show the table if there are properties to display
    if (Object.keys(properties).length === 0) {
      return null;
    }

    // Function to render property type with format if available
    const renderType = (prop: any): string => {
      let type = prop.type || "object";
      if (prop.format) {
        type += ` (${prop.format})`;
      }
      if (type === "array" && prop.items) {
        type += ` of ${prop.items.type || "items"}`;
      }
      if (prop.enum) {
        type += ` [${prop.enum.join(", ")}]`;
      }
      return type;
    };

    // Function to parse and make URLs in descriptions clickable
    const renderDescription = (description: string) => {
      if (!description) return "-";
      
      try {
        // Step 1: Find all URLs in the description
        const urlMatches = description.match(/https?:\/\/[^\s]+/g) || [];
        if (urlMatches.length === 0) {
          return description;
        }
        
        // Step 2: Check for duplicated URLs without spaces
        let processedText = description;
        
        for (const url of urlMatches) {
          // Look for cases where the URL appears twice consecutively
          const duplicatePattern = new RegExp(`(${escapeRegExp(url)}){2,}`, 'g');
          processedText = processedText.replace(duplicatePattern, url);
        }
        
        // Step 3: Now find URLs in the cleaned text and create links
        const urlRegex = /https?:\/\/[^\s]+/g;
        const parts = processedText.split(urlRegex);
        const urls = processedText.match(urlRegex) || [];
        
        // Step 4: Build the final result with links
        const result = [];
        parts.forEach((part, i) => {
          if (part) result.push(part);
          if (urls[i]) {
            // Clean the URL (remove trailing punctuation)
            let cleanUrl = urls[i].replace(/[.,;:!?]+$/, '');
            
            result.push(
              <a 
                href={cleanUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                class="text-blue-600 hover:underline"
              >
                {cleanUrl}
              </a>
            );
          }
        });
        
        return <>{result}</>;
      } catch (e) {
        console.error("Error processing URLs in description:", e);
        return description;
      }
    };
    
    // Helper function to escape special chars for regex
    function escapeRegExp(string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    return (
      <div class="mb-6">
        <h3 class="text-lg font-bold mb-2">Configuration Schema Properties</h3>
        <div class="overflow-x-auto">
          <table class="min-w-full bg-white border border-gray-200 mb-4">
            <thead>
              <tr class="bg-gray-100">
                <th class="px-4 py-2 text-left border-b border-gray-200 font-semibold">Property</th>
                <th class="px-4 py-2 text-left border-b border-gray-200 font-semibold">Type</th>
                <th class="px-4 py-2 text-left border-b border-gray-200 font-semibold">Description</th>
                <th class="px-4 py-2 text-left border-b border-gray-200 font-semibold">Required</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(properties).map(([key, prop]: [string, any]) => {
                // Handle nested properties for objects
                const nestedProperties = prop.type === "object" && prop.properties ? 
                  Object.entries(prop.properties).map(([nestedKey, nestedProp]: [string, any]) => (
                    <tr key={`${key}.${nestedKey}`} class="border-b border-gray-200 bg-gray-50">
                      <td class="px-4 py-2 font-medium pl-8">{`${key}.${nestedKey}`}</td>
                      <td class="px-4 py-2">{renderType(nestedProp)}</td>
                      <td class="px-4 py-2">{renderDescription(nestedProp.description)}</td>
                      <td class="px-4 py-2">{(prop.required || []).includes(nestedKey) ? "✓" : "-"}</td>
                    </tr>
                  )) : null;

                return (
                  <>
                    <tr key={key} class="border-b border-gray-200 hover:bg-gray-50">
                      <td class="px-4 py-2 font-medium">{key}</td>
                      <td class="px-4 py-2">{renderType(prop)}</td>
                      <td class="px-4 py-2">{renderDescription(prop.description)}</td>
                      <td class="px-4 py-2">{requiredProps.includes(key) ? "✓" : "-"}</td>
                    </tr>
                    {nestedProperties}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
        <p class="text-sm text-gray-600 mb-4">Use the properties above to configure your JSON in the editor below.</p>
      </div>
    );
  }

  function setupMonaco(editorId, schemaId, errorId) {
    function waitForRequire() {
      if (!globalThis.require) {
        setTimeout(waitForRequire, 100);
        return;
      }
      globalThis.require.config({
        paths: {
          vs:
            "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.26.1/min/vs",
        },
      });
      globalThis.require(["vs/editor/editor.main"], setupEditor);
    }

    function setupEditor() {
      const editorElement = document.getElementById(editorId);
      const schemaElement = document.getElementById(schemaId);
      const errorElement = document.getElementById(errorId);

      if (!editorElement || !schemaElement) {
        console.error("Required elements not found");
        return;
      }

      try {
        const schema = JSON.parse(schemaElement.textContent || "{}");

        globalThis.monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
          validate: true,
          allowComments: true,
          schemas: [{
            uri: "http://myschema/mcp-schema.json",
            fileMatch: ["*"],
            schema: schema,
          }],
          enableSchemaRequest: false,
        });

        globalThis.monacoEditor = globalThis.monaco.editor.create(
          editorElement,
          {
            value: "{}",
            language: "json",
            theme: "vs",
            automaticLayout: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbers: "on",
            roundedSelection: false,
            formatOnPaste: true,
            formatOnType: true,
            wordWrap: "on",
          },
        );

        // Add validation error listener
        globalThis.monacoEditor.onDidChangeModelDecorations(function () {
          const model = globalThis.monacoEditor.getModel();
          if (!model) return;

          const errorMarkers = globalThis.monaco.editor.getModelMarkers({
            resource: model.uri,
          });
          if (errorMarkers.length > 0) {
            const errors = errorMarkers.map(function (marker) {
              return marker.message;
            }).join("\\n");
            if (errorElement) {
              errorElement.textContent = errors;
              errorElement.style.display = "block";
            }
          } else {
            if (errorElement) {
              errorElement.style.display = "none";
            }
          }
        });

        if (globalThis.monacoEditor.getAction("editor.action.formatDocument")) {
          globalThis.monacoEditor.getAction("editor.action.formatDocument")
            .run();
        }
      } catch (err) {
        console.error("Monaco initialization error:", err);
        if (errorElement) {
          errorElement.textContent = "Failed to initialize editor: " +
            err.message;
          errorElement.style.display = "block";
        }
      }
    }

    waitForRequire();
  }

  function handleSubmit(slot, loadingId, btnTextId) {
    event.preventDefault();
    
    // Set loading state
    const loadingElement = document.getElementById(loadingId);
    const btnTextElement = document.getElementById(btnTextId);
    const submitBtn = btnTextElement?.parentElement;
    
    if (loadingElement && btnTextElement && submitBtn) {
      loadingElement.style.display = "inline-flex";
      btnTextElement.style.display = "none";
      submitBtn.setAttribute("disabled", "true");
      submitBtn.classList.add("opacity-70", "cursor-not-allowed");
      submitBtn.classList.remove("hover:bg-blue-700");
    }

    const editor = globalThis.monacoEditor;
    const errorElement = document.getElementById("${errorId}");

    function resetButton() {
      if (loadingElement && btnTextElement && submitBtn) {
        loadingElement.style.display = "none";
        btnTextElement.style.display = "inline";
        submitBtn.removeAttribute("disabled");
        submitBtn.classList.remove("opacity-70", "cursor-not-allowed");
        submitBtn.classList.add("hover:bg-blue-700");
      }
    }

    if (!editor) {
      console.error("Editor not initialized");
      if (errorElement) {
        errorElement.textContent = "Editor not initialized";
        errorElement.style.display = "block";
      }
      resetButton();
      return;
    }

    try {
      const jsonInput = editor.getValue() || "{}";
      const parsedJson = JSON.parse(jsonInput);

      // Check for validation errors before submitting
      const model = editor.getModel();
      if (model) {
        const markers = globalThis.monaco.editor.getModelMarkers({
          resource: model.uri,
        });
        if (markers.length > 0) {
          if (errorElement) {
            errorElement.textContent =
              "Please fix validation errors before submitting";
            errorElement.style.display = "block";
          }
          resetButton();
          return;
        }
      }

      const form = new FormData();
      form.append("config", JSON.stringify(parsedJson));

      if (errorElement) {
        errorElement.style.display = "none";
      }

      fetch(globalThis.location.href, {
        method: "POST",
        body: form,
      })
        .then(function (response) {
          return response.text();
        })
        .then(function (result) {
          const s = document.getElementById(slot);
          if (s) s.innerHTML = result;
          resetButton();
        })
        .catch(function (err) {
          console.error("Submit error:", err);
          if (errorElement) {
            errorElement.textContent = "Failed to submit: " + err.message;
            errorElement.style.display = "block";
          }
          resetButton();
        });
    } catch (err) {
      console.error("JSON parse error:", err);
      if (errorElement) {
        errorElement.textContent = "Invalid JSON format: " + err.message;
        errorElement.style.display = "block";
      }
      resetButton();
    }
  }

  const handleSetup = useScript(setupMonaco, editorId, schemaId, errorId);
  const handleClick = useScript(handleSubmit, slot, loadingId, btnTextId);

  if (error) {
    return (
      <div class="container mx-auto p-4">
        <div class="mb-4">
          <a href="/" class="flex items-center text-blue-600 hover:text-blue-800 w-fit">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clip-rule="evenodd" />
            </svg>
            See all MCPs
          </a>
        </div>
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      </div>
    );
  }

  if (instalation?.success) {
    return (
      <div class="container mx-auto p-4">
        <div class="mb-4">
          <a href="/" class="flex items-center text-blue-600 hover:text-blue-800 w-fit">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clip-rule="evenodd" />
            </svg>
            See all MCPs
          </a>
        </div>
        <div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
          <h2 class="text-xl font-bold mb-2">Installation Successful!</h2>
          <p class="mb-4">Your MCP URL:</p>
          <code class="block bg-green-50 p-4 rounded">
            {instalation.data.connection.url}
          </code>
        </div>
      </div>
    );
  }

  if (!mcp) {
    return null;
  }

  return (
    <div class="container mx-auto p-4">
      <div class="mb-4">
        <a href="/" class="flex items-center text-blue-600 hover:text-blue-800 w-fit">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clip-rule="evenodd" />
          </svg>
          See all MCPs
        </a>
      </div>
      <h1 class="text-4xl font-bold mb-6">{mcp.name}</h1>
      <p class="text-gray-600 mb-8">{mcp.description}</p>

      <div class="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
        <h2 class="text-2xl font-bold mb-6">Configure Installation</h2>
        
        {/* Schema Properties Table */}
        <SchemaPropertiesTable schema={mcp.inputSchema} />
        
        <form method="POST" onsubmit={handleClick}>
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2">
              Configuration JSON
            </label>
            <div
              id={editorId}
              style={{
                width: "100%",
                height: "400px",
                border: "1px solid #e2e8f0",
                borderRadius: "0.375rem",
              }}
            />
            <div
              id={errorId}
              class="mt-2 text-red-600 text-sm hidden"
              style={{ display: "none" }}
            />
          </div>
          <button
            type="submit"
            class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            <span id={btnTextId}>Install</span>
            <span 
              id={loadingId} 
              class="items-center"
              style={{ display: "none" }}
            >
              <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Installing...
            </span>
          </button>
        </form>

        <div id={slot} />
      </div>

      {/* Store the input schema */}
      <script
        id={schemaId}
        type="application/json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(mcp.inputSchema || {}),
        }}
      />

      {/* Monaco Editor CSS */}
      <link
        rel="stylesheet"
        data-name="vs/editor/editor.main"
        href="https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.26.1/min/vs/editor/editor.main.min.css"
      />

      {/* Monaco Editor Loader */}
      <script src="https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.26.1/min/vs/loader.min.js" />

      {/* Initialize Monaco */}
      <script dangerouslySetInnerHTML={{ __html: handleSetup }} />
    </div>
  );
}
