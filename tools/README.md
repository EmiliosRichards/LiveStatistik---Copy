# Debug and Tests

This folder contains small scripts to validate external Postgres connectivity and APIs.

- tests/db-connectivity.ts
  - Reads EXTERNAL_DB_* envs
  - Does a TCP socket probe to host:5432
  - Connects with pg and runs SELECT NOW(), prints server address/port and version

Run:

```
npm run test:db:ping
```

If you need to test specific agent/campaign queries, see:

- tests/agent-campaign-calls.ts
- tests/calls-for-agent-campaign.ts
- tests/campaigns-for-agents.ts

```
npm run test:agent-campaign "Agent.Login" "optional-campaign-title-substring"
```
