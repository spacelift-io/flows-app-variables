import { AppBlock, events } from "@slflows/sdk/v1";

type ValidType = "variable" | "secret";

export function createFlowBlock(type: ValidType): AppBlock {
  // Runtime validation
  if (type !== "variable" && type !== "secret") {
    throw new Error(`Invalid type: ${type}. Must be 'variable' or 'secret'`);
  }

  const sensitive = type === "secret";

  return {
    name: `Flow-local ${type}`,
    description: `Store and manage a flow-local ${sensitive ? "secret" : "plaintext variable"}`,
    category: sensitive ? "Secrets" : "Variables",

    config: {
      value: {
        name: "Value",
        description: `Value of the flow-local ${sensitive ? "secret" : "plaintext variable"}`,
        type: "string",
        required: true,
        sensitive,
      },
    },

    signals: {
      value: {
        name: "Value",
        description: `Value of the flow-local ${sensitive ? "secret" : "plaintext variable"}`,
        sensitive,
      },
    },

    outputs: {
      default: {
        description: `Emitted when the flow-local ${sensitive ? "secret" : "variable"} value changes`,
        type: {
          type: "object",
          properties: {
            value: { type: "string" },
            previousValue: { type: "string" },
          },
          required: ["value"],
        },
      },
    },

    onSync: async ({
      block: {
        config: { value },
        lifecycle,
      },
    }) => {
      // Get previous value to check for changes
      const previousValue = lifecycle?.signals?.value;

      // Emit event if value changed
      if (previousValue !== value) {
        await events.emit({
          value,
          ...(previousValue !== undefined && { previousValue }),
        });
      }

      return {
        newStatus: "ready",
        signalUpdates: { value },
      };
    },
  };
}
