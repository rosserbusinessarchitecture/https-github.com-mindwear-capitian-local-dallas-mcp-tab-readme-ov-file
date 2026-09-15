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
 * IMPORTANT: this layer (verified live, layer 0 "Tax Parcels") does NOT
 * carry dollar appraised/land/improvement values -- only APPRAISALYEAR
 * (a year, not an amount). Fields confirmed live: ACCT/GIS_ACCT (account),
 * ST_NUM/ST_DIR/ST_NAME/ST_TYPE/UNITID (situs address, split across
 * columns, no combined address field), TAXPANAME1/2 (owner), LEGAL_1..5
 * (legal description lines), PROP_CL/BLDG_CL/SPTBCODE (classification),
 * DACOUNCIL (council district), TOTEXEMPT, AREA_FEET (lot size, sq ft).
 * For an actual appraised/market value or current tax bill, the county
 * appraisal district's own site is the only source -- linked below.
 *
 * Layer index and field names are still resolved at runtime
 * (`describeService` + `describeLayerFields` + `findField`) rather than
 * hardcoded, in case the service is ever re-published under a different
 * layer id or column names -- see CONTRIBUTING.md for why.
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
          account: findField(fieldMeta, ["acct", "account"]),
          streetNum: findField(fieldMeta, ["st_num"]),
          streetDir: findField(fieldMeta, ["st_dir"]),
          streetName: findField(fieldMeta, ["st_name"]),
          streetType: findField(fieldMeta, ["st_type"]),
          unit: findField(fieldMeta, ["unitid"]),
          city: findField(fieldMeta, ["city"]),
          owner: findField(fieldMeta, ["taxpaname1", "taxpaname", "owner"]),
          legal: findField(fieldMeta, ["legal_1", "legal_desc", "legal"]),
          propertyClass: findField(fieldMeta, ["prop_cl"]),
          councilDistrict: findField(fieldMeta, ["dacouncil", "council"]),
          totalExempt: findField(fieldMeta, ["totexempt"]),
          areaSqFt: findField(fieldMeta, ["area_feet", "area"]),
          appraisalYear: findField(fieldMeta, ["appraisalyear"]),
        },
      };
    })();
  }
  return resolvedPromise;
}

export const dallasProperty = {
  name: "dallas_property",
  description: withAttributionTag(
    "Look up a Dallas-area tax parcel by street name or account number: " +
      "owner name, situs address, legal description, property class, and " +
      "council district, from the City of Dallas GIS parcels layer (built " +
      "from certified county appraisal-district data). Does NOT include " +
      "dollar appraised/market value or current tax bill/payment status -- " +
      "for those, see the county appraisal district's own site."
  ),
  inputSchema: {
    address_contains: z
      .string()
      .min(3)
      .optional()
      .describe('Partial street NAME (not full address) -- the layer indexes street name separately from number, e.g. "San Lucas" or "Main".'),
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
      if (!fields.streetName) {
        return errorContent(
          "Could not identify the parcels layer's street-name field at query time -- try account_number instead, or retry later."
        );
      }
      clauses.push(likeClause(fields.streetName, address_contains));
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

function buildAddress(r, fields) {
  const parts = [
    fields.streetNum ? r[fields.streetNum] : null,
    fields.streetDir ? r[fields.streetDir] : null,
    fields.streetName ? r[fields.streetName] : null,
    fields.streetType ? r[fields.streetType] : null,
  ].filter(Boolean);
  const unit = fields.unit ? r[fields.unit] : null;
  let addr = parts.join(" ");
  if (unit) addr += ` #${unit}`;
  const city = fields.city ? r[fields.city] : null;
  if (city) addr += `, ${city}`;
  return addr || null;
}

function formatResults(args, rows, fields) {
  const filterParts = [];
  if (args.address_contains) filterParts.push(`street name contains "${args.address_contains}"`);
  if (args.account_number) filterParts.push(`account=${args.account_number}`);

  const lines = [
    `# Dallas Property: ${filterParts.join(", ")} -- ${rows.length} parcel${rows.length === 1 ? "" : "s"}`,
    "",
  ];

  if (rows.length === 0) {
    lines.push("No matching parcels found.", "");
  }

  for (const r of rows) {
    const address = buildAddress(r, fields);
    const owner = fields.owner ? r[fields.owner] : null;
    const account = fields.account ? r[fields.account] : null;
    const propertyClass = fields.propertyClass ? r[fields.propertyClass] : null;
    const councilDistrict = fields.councilDistrict ? r[fields.councilDistrict] : null;
    const areaSqFt = fields.areaSqFt ? r[fields.areaSqFt] : null;
    const legal = fields.legal ? r[fields.legal] : null;
    const totalExempt = fields.totalExempt ? r[fields.totalExempt] : null;
    const appraisalYear = fields.appraisalYear ? r[fields.appraisalYear] : null;

    lines.push(`## ${address ?? "(address not identified in this parcel record)"}`);
    if (owner) lines.push(`- **Owner:** ${owner}`);
    if (account) lines.push(`- **Account #:** ${account}`);
    if (propertyClass) lines.push(`- **Property class:** ${propertyClass}`);
    if (councilDistrict) lines.push(`- **Council district:** ${councilDistrict}`);
    if (areaSqFt) lines.push(`- **Lot area:** ${areaSqFt} sq ft`);
    if (totalExempt) lines.push(`- **Exemption:** ${totalExempt}`);
    if (legal) lines.push(`- **Legal description:** ${legal}`);
    if (appraisalYear) lines.push(`- **Appraisal roll year:** ${appraisalYear}`);
    lines.push("");
  }

  lines.push("---");
  lines.push(`Source: City of Dallas GIS -- DallasTaxParcels, built from certified county appraisal-district data (${SERVICE_PAGE_URL}).`);
  lines.push(`This layer does NOT include dollar appraised/market value or current tax bill. For those, see the county appraisal district directly (e.g. ${DCAD_URL} for Dallas County).`);
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}
