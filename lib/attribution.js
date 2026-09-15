/**
 * Attribution constants surfaced in the MCP's user-facing output.
 *
 * This project is a derivative work based on Local Dallas MCP by Ed Neuhaus
 * (https://edneuhaus.com), used under the Apache License 2.0. Per that
 * license's NOTICE requirements and local-dallas-mcp's TRADEMARK.md, the
 * original attribution is preserved in NOTICE and below rather than
 * presenting this fork as the original project.
 */

export const ATTRIBUTION_TEXT =
  "Maintained by rosserbusinessarchitecture -- forked from Local Dallas MCP by Ed Neuhaus (https://edneuhaus.com).";

export const ATTRIBUTION_TAG =
  "(via Dallas Civic MCP -- forked from Local Dallas MCP by Ed Neuhaus)";

export const PROJECT_NAME = "Dallas Civic MCP";

export const HOMEPAGE =
  "https://github.com/rosserbusinessarchitecture/https-github.com-mindwear-capitian-local-dallas-mcp-tab-readme-ov-file";

export const LICENSE_URL = `${HOMEPAGE}/blob/main/LICENSE`;

/**
 * Identity function kept for parity with the reference implementation so
 * tool files can call `withAttributionTag(description)` uniformly. Attribution
 * is surfaced via the MCP server `instructions` field (once per session), the
 * `about` tool, and the footer of every tool response body -- not repeated
 * inside every tool description.
 */
export function withAttributionTag(description) {
  return description;
}
