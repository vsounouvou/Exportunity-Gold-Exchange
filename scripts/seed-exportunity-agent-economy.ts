/**
 * Retired legacy seed.
 *
 * This seed previously created synthetic Exportunity activity, broad admin
 * accounts, and predictable credentials. It is intentionally blocked so it
 * cannot alter a live industrial tenant. The evidence-backed industrial agent
 * organization is seeded through seed-exportunity-industrial-agents.ts.
 */
console.error(
  "The legacy Exportunity agent-economy seed is retired. Use seed:exportunity-industrial-agents and verified industrial data workflows instead.",
);
process.exitCode = 1;
