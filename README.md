# Dallas Civic MCP

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-stdio-purple)](https://modelcontextprotocol.io/)

> **Your AI's local guide to Dallas.** A Model Context Protocol (MCP) server giving Claude (and any MCP client) plain-English access to official Dallas-area public data — no API keys, no logins.

**License:** Open source under **[Apache License 2.0](LICENSE)** — free to use, modify, and build on, including commercially. Please keep the [NOTICE](NOTICE) attribution when you redistribute.
**Forked from:** [Local Dallas MCP](https://github.com/mindwear-capitian/local-dallas-mcp) by [Ed Neuhaus](https://edneuhaus.com), used under the Apache License 2.0. This fork adds building permits, public-safety (police incidents), and property/tax-parcel lookup on top of the original weather, schools, and 311 tools.
**Part of a family:** [local-city-mcp-template](https://github.com/mindwear-capitian/local-city-mcp-template) — the spec, the template, and the full list of cities built so far.

> 🚧 **Early-stage.** Six tools live today (weather alerts, school ratings, 311, building permits, police incidents, property/tax parcels). See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Install

Add to your Claude Desktop config:

```jsonc
// claude_desktop_config.json
{
  "mcpServers": {
    "dallas-civic": {
      "command": "npx",
      "args": ["-y", "github:rosserbusinessarchitecture/https-github.com-mindwear-capitian-local-dallas-mcp-tab-readme-ov-file"]
    }
  }
}
```

Restart Claude Desktop. No API keys required for any tool.

### Claude Code

```bash
claude mcp add dallas-civic npx -y github:rosserbusinessarchitecture/https-github.com-mindwear-capitian-local-dallas-mcp-tab-readme-ov-file
```

---

## Try it

- *"Is there an active weather alert for Dallas right now?"*
- *"What's the TEA rating for Dallas ISD?"*
- *"Show me A-rated elementary schools in Dallas county."*
- *"Any open code compliance 311 requests in council district 10?"*
- *"What building permits were recently issued on Elm St?"*
- *"Any reported police incidents near downtown recently?"*
- *"Who owns 9501 San Lucas and what's it appraised at?"*

---

## Tools (6 live)

| Tool | What it does |
|------|--------------|
| `dallas_nws_alerts` | Active National Weather Service alerts (severe thunderstorm, tornado, flood, heat, freeze, fire weather) for a Dallas location. Defaults to central Dallas when no address given. |
| `dallas_tea_schools` | Texas Education Agency school lookup — A-F accountability ratings + AskTED campus directory (statewide dataset). Search by campus, district, county, or city. Example districts: Dallas ISD, Plano ISD, Highland Park ISD. |
| `dallas_311` | City of Dallas 311 service requests (code compliance, streets, sanitation, etc). Filter by type, department, status, council district, or address. |
| `dallas_permits` | City of Dallas building permits (new construction, remodels, electrical, mechanical, plumbing, etc). Filter by type, status, council district, or address. |
| `dallas_crime` | Dallas Police reported incidents (RMS data, 2014-present). Filter by keyword, council district, or address. |
| `dallas_property` | Dallas-area tax parcel lookup (owner, appraised value, legal description) via the City of Dallas GIS parcels layer. |
| `about` | Version + capability summary. |

## Sources of Truth

| Domain | Source |
|--------|--------|
| Weather alerts | National Weather Service (api.weather.gov) |
| School ratings | Texas Education Agency Statewide Accountability Ratings 2022-2023 + AskTED directory (data.texas.gov) — statewide dataset, same source used by [local-austin-mcp](https://github.com/mindwear-capitian/local-austin-mcp) |
| 311 service requests | City of Dallas Open Data (dallasopendata.com), dataset `gc4d-8a49` |
| Building permits | City of Dallas Open Data (dallasopendata.com), dataset `e7gq-4sah` |
| Police incidents | City of Dallas Open Data (dallasopendata.com), dataset `4ea4-q4ui` ("RMS Incidents With GeoLocation") |
| Property / tax parcels | City of Dallas GIS `DallasTaxParcels` FeatureServer, built from certified Dallas/Collin/Denton/Kaufman/Rockwall county appraisal-district data |
| Geocoding | U.S. Census geocoder |

**A note on the newer tools:** `dallas_permits`, `dallas_crime`, and `dallas_property` resolve their upstream field/column names *at runtime* against each source's own metadata endpoint, instead of hardcoding guessed names — this fork's development environment had no outbound network access to verify exact field names against a live sample before shipping. Run `npm run test:contract` (needs real internet access) to confirm each tool's discovered fields look sensible, and widen the candidate substrings in the tool file if a filter that should narrow results doesn't. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Architecture

Node.js (ES modules), `@modelcontextprotocol/sdk` over stdio. Built from [local-city-mcp-template](https://github.com/mindwear-capitian/local-city-mcp-template) — see that repo's `STANDARD.md` for the spec (hard rules, tool contract, testing bar, licensing pattern) this server follows. Every response includes a `source_url`.

## Contact

Forked from [Local Dallas MCP](https://github.com/mindwear-capitian/local-dallas-mcp) by [Ed Neuhaus](https://edneuhaus.com). This fork is maintained by [rosserbusinessarchitecture](https://github.com/rosserbusinessarchitecture). Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
