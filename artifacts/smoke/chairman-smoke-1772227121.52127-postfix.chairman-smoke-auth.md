# Chairman Auth Smoke

- Base URL: `https://boursedelor.com`
- Tenant key: `bdo`
- Tenant id: `1`
- Tag: `chairman-smoke-1772227121.52127-postfix`

- [PASS] terminal-agent (`/api/tenants/1/terminal-agent`): assistant=Tassi Hangbé
- [PASS] assistant.thread (`/api/assistant/thread`): threadId=2
- [PASS] assistant.message (`/api/assistant/message`): assistantMessageId=61
- [PASS] actions.run.create (`/api/actions/run`): runId=42
- [PASS] actions.evidence.complete (`/api/actions/run/42/evidence`): runStatus=SUCCEEDED
- [PASS] quick-token.create (`/api/chairman/quick-token`): tokenPrefix=rShC-w
- [PASS] quick-token.redeem.once (`/api/chairman/quick-token/redeem`): redeem succeeded
- [PASS] quick-token.redeem.second.blocked (`/api/chairman/quick-token/redeem`): blocked with 401
