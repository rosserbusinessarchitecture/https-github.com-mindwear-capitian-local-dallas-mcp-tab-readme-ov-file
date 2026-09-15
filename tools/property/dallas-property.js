import { z } from "zod";
import { queryLayer, likeClause, describeService, describeLayerFields, findField } from "../../lib/arcgis.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * Dallas property/tax parcel lookup -- City of Dallas GIS "DallasTaxParcels"
 * FeatureServer, built from certified appraisal-district data (Dallas,
 * Collin, Denton, Kaufman, and Rockwall CADs) for the City of Dallas and a
 * one-mile buffer. This is an official City of Dallas GIS layer republishing
 * county-appraisal-district data -- not a third-party aggregator.
 *
 * The Dallas Central Appraisal District (dallascad.org) itself does not
 * offer a public query API, only bulk data-file downloads -- unusable for a
 * zero-setup `npx`-installed tool. This ArcGIS layer is the closest
 * official, live-queryable, no-key alternative for per-parcel lookups.
 *
 * Layer index and field names are resolved at runtime (`describeService` +
 * `describeLayerFields` + `findField`) rather than hardcoded, because this
 * fork's build environment has no outbound network access to confirm them
 * against the live service. Run `npm run test:contract` (needs real
 * internet access) to verify the discovered fields look right, and widen
 * the candidate substrings below if they don't resolve.
 *
 * Source: https://gis.dallascityhall.com/arcgis/rest/services/Basemap/DallasTaxParcels/FeatureServer
 */
const FEATURE_SERVER = "https://gis.dallascityhall.com/arcgis/rest/services/Basemap/DallasTaxParcels/FeatureServer";
const SERVICE_PAGE_URL = "https://gis.dallascityhall.com/arcgis/rest/services/Basemap/DallasTaxParcels/FeatureServer";
const DCAD_URL = "https://www.dallascad.org/";

let resolvedPromise = null;
async function resolveLayer() {
  if (!resolvedPromise) {
    resolvedPromise = (async () => {
      const layers = await describeService(FEATURE_SERVER);
      const parcelLayer = layers.find((l) => /parcel/i.test(l.name)) ?? layers[0] ?? { id: 0 };
      const layerUrl = `${FEATURE_SERVER}/${parcelLayer.id}`;
      const fieldMeta = await describeLayerFields(layerUrl);
      return {
        layerUrl,
        fields: {
          account: findField(fieldMeta, ["account", "acct", "parcel_id", "apn"]),
          address: findField(fieldMeta, ["situs", "site_addr", "prop_addr", "address"]),
          owner: findField(fieldMeta, ["owner_name", "owner"]),
          totalValue: findField(fieldMeta, ["total_val", "market_val", "appraised", "total_value"]),
          landValue: findField(fieldMeta, ["land_val", "land_value"]),
          improvementValue: findField(fieldMeta, ["impr_val", "improvement_value", "bldg_val"]),
          legalDescription: findField(fieldMeta, ["legal_desc", "legal_description"]),
          acreage: findField(fieldMeta, ["acreage", "acres"]),
        },
      };
    })();
  }
  return resolvedPromise;
}

export const dallasProperty = {
  name: "dallas_property",
  description: withAttributionTag(
    "Look up a Dallas-area tax parcel by street address or account number: " +
      "owner name, appraised/land/improvement value, legal description, and " +
      "acreage, from the City of Dallas GIS parcels layer (built from " +
      "certified county appraisal-district data). Does not include current " +
      "tax bill/payment status -- for that, see the county appraisal " +
      "district's own site."
  ),
  inputSchema: {
    address_contains: z
      .string()
      .min(3)
      .optional()
      .describe('Partial street address (situs address), e.g. "9501 San Lucas" or "Main St".'),
    account_number: z
      .string()
      .min(3)
      .optional()
      .describe("Exact appraisal district account/parcel number, if known."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10)
      .describe("Max results (default 10)."),
  },
  async handler(args) {
    const { address_contains, account_number, limit } = args;
    if (!address_contains && !account_number) {
      return {
        content: [
          {
            type: "text",
            text: `dallas_property requires address_contains or account_number. ${ATTRIBUTION_TAG}`,
          },
        ],
        isError: true,
      };
    }

    const { layerUrl, fields } = await resolveLayer();

    const clauses = [];
    if (address_contains) {
      if (!fields.address) {
        return errorContent(
          "Could not identify the parcels layer's address field at query time -- try account_number instead, or retry later."
        );
      }
      clauses.push(likeClause(fields.address, address_contains));
    }
    if (account_number && fields.account) {
      clauses.push(`${fields.account} = '${String(account_number).replace(/'/g, "''")}'`);
    }

    const rows = await queryLayer(layerUrl, {
      where: clauses.join(" AND "),
      resultRecordCount: limit ?? 10,
    });

    for (const r of rows) r.source_url = SERVICE_PAGE_URL;

    return {
      content: [
        { type: "text", text: formatResults(args, rows, fields) },
        { type: "text", text: JSON.stringify({ query: args, count: rows.length, results: rows }, null, 2) },
      ],
    };
  },
};

function errorContent(text) {
  return {
    content: [{ type: "text", text: `${text} ${ATTRIBUTION_TAG}` }],
    isError: true,
  };
}

function formatResults(args, rows, fields) {
  const filterParts = [];
  if (args.address_contains) filterParts.push(`address contains "${args.address_contains}"`);
  if (args.account_number) filterParts.push(`account=${args.account_number}`);

  const lines = [
    `# Dallas Property: ${filterParts.join(", ")} -- ${rows.length} parcel${rows.length === 1 ? "" : "s"}`,
    "",
  ];

  if (rows.length === 0) {
    lines.push("No matching parcels found.", "");
  }

  for (const r of rows) {
    const address = fields.address ? r[fields.address] : null;
    const owner = fields.owner ? r[fields.owner] : null;
    const totalValue = fields.totalValue ? r[fields.totalValue] : null;
    const landValue = fields.landValue ? r[fields.landValue] : null;
    const imprValue = fields.improvementValue ? r[fields.improvementValue] : null;
    const account = fields.account ? r[fields.account] : null;
    const acreage = fields.acreage ? r[fields.acreage] : null;
    const legal = fields.legalDescription ? r[fields.legalDescription] : null;

    lines.push(`## ${address ?? "(address not identified in this parcel record)"}`);
    if (owner) lines.push(`- **Owner:** ${owner}`);
    if (totalValue) lines.push(`- **Total appraised value:** ${totalValue}${landValue || imprValue ? ` (land: ${landValue ?? "?"}, improvement: ${imprValue ?? "?"})` : ""}`);
    if (acreage) lines.push(`- **Acreage:** ${acreage}`);
    if (account) lines.push(`- **Account #:** ${account}`);
    if (legal) lines.push(`- **Legal description:** ${legal}`);
    lines.push("");
  }

  lines.push("---");
  lines.push(`Source: City of Dallas GIS -- DallasTaxParcels, built from certified county appraisal-district data (${SERVICE_PAGE_URL}).`);
  lines.push(`For current tax bill/payment status, see the county appraisal district directly (e.g. ${DCAD_URL} for Dallas County).`);
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}
