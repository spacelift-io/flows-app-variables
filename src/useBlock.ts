import { AppBlock, kv, lifecycle, events } from "@slflows/sdk/v1";

type ValidType = "variable" | "secret";

export function createUseBlock(type: ValidType): AppBlock {
  // Runtime validation
  if (type !== "variable" && type !== "secret") {
    throw new Error(`Invalid type: ${type}. Must be 'variable' or 'secret'`);
  }

  const sensitive = type === "secret";

  return {
    name: `Use project ${type}`,
    description: `Use a project-level ${sensitive ? "secret" : "plaintext variable"}`,
    category: sensitive ? "Secrets" : "Variables",

    config: {
      name: {
        name: `${sensitive ? "Secret" : "Variable"} name`,
        description: `Name of the ${sensitive ? "secret" : "plaintext variable"} to retrieve`,
        type: "string",
        required: true,
        fixed: true, // Fixed name to ensure it's always provided
      },
    },

    signals: {
      value: {
        name: "Value",
        description: `Current value of the ${sensitive ? "secret" : "plaintext variable"}`,
        sensitive,
      },
    },

    outputs: {
      default: {
        name: "Value changed",
        description: `Emitted when the ${sensitive ? "secret" : "plaintext variable"} value changes`,
        type: {
          type: "object",
          properties: {
            name: { type: "string" },
            previousValue: { type: "string" },
            newValue: { type: "string" },
          },
        },
      },
    },

    onInternalMessage: async () => {
      await lifecycle.sync();
    },

    onSync: async ({ block }) => {
      const { value } = await kv.app.get(`${type}::${block.config.name}`);

      if (value === undefined) {
        return {
          signalUpdates: { value: null },
          newStatus: "failed",
          customStatusDescription: "Not found",
        };
      }

      // Check if value has changed from previous signal
      const previousValue = block.lifecycle?.signals?.value;
      const hasChanged = previousValue !== value;

      // Emit event if value changed
      if (hasChanged) {
        await events.emit({
          name: block.config.name,
          previousValue,
          newValue: value,
        });
      }

      return {
        signalUpdates: { value },
        newStatus: "ready",
      };
    },
  };
}
