import { AppBlock, kv, messaging, events } from "@slflows/sdk/v1";

type ValidType = "variable" | "secret";

export function createDefineBlock(type: ValidType): AppBlock {
  // Runtime validation
  if (type !== "variable" && type !== "secret") {
    throw new Error(`Invalid type: ${type}. Must be 'variable' or 'secret'`);
  }

  const sensitive = type === "secret";

  return {
    name: `Define project ${type}`,
    description: `Define a project-level ${sensitive ? "secret" : "plaintext variable"}`,
    category: sensitive ? "Secrets" : "Variables",

    config: {
      name: {
        name: `${sensitive ? "Secret" : "Variable"} name`,
        description: `Name of the project-level ${sensitive ? "secret" : "plaintext variable"}`,
        type: "string",
        required: true,
        sensitive: false,
        fixed: true, // Fixed name to ensure it's always provided
      },

      value: {
        name: "Value",
        description: `Value of the project-level ${sensitive ? "secret" : "plaintext variable"}`,
        type: "string",
        required: true,
        sensitive,
      },
    },

    signals: {
      value: {
        name: "Value",
        description: `Current value of the project-level ${sensitive ? "secret" : "plaintext variable"}`,
        sensitive,
      },
    },

    outputs: {
      default: {
        description: `Emitted when the ${sensitive ? "secret" : "variable"} value changes`,
        type: {
          type: "object",
          properties: {
            name: { type: "string" },
            value: { type: "string" },
            previousValue: { type: "string" },
          },
          required: ["name", "value"],
        },
      },
    },

    onSync: async ({
      block: {
        id,
        config: { name, value },
        lifecycle,
      },
    }) => {
      try {
        // Get previous value to check for changes
        const previousValue = lifecycle?.signals?.value;

        const isSet = await kv.app.set({
          key: `${type}::${name}`,
          value: value,
          lock: { id },
        });

        if (!isSet) {
          return {
            newStatus: "failed",
            customStatusDescription: "Failed to set, already exists?",
          };
        }

        // Emit event if value changed
        if (previousValue !== value) {
          await events.emit({
            name,
            value,
            ...(previousValue !== undefined && { previousValue }),
          });
        }

        await messaging.sendToApp({
          body: { action: "sync", varType: type, name },
        });

        return { newStatus: "ready", signalUpdates: { value } };
      } catch (error) {
        console.error(`Error setting ${type}: `, error);
        return {
          newStatus: "failed",
          customStatusDescription: "See logs for details",
        };
      }
    },

    onDrain: async ({ block }) => {
      try {
        // Only drain if signal is being emitted.
        if (block.lifecycle?.signals?.value === undefined) {
          return { newStatus: "drained" };
        }

        await messaging.sendToApp({
          body: {
            action: "drain",
            varType: type,
            name: block.config.name,
            owner: block.id,
          },
        });

        return { newStatus: "drained" };
      } catch (error) {
        console.error(`Error draining ${type}: `, error);

        return {
          newStatus: "draining_failed",
          customStatusDescription: "See logs for details",
        };
      }
    },
  };
}
