import React from "https://esm.sh/react@@19.1.0"
import ReactDOM from "https://esm.sh/react-dom@19.1.0"
import { createRoot } from "https://esm.sh/react-dom@@19.1.0/client"
import {withTheme} from "https://esm.sh/@rjsf/core@5.24.8"
import {Theme} from "https://esm.sh/@rjsf/mui@5.24.8";
import validator from 'https://esm.sh/@rjsf/validator-ajv8@5.24.8';

const Form = withTheme(Theme);

// Global registry to store form instances and their data
window.rjsfForms = window.rjsfForms || {};
// Global registry to store form schemas
window.rjsfSchemas = window.rjsfSchemas || {};

/**
 * Renders a React JSON Schema Form using React
 * @param {Object} options - The options for rendering the form
 * @param {Object} options.schema - The JSON Schema for the form
 * @param {string} options.rootId - The ID of the HTML element where the form will be rendered
 * @param {Object} options.formData - Initial form data
 * @param {string} options.formId - Unique identifier for this form instance
 */
export function renderForm({
	schema, 
	rootId,
	formData = {},
	formId = "rjsf-form",
	slotId = "",
}) {
	const rootElement = document.getElementById(rootId);
	
	if (!rootElement) {
		console.error(`Element with ID "${rootId}" not found`);
		return;
	}
	
	// Store the form ID in the DOM element for reference
	rootElement.dataset.formId = formId;
	
	// Create a root using the new React 18 API
	const root = createRoot(rootElement);
	
	// Create a handler that both calls the provided onChange and updates Monaco if available
	const handleChange = (data) => {
		// Store the current form data in our registry
		window.rjsfForms[formId] = data.formData;
		
		// Dispatch a custom event that Monaco can listen for
		const event = new CustomEvent('rjsf-form-change', {
			detail: {
				formId,
				formData: data.formData
			}
		});
		document.dispatchEvent(event);
	};
	
	// Register this form in our global registry
	window.rjsfForms[formId] = formData || {};
	
	// Store the schema for future reference
	window.rjsfSchemas[formId] = schema;


	// Render the Form component to the specified root element
	const render = ({formData}) => {
		root.render(
			React.createElement(Form, {
				schema: schema,
				onChange: handleChange,
				validator,
				formData: formData || {},
				onSubmit: ({formData}) => {
					// Show loading indicator
					const btnTextElement = document.getElementById(`btn-text-${formId}`);
					const loadingElement = document.getElementById(`loading-${formId}`);
					
					if (btnTextElement) btnTextElement.style.display = "none";
					if (loadingElement) loadingElement.style.display = "inline-flex";
					
					window.handleSubmitForm && window
						.handleSubmitForm({ formData, slot: slotId })
						.finally(() => {
							// Hide loading indicator when done
							if (btnTextElement) btnTextElement.style.display = "inline";
							if (loadingElement) loadingElement.style.display = "none";
							
							// Scroll to the bottom of the page
							window.scrollTo({
								top: document.body.scrollHeight,
								behavior: 'smooth'
							});
						});
				},
				method: "POST"
				// You can add more props here as needed
				// uiSchema: {},
				// onSubmit: (data) => console.log('submitted', data),
				// onError: (errors) => console.log('errors', errors),
			},
			React.createElement('button', {
				type: "submit",
				className: "bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition-colors",
			}, [
				React.createElement('span', {
					id: `btn-text-${formId}`,
					className: "[.htmx-request_&]:hidden inline"
				}, "Install"),
				React.createElement('span', {
					id: `loading-${formId}`,
					className: "[.htmx-request_&]:hidden items-center",
					style: { display: "none" }
				}, [
					React.createElement('svg', {
						className: "animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block",
						xmlns: "http://www.w3.org/2000/svg",
						fill: "none",
						viewBox: "0 0 24 24"
					}, [
						React.createElement('circle', {
							className: "opacity-25",
							cx: "12",
							cy: "12",
							r: "10",
							stroke: "currentColor",
							strokeWidth: "4"
						}),
						React.createElement('path', {
							className: "opacity-75",
							fill: "currentColor",
							d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
						})
					]),
					"Installing..."
				])
			])
			)
		);
	}

	render({ formData: formData || {} })
	
	// Set up listener for Monaco editor changes
	document.addEventListener('monaco-editor-change', function(event) {
		if (event.detail.formId === formId) {
			const newFormData = event.detail.formData;
			
			// Only update if the data is different to avoid loops
			if (JSON.stringify(window.rjsfForms[formId]) !== JSON.stringify(newFormData)) {
				window.rjsfForms[formId] = newFormData;
				
				try {
				// Re-render the form with the new data
				render({formData: newFormData})
			 } catch(e) {console.log(e)}
			}
		}
	});
}

/**
 * Updates a form with new data from an external source (like Monaco editor)
 * @param {string} formId - The ID of the form to update
 * @param {Object} formData - The new form data
 */
export function updateFormData(formId, formData) {
	// Find the form element
	const formElement = document.querySelector(`[data-form-id="${formId}"]`);
	if (!formElement) {
		console.error(`Form with ID "${formId}" not found`);
		return;
	}
	
	// Get the React root instance
	const rootId = formElement.id;
	const rootElement = document.getElementById(rootId);
	
	if (!rootElement) {
		console.error(`Root element with ID "${rootId}" not found`);
		return;
	}
	
	// Also dispatch an event for any other listeners
	const event = new CustomEvent('monaco-editor-change', {
		detail: {
			formId,
			formData
		}
	});
	document.dispatchEvent(event);
}

// Export a function to get the current form data
export function getFormData(formId = "default-form") {
	return window.rjsfForms[formId] || {};
}

// Make functions globally available for Monaco editor to use
window.updateFormData = updateFormData;
window.getFormData = getFormData;
