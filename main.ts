import {
  defineApp,
  blocks,
  kv,
  messaging,
  AppLifecycleStatus,
} from "@slflows/sdk/v1";
import { createUseBlock } from "./src/useBlock";
import { createDefineBlock } from "./src/defineBlock";
import { createFlowBlock } from "./src/flowBlock";

export const app = defineApp({
  autoconfirm: true,
  name: "Variables",
  installationInstructions:
    'The app-level variables and secrets configs are useful for exposing signals from other apps as project-level variables. Example: <p>```"oidcToken": ref("signal.oidcToken.token")```</p>',
  config: {
    variables: {
      name: "Plaintext variables",
      description: "Project-level plaintext variables from app configuration",
      type: {
        type: "object",
        additionalProperties: { type: "string" },
      },
      required: false,
      default: {},
    },
    secrets: {
      name: "Secrets",
      description: "Project-level secret variables from app configuration",
      type: {
        type: "object",
        additionalProperties: { type: "string" },
      },
      required: false,
      default: {},
      sensitive: true,
    },
  },
  signals: {
    lastVariables: {
      name: "Variables",
      description: "Last processed variables config",
      sensitive: false,
    },
    lastSecrets: {
      name: "Secrets",
      description: "Last processed secrets config",
      sensitive: true,
    },
  },
  blocks: {
    useVariable: createUseBlock("variable"),
    useSecret: createUseBlock("secret"),
    defineVariable: createDefineBlock("variable"),
    defineSecret: createDefineBlock("secret"),
    flowVariable: createFlowBlock("variable"),
    flowSecret: createFlowBlock("secret"),
  },

  onInternalMessage: async ({ message: { body } }) => {
    // Validate message structure
    if (!body || typeof body !== "object") {
      console.error("Invalid message body:", body);
      return;
    }

    const { action, varType, name: key, owner } = body;

    // Validate required properties
    if (!action || !varType || !key) {
      console.error("Missing required message properties:", {
        action,
        varType,
        key,
      });
      return;
    }

    // Validate varType
    if (varType !== "variable" && varType !== "secret") {
      console.error(
        `Invalid varType: ${varType}. Must be 'variable' or 'secret'`,
      );
      return;
    }

    // Sanitize key name - allow only alphanumeric, underscore, hyphen
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
      console.error(
        `Invalid key format: ${key}. Only alphanumeric, underscore, and hyphen allowed`,
      );
      return;
    }

    if (action === "drain") {
      const drained = await kv.app.set({
        key: `${varType}::${key}`,
        value: null,
        ttl: 0,
        lock: { id: owner },
      });

      // Wasn't drained (lock mismatch), so nothing to update.
      if (!drained) {
        return;
      }
    }

    const typeId = varType === "variable" ? "useVariable" : "useSecret";

    const blockIds = (await blocks.list({ typeIds: [typeId] })).blocks
      .filter(({ config: { name } }) => name === key)
      .map(({ id }) => id);

    await messaging.sendToBlocks({ blockIds, body: {} });
  },

  onSync: async ({
    app: {
      config: { variables, secrets },
      signals: { lastVariables, lastSecrets },
    },
  }) => {
    const vResult = await syncEntities("variable", variables, lastVariables);
    const sResult = await syncEntities("secret", secrets, lastSecrets);

    const managedBlocks = (
      await blocks.list({ typeIds: ["useVariable", "useSecret"] })
    ).blocks;

    const blockIds: string[] = [];
    managedBlocks.forEach(({ id, typeId, config: { name } }) => {
      if (typeId === "useVariable" && vResult.changedKeys[name]) {
        blockIds.push(id);
      } else if (typeId === "useSecret" && sResult.changedKeys[name]) {
        blockIds.push(id);
      }
    });

    await messaging.sendToBlocks({ blockIds, body: {} });

    let newStatus: AppLifecycleStatus = "ready";
    if (
      Object.keys(vResult.failedKeys).length > 0 ||
      Object.keys(sResult.failedKeys).length > 0
    ) {
      newStatus = "failed";
    }

    return {
      newStatus,
      signalUpdates: {
        lastVariables: variables,
        lastSecrets: secrets,
      },
    };
  },
});

interface SyncResult {
  changedKeys: Record<string, boolean>;
  failedKeys: Record<string, boolean>;
}

async function syncEntities(
  varType: string,
  newValues: Record<string, string>,
  lastValues: Record<string, string> = {},
): Promise<SyncResult> {
  // Validate varType
  if (varType !== "variable" && varType !== "secret") {
    throw new Error(
      `Invalid varType: ${varType}. Must be 'variable' or 'secret'`,
    );
  }

  // Validate and sanitize all keys
  for (const key of [...Object.keys(newValues), ...Object.keys(lastValues)]) {
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
      throw new Error(
        `Invalid key format: ${key}. Only alphanumeric, underscore, and hyphen allowed`,
      );
    }
  }

  const result: SyncResult = {
    changedKeys: {},
    failedKeys: {},
  };

  // Add/update operations only for changed values
  for (const [key, value] of Object.entries(newValues)) {
    if (lastValues[key] === value) {
      continue;
    }

    result.changedKeys[key] = true;

    try {
      const success = await kv.app.set({
        key: `${varType}::${key}`,
        value,
        lock: { id: "app" },
      });

      if (!success) {
        console.error(`Failed to set ${varType}::${key} - already exists?`);
        result.failedKeys[key] = true;
      }
    } catch (error) {
      console.error(`Error setting ${varType}::${key}:`, error);
      result.failedKeys[key] = true;
    }
  }

  // Add delete operations for removed values
  for (const key of Object.keys(lastValues)) {
    if (key in newValues) {
      continue;
    }

    result.changedKeys[key] = true;

    try {
      const success = await kv.app.set({
        key: `${varType}::${key}`,
        value: null,
        ttl: 0,
        lock: { id: "app" },
      });

      if (!success) {
        console.error(
          `Failed to delete ${varType}::${key} - owned by a block?`,
        );
        result.failedKeys[key] = true;
      }
    } catch (error) {
      console.error(`Error deleting ${varType}::${key}:`, error);
      result.failedKeys[key] = true;
    }
  }

  return result;
}
