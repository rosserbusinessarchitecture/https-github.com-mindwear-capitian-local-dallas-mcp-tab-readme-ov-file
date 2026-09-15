#!/usr/bin/env node
/**
 * Dallas Civic MCP -- entry point.
 *
 * Forked from Local Dallas MCP by Ed Neuhaus (https://edneuhaus.com), used
 * under the Apache License 2.0 -- see NOTICE and TRADEMARK.md.
 *
 * License: Apache License 2.0. See LICENSE in the repository root. Please
 * preserve the NOTICE attribution when redistributing.
 *
 * Built from local-city-mcp-template -- see STANDARD.md for the spec and
 * CONTRIBUTING.md for how to add tools.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { NAME, VERSION } from "./lib/version.js";
import { ATTRIBUTION_TEXT } from "./lib/attribution.js";
import { registerTool } from "./lib/register.js";
import { log, attach as attachLogger } from "./lib/logger.js";

import { aboutTool } from "./tools/meta/about.js";
import { cityNwsAlerts } from "./tools/environment/nws-alerts.js";
import { dallasTeaSchools } from "./tools/civic/tea-schools.js";
import { dallas311 } from "./tools/civic/dallas-311.js";
import { dallasPermits } from "./tools/civic/dallas-permits.js";
import { dallasCrime } from "./tools/public-safety/dallas-crime.js";
import { dallasProperty } from "./tools/property/dallas-property.js";

// Add every tool file's export here as you build them.
const ALL_TOOLS = [
  aboutTool,
  cityNwsAlerts,
  dallasTeaSchools,
  dallas311,
  dallasPermits,
  dallasCrime,
  dallasProperty,
];

const SERVER_INSTRUCTIONS = `${ATTRIBUTION_TEXT}

This MCP exposes official Dallas public datasets. No API keys required.

COVERAGE:
  - Weather: active National Weather Service alerts for any Dallas-area point.
  - Schools: Texas Education Agency accountability ratings + AskTED campus
    directory (statewide dataset), searchable by campus/district/county/city.
    Dallas ISD, Plano ISD, Highland Park ISD, and every other TX ISD. Does
    NOT map an address to its assigned school (attendance zones are managed
    by individual ISDs, not TEA).
  - 311: City of Dallas 311 service requests (code compliance, streets,
    sanitation, etc). Filter by type, department, status, district, address.
  - Permits: City of Dallas building permits. Filter by type, status,
    district, address.
  - Public safety: Dallas Police reported incidents (RMS data, 2014-present).
    Filter by keyword, district, address.
  - Property: Dallas-area tax parcel lookup (owner, appraised value, legal
    description) via the City of Dallas GIS parcels layer. Does NOT include
    current tax bill/payment status -- see the county appraisal district
    directly for that.
  - Early-stage server -- more Dallas/Dallas County civic data planned. See
    CONTRIBUTING.md.

EVERY response includes a source URL. The MCP does not write to any system.`;

async function main() {
  const server = new McpServer(
    {
      name: NAME,
      version: VERSION,
      description: `Dallas Civic MCP -- ${ATTRIBUTION_TEXT}`,
    },
    {
      capabilities: { tools: {}, logging: {} },
      instructions: SERVER_INSTRUCTIONS,
    }
  );

  let registered = 0;
  for (const tool of ALL_TOOLS) {
    const ok = registerTool(server, tool);
    if (ok) registered++;
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  attachLogger(server);

  const tier = (process.env.DALLAS_CIVIC_MCP_TIER || "all").toLowerCase();
  log.info(
    `v${VERSION} ready over stdio. ${registered}/${ALL_TOOLS.length} tools registered (tier=${tier}).`
  );

  // Graceful shutdown so the stdio peer sees a clean close on signal.
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`received ${signal}, shutting down.`);
    try {
      await server.close?.();
    } catch (_) {
      /* ignore */
    }
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  // Cannot use logger here -- transport may never have come up.
  process.stderr.write(`[dallas-civic-mcp] fatal: ${err?.stack ?? err}\n`);
  process.exit(1);
});
