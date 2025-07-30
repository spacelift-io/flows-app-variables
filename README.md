# Variables

Store and share variables and secrets across flows.

## Use Cases

### Centralizing Configuration

Store common configuration values in one place and use them across multiple flows. For example:

- **API endpoints** - Define `apiUrl` once, use it in all HTTP requests
- **Environment settings** - Store `environment` (dev/staging/prod) and adapt behavior
- **Feature flags** - Control feature rollouts with boolean variables
- **Common secrets** - Share API keys, database passwords, tokens across workflows

### Sharing Signals Between Apps

Use the app configuration to expose signals from other apps as project-level variables:

```javascript
{
  "variables": {
    "deploymentStatus": ref("signal.cicd.lastDeployment"),
    "systemHealth": ref("signal.monitoring.healthScore")
  },
  "secrets": {
    "dbCredentials": ref("signal.vault.databasePassword")
  }
}
```

This allows flows to react to changes in other apps without direct coupling.

### Dynamic Workflow Coordination

Variables can trigger cascading workflows when they change:

- **Database schema updates** → trigger migration flows
- **New deployment** → trigger notification and testing flows
- **Configuration changes** → trigger dependent service restarts
- **Secret rotation** → trigger credential updates across services

### Flow-Local Variables (Avoid Repetition)

Use Flow Variables like local variables in programming - define once, use multiple times within a flow to avoid errors from redefining the same thing:

- **Computed values** - Calculate once, reference multiple times (e.g., `userId` from JWT token)
- **Configuration constants** - Define `retryCount` or `timeout` once instead of hardcoding everywhere
- **User input** - Capture form data once, use in multiple validation/processing steps
- **Flow-specific config** - Store flow-level settings like `environment` or `debug` flags

## Blocks

### Define Variable/Secret

Creates a variable or secret that other blocks can use.

**Config:**

- `name` - Variable name
- `value` - Variable value

### Use Variable/Secret

Uses a variable or secret defined elsewhere.

**Config:**

- `name` - Variable name to use

**Signals:**

- `value` - Current value

**Outputs:**

- `default` - Emits when value changes

### Flow Variable/Secret

Simple variable scoped to current flow.

**Config:**

- `value` - Variable value

**Signals:**

- `value` - Same as config value, once it's processed

## Usage

1. Add "Define project variable" with name and value
2. Add "Use project variable" blocks wherever you need that value
3. Use outputs to trigger workflows when values change

## App Config

Set initial variables in app configuration. Also useful for exposing signals from other apps as project-level variables:

```javascript
{
  "variables": {
    "apiUrl": "https://api.example.com",
    "databaseStatus": ref("signal.otherApp.connectionStatus")
  },
  "secrets": {
    "apiKey": "secret-key",
    "dbPassword": ref("signal.vaultApp.database_password")
  }
}
```

## Notes

- Variable names: alphanumeric, underscore, hyphen only
- Secrets are marked sensitive throughout the system
- Changes propagate automatically to all Use blocks
