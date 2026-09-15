import { z } from "zod";
import { sodaQuery, sodaTextLike, sodaTextEq, sodaDescribeDataset, sodaFindColumn } from "../../lib/soda.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * Dallas building permits -- City of Dallas Open Data (Socrata), dataset
 * e7gq-4sah ("Building Permits").
 *
 * Field names are resolved at runtime from the dataset's own column
 * metadata (`sodaDescribeDataset` + `sodaFindColumn`) rather than
 * hardcoded, because this fork's build environment has no outbound network
 * access to dallasopendata.com to confirm exact `fieldName`s against a live
 * sample. This makes the tool self-correcting if the portal's column names
 * differ slightly from what we guess here -- run `npm run test:contract`
 * (needs real internet access) to verify the discovered fields look right,
 * and adjust the candidate substrings below if a filter comes back empty
 * that shouldn't.
 *
 * Source: https://www.dallasopendata.com/Services/Building-Permits/e7gq-4sah
 */
const BASE = "https://www.dallasopendata.com";
const DATASET = "e7gq-4sah";
const DATASET_URL = `${BASE}/Services/Building-Permits/${DATASET}`;

let fieldsPromise = null;
function resolveFields() {
  if (!fieldsPromise) {
    fieldsPromise = sodaDescribeDataset(DATASET, { base: BASE }).then((columns) => ({
      permitNumber: sodaFindColumn(columns, ["permit number", "permitnumber", "permit_num"]),
      permitType: sodaFindColumn(columns, ["permit type description", "permit type", "permittype"]),
      status: sodaFindColumn(columns, ["permit status", "status"]),
      issuedDate: sodaFindColumn(columns, ["issued date", "issue date", "date issued"]),
      address: sodaFindColumn(columns, ["address", "site address", "location"]),
      councilDistrict: sodaFindColumn(columns, ["council district", "district"]),
      workDescription: sodaFindColumn(columns, ["work description", "description of work", "description"]),
      contractor: sodaFindColumn(columns, ["contractor company name", "contractor name", "contractor"]),
      estimatedCost: sodaFindColumn(columns, ["estimated cost", "valuation", "permit value", "cost"]),
    }));
  }
  return fieldsPromise;
}

export const dallasPermits = {
  name: "dallas_permits",
  description: withAttributionTag(
    "Search City of Dallas building permits (new construction, remodels, " +
      "electrical, mechanical, plumbing, etc). Filter by permit type, " +
      "status, council district, or address. Authoritative source: City " +
      "of Dallas Open Data."
  ),
  inputSchema: {
    permit_type: z
      .string()
      .min(2)
      .optional()
      .describe('Permit type, fuzzy contains. Example: "Residential", "Electrical", "Roofing".'),
    status: z
      .string()
      .min(2)
      .optional()
      .describe('Permit status, fuzzy contains. Example: "Issued", "Finaled", "Applied".'),
    council_district: z
      .string()
      .regex(/^\d{1,2}$/)
      .optional()
      .describe('Dallas city council district number (1-14), e.g. "10".'),
    address_contains: z
      .string()
      .min(3)
      .optional()
      .describe('Partial street address match, e.g. "Main St" or "Elm".'),
    days_back: z
      .number()
      .int()
      .min(1)
      .max(365)
      .optional()
      .describe("Only include permits issued in the last N days. Default: no limit."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(25)
      .describe("Max results (default 25)."),
  },
  async handler(args) {
    const { permit_type, status, council_district, address_contains, days_back, limit } = args;
    const fields = await resolveFields();

    const where = [];
    const qFallback = [];

    if (permit_type) {
      if (fields.permitType) where.push(sodaTextLike(fields.permitType, permit_type));
      else qFallback.push(permit_type);
    }
    if (status) {
      if (fields.status) where.push(sodaTextLike(fields.status, status));
      else qFallback.push(status);
    }
    if (council_district) {
      if (fields.councilDistrict) where.push(sodaTextEq(fields.councilDistrict, council_district));
      else qFallback.push(council_district);
    }
    if (address_contains) {
      if (fields.address) where.push(sodaTextLike(fields.address, address_contains));
      else qFallback.push(address_contains);
    }
    if (days_back && fields.issuedDate) {
      where.push(`${fields.issuedDate} >= '${new Date(Date.now() - days_back * 86400000).toISOString()}'`);
    }

    const rows = await sodaQuery(DATASET, {
      base: BASE,
      where: where.length ? where.join(" AND ") : undefined,
      q: qFallback.length ? qFallback.join(" ") : undefined,
      order: fields.issuedDate ? `${fields.issuedDate} DESC` : undefined,
      limit: limit ?? 25,
    });

    for (const r of rows) r.source_url = DATASET_URL;

    return {
      content: [
        { type: "text", text: formatResults(args, rows, fields) },
        { type: "text", text: JSON.stringify({ query: args, count: rows.length, results: rows }, null, 2) },
      ],
    };
  },
};

function formatResults(args, rows, fields) {
  const filterParts = [];
  if (args.permit_type) filterParts.push(`type="${args.permit_type}"`);
  if (args.status) filterParts.push(`status="${args.status}"`);
  if (args.council_district) filterParts.push(`district=${args.council_district}`);
  if (args.address_contains) filterParts.push(`address contains "${args.address_contains}"`);
  if (args.days_back) filterParts.push(`last ${args.days_back}d`);

  const lines = [
    `# Dallas Building Permits: ${filterParts.join(", ") || "all"} -- ${rows.length} permit${rows.length === 1 ? "" : "s"}`,
    "",
  ];

  if (rows.length === 0) {
    lines.push("No matching permits found.", "");
  }

  for (const r of rows) {
    const type = fields.permitType ? r[fields.permitType] : null;
    const status = fields.status ? r[fields.status] : null;
    const address = fields.address ? r[fields.address] : null;
    const district = fields.councilDistrict ? r[fields.councilDistrict] : null;
    const issued = fields.issuedDate ? r[fields.issuedDate] : null;
    const permitNum = fields.permitNumber ? r[fields.permitNumber] : null;
    const cost = fields.estimatedCost ? r[fields.estimatedCost] : null;

    lines.push(`## ${type ?? "(unknown type)"} -- ${status ?? "?"}`);
    lines.push(`- **Address:** ${address ?? "?"}  |  **District:** ${district ?? "?"}`);
    if (issued) lines.push(`- **Issued:** ${issued}`);
    if (cost) lines.push(`- **Estimated cost:** ${cost}`);
    if (permitNum) lines.push(`- **Permit #:** ${permitNum}`);
    lines.push("");
  }

  lines.push("---");
  lines.push(`Source: City of Dallas Open Data -- Building Permits (${DATASET_URL}).`);
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}
