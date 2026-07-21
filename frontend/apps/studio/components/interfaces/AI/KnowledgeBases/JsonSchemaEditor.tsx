/**
 * JsonSchemaEditor - Visual editor for doc2json extraction schemas.
 *
 * Allows users to define a JSON schema with fields that have:
 * - name: Field identifier
 * - description: What to extract (LLM instruction)
 * - type: string, number, boolean, array, object
 * - default: Default value if not found
 * - examples: Example values to guide extraction
 */

import { useState } from "react";

export interface JsonSchemaField {
  name: string;
  description: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  default?: string | number | boolean | null;
  examples?: string[];
  // For nested objects
  properties?: JsonSchemaField[];
  // For arrays
  items?: JsonSchemaField;
}

export interface JsonSchemaEditorProps {
  schema: JsonSchemaField[];
  onChange: (schema: JsonSchemaField[]) => void;
  maxDepth?: number;
}

const TYPE_OPTIONS: { value: JsonSchemaField["type"]; label: string }[] = [
  { value: "string", label: "String" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "array", label: "Array" },
  { value: "object", label: "Object" },
];

function FieldEditor({
  field,
  onChange,
  onRemove,
  depth = 0,
  maxDepth = 3,
}: {
  field: JsonSchemaField;
  onChange: (field: JsonSchemaField) => void;
  onRemove: () => void;
  depth?: number;
  maxDepth?: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const [examplesText, setExamplesText] = useState(
    field.examples?.join(", ") ?? ""
  );

  const updateField = (updates: Partial<JsonSchemaField>) => {
    onChange({ ...field, ...updates });
  };

  const handleExamplesChange = (value: string) => {
    setExamplesText(value);
    const examples = value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    updateField({ examples: examples.length > 0 ? examples : undefined });
  };

  const addNestedField = () => {
    if (field.type === "object") {
      const newField: JsonSchemaField = {
        name: "",
        description: "",
        type: "string",
      };
      updateField({
        properties: [...(field.properties || []), newField],
      });
    } else if (field.type === "array") {
      updateField({
        items: {
          name: "item",
          description: "",
          type: "string",
        },
      });
    }
  };

  const indent = depth * 16;

  return (
    <div
      className="border border-default rounded-lg mb-2 bg-surface-100"
      style={{ marginLeft: indent }}
    >
      <div className="flex items-center gap-2 p-2 bg-surface-200 rounded-t-lg">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-foreground-muted hover:text-foreground p-1"
        >
          {expanded ? "▼" : "▶"}
        </button>
        <input
          type="text"
          placeholder="Field name"
          value={field.name}
          onChange={(e) => updateField({ name: e.target.value })}
          className="flex-1 px-2 py-1 text-sm bg-surface-100 border border-default rounded text-foreground focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
        <select
          value={field.type}
          onChange={(e) => {
            const newType = e.target.value as JsonSchemaField["type"];
            const updates: Partial<JsonSchemaField> = { type: newType };
            // Clear nested structure when type changes
            if (newType !== "object") updates.properties = undefined;
            if (newType !== "array") updates.items = undefined;
            updateField(updates);
          }}
          className="px-2 py-1 text-sm bg-surface-100 border border-default rounded text-foreground focus:outline-none focus:ring-1 focus:ring-brand-400"
        >
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRemove}
          className="text-red-400 hover:text-red-300 p-1 text-sm"
          title="Remove field"
        >
          ✕
        </button>
      </div>

      {expanded && (
        <div className="p-3 space-y-2">
          <div>
            <label className="block text-xs text-foreground-lighter mb-1">
              Description (extraction instruction)
            </label>
            <textarea
              value={field.description}
              onChange={(e) => updateField({ description: e.target.value })}
              placeholder="Describe what to extract for this field..."
              rows={2}
              className="w-full px-2 py-1 text-sm bg-surface-200 border border-default rounded text-foreground focus:outline-none focus:ring-1 focus:ring-brand-400 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-foreground-lighter mb-1">
                Default value
              </label>
              <input
                type="text"
                value={field.default?.toString() ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  let parsed: string | number | boolean | null = val;
                  if (field.type === "number" && val !== "") {
                    parsed = Number(val);
                  } else if (field.type === "boolean") {
                    parsed = val.toLowerCase() === "true";
                  } else if (val === "") {
                    parsed = undefined as unknown as null;
                  }
                  updateField({ default: parsed });
                }}
                placeholder={
                  field.type === "boolean" ? "true/false" : "Default..."
                }
                className="w-full px-2 py-1 text-sm bg-surface-200 border border-default rounded text-foreground focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </div>
            <div>
              <label className="block text-xs text-foreground-lighter mb-1">
                Examples (comma-separated)
              </label>
              <input
                type="text"
                value={examplesText}
                onChange={(e) => handleExamplesChange(e.target.value)}
                placeholder="e.g., value1, value2"
                className="w-full px-2 py-1 text-sm bg-surface-200 border border-default rounded text-foreground focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </div>
          </div>

          {/* Nested object properties */}
          {field.type === "object" && depth < maxDepth && (
            <div className="mt-3 pt-3 border-t border-default">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-foreground-lighter">
                  Object properties
                </span>
                <button
                  type="button"
                  onClick={addNestedField}
                  className="text-xs text-brand-600 hover:text-brand-600"
                >
                  + Add property
                </button>
              </div>
              {(field.properties || []).map((prop, idx) => (
                <FieldEditor
                  key={idx}
                  field={prop}
                  onChange={(updated) => {
                    const newProps = [...(field.properties || [])];
                    newProps[idx] = updated;
                    updateField({ properties: newProps });
                  }}
                  onRemove={() => {
                    const newProps = (field.properties || []).filter(
                      (_, i) => i !== idx
                    );
                    updateField({ properties: newProps });
                  }}
                  depth={depth + 1}
                  maxDepth={maxDepth}
                />
              ))}
            </div>
          )}

          {/* Array items definition */}
          {field.type === "array" && depth < maxDepth && (
            <div className="mt-3 pt-3 border-t border-default">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-foreground-lighter">
                  Array item type
                </span>
                {!field.items && (
                  <button
                    type="button"
                    onClick={addNestedField}
                    className="text-xs text-brand-600 hover:text-brand-600"
                  >
                    + Define item
                  </button>
                )}
              </div>
              {field.items && (
                <FieldEditor
                  field={field.items}
                  onChange={(updated) => updateField({ items: updated })}
                  onRemove={() => updateField({ items: undefined })}
                  depth={depth + 1}
                  maxDepth={maxDepth}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function JsonSchemaEditor({
  schema,
  onChange,
  maxDepth = 3,
}: JsonSchemaEditorProps) {
  const addField = () => {
    const newField: JsonSchemaField = {
      name: "",
      description: "",
      type: "string",
    };
    onChange([...schema, newField]);
  };

  const updateField = (index: number, field: JsonSchemaField) => {
    const newSchema = [...schema];
    newSchema[index] = field;
    onChange(newSchema);
  };

  const removeField = (index: number) => {
    onChange(schema.filter((_, i) => i !== index));
  };

  // Convert schema to JSON format for display
  const schemaToJson = (fields: JsonSchemaField[]): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const field of fields) {
      if (!field.name) continue;
      if (field.type === "object" && field.properties) {
        result[field.name] = schemaToJson(field.properties);
      } else if (field.type === "array" && field.items) {
        result[field.name] = [schemaToJson([field.items])];
      } else {
        result[field.name] = field.default ?? `<${field.type}>`;
      }
    }
    return result;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm text-foreground-light">
          JSON extraction schema
        </label>
        <button
          type="button"
          onClick={addField}
          className="text-sm text-brand-600 hover:text-brand-600"
        >
          + Add field
        </button>
      </div>

      {schema.length === 0 && (
        <p className="text-xs text-foreground-muted py-4 text-center border border-dashed border-default rounded-lg">
          No fields defined. Click &quot;Add field&quot; to define the JSON structure to
          extract.
        </p>
      )}

      {schema.map((field, idx) => (
        <FieldEditor
          key={idx}
          field={field}
          onChange={(updated) => updateField(idx, updated)}
          onRemove={() => removeField(idx)}
          maxDepth={maxDepth}
        />
      ))}

      {schema.length > 0 && (
        <div className="mt-4 pt-4 border-t border-default">
          <label className="block text-xs text-foreground-lighter mb-1">
            Output JSON structure preview
          </label>
          <pre className="p-2 text-xs bg-surface-200 border border-default rounded text-foreground-muted overflow-auto max-h-32">
            {JSON.stringify(schemaToJson(schema), null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

/**
 * Convert JsonSchemaField[] to the format expected by the backend indexing algorithm.
 */
export function schemaFieldsToBackendFormat(
  fields: JsonSchemaField[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (!field.name) continue;
    result[field.name] = {
      description: field.description,
      type: field.type,
      default: field.default,
      examples: field.examples,
      ...(field.type === "object" && field.properties
        ? { properties: schemaFieldsToBackendFormat(field.properties) }
        : {}),
      ...(field.type === "array" && field.items
        ? { items: { ...(schemaFieldsToBackendFormat([field.items])[field.items.name] as Record<string, unknown>), name: field.items.name } }
        : {}),
    };
  }
  return result;
}

/**
 * Convert backend schema format to JsonSchemaField[].
 * Handles both formats:
 * 1. Dict format: {"field_name": {"type": "string", "description": "..."}}
 * 2. Array format: {"fields": [{"name": "field_name", "type": "string"}]}
 */
export function backendFormatToSchemaFields(
  schema: Record<string, unknown>
): JsonSchemaField[] {
  // Handle array format (canonical backend format)
  if (Array.isArray(schema.fields)) {
    const fields: JsonSchemaField[] = [];
    for (const fieldDef of schema.fields as Record<string, unknown>[]) {
      const name = fieldDef.name as string;
      if (!name) continue;
      const field: JsonSchemaField = {
        name,
        description: (fieldDef.description as string) || "",
        type: (fieldDef.type as JsonSchemaField["type"]) || "string",
        default: fieldDef.default as string | number | boolean | null | undefined,
        examples: fieldDef.examples as string[] | undefined,
      };
      // Handle nested objects - check both "fields" (canonical) and "properties" keys
      const nestedFields = fieldDef.fields || fieldDef.properties;
      if (field.type === "object" && nestedFields) {
        field.properties = backendFormatToSchemaFields(
          { fields: nestedFields } as Record<string, unknown>
        );
      }
      // Handle array items
      if (field.type === "array" && fieldDef.items) {
        const itemDef = fieldDef.items as Record<string, unknown>;
        const itemField: JsonSchemaField = {
          name: (itemDef.name as string) || "item",
          description: (itemDef.description as string) || "",
          type: (itemDef.type as JsonSchemaField["type"]) || "string",
          default: itemDef.default as string | number | boolean | null | undefined,
          examples: itemDef.examples as string[] | undefined,
        };
        // Handle nested object items
        const itemNestedFields = itemDef.fields || itemDef.properties;
        if (itemField.type === "object" && itemNestedFields) {
          itemField.properties = backendFormatToSchemaFields(
            { fields: itemNestedFields } as Record<string, unknown>
          );
        }
        field.items = itemField;
      }
      fields.push(field);
    }
    return fields;
  }

  // Handle dict format (frontend format stored as-is)
  const fields: JsonSchemaField[] = [];
  for (const [name, value] of Object.entries(schema)) {
    if (typeof value !== "object" || value === null) continue;
    const fieldDef = value as Record<string, unknown>;
    const field: JsonSchemaField = {
      name,
      description: (fieldDef.description as string) || "",
      type: (fieldDef.type as JsonSchemaField["type"]) || "string",
      default: fieldDef.default as string | number | boolean | null | undefined,
      examples: fieldDef.examples as string[] | undefined,
    };
    // Handle nested objects - properties key from frontend format
    if (field.type === "object" && fieldDef.properties) {
      field.properties = backendFormatToSchemaFields(
        fieldDef.properties as Record<string, unknown>
      );
    }
    // Handle array items
    if (field.type === "array" && fieldDef.items) {
      const itemDef = fieldDef.items as Record<string, unknown>;
      const itemField: JsonSchemaField = {
        name: (itemDef.name as string) || "item",
        description: (itemDef.description as string) || "",
        type: (itemDef.type as JsonSchemaField["type"]) || "string",
        default: itemDef.default as string | number | boolean | null | undefined,
        examples: itemDef.examples as string[] | undefined,
      };
      // Handle nested object items
      if (itemField.type === "object" && itemDef.properties) {
        itemField.properties = backendFormatToSchemaFields(
          itemDef.properties as Record<string, unknown>
        );
      }
      field.items = itemField;
    }
    fields.push(field);
  }
  return fields;
}
