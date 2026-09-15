import { z } from "zod";
import { sodaQuery, sodaTextLike, sodaTextEq, sodaDescribeDataset, sodaFindColumn } from "../../lib/soda.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * Dallas Police public safety incidents -- City of Dallas Open Data
 * (Socrata), dataset 4ea4-q4ui ("Dallas Police Public Data - RMS Incidents
 * With GeoLocation"). Reported incidents beginning June 1, 2014 to
 * current-date; the Dallas Police Department itself filters out
 * sexually-oriented offenses and any record where a juvenile is a victim or
 * suspect before publication, per its stated public-data policy.
 *
 * This dataset's column names are known to be inconsistent/legacy-named
 * (it predates Dallas's newer open-data schema conventions used by 311 and
 * Building Permits), and this fork's build environment has no outbound
 * network access to confirm them against a live sample. Rather than
 * hardcode guessed column names and risk every call 400'ing on an unknown
 * field, this tool resolves field names at runtime from the dataset's own
 * metadata (`sodaDescribeDataset` + `sodaFindColumn`), and falls back to
 * full-text search (`$q`) for any filter whose backing column it can't
 * confidently identify. Run `npm run test:contract` (needs real internet
 * access) to confirm the discovered fields are sensible; widen the
 * candidate substrings below if a filter that should narrow results
 * doesn't.
 *
 * Source: https://www.dallasopendata.com/Public-Safety/Dallas-Police-Public-Data-RMS-Incidents-With-GeoLo/4ea4-q4ui
 */
const BASE = "https://www.dallasopendata.com";
const DATASET = "4ea4-q4ui";
const DATASET_URL = `${BASE}/Public-Safety/Dallas-Police-Public-Data-RMS-Incidents-With-GeoLo/${DATASET}`;

let fieldsPromise = null;
function resolveFields() {
  if (!fieldsPromise) {
    fieldsPromise = sodaDescribeDataset(DATASET, { base: BASE }).then((columns) => ({
      incidentNumber: sodaFindColumn(columns, ["incident number", "service number", "case number"]),
      date: sodaFindColumn(columns, ["date of occurrence", "date1", "report date", "incident date"]),
      offense: sodaFindColumn(columns, ["offense description", "ucr offense", "nibrs description", "offense"]),
      address: sodaFindColumn(columns, ["block address", "incident address", "location1", "address"]),
      councilDistrict: sodaFindColumn(columns, ["council district", "district"]),
    }));
  }
  return fieldsPromise;
}

export const dallasCrime = {
  name: "dallas_crime",
  description: withAttributionTag(
    "Search Dallas Police reported incidents (RMS data, 2014-present). " +
      "Filter by offense/keyword, council district, or address -- or pass " +
      "no filters for the most recent reports. Sexually-oriented offenses " +
      "and records involving juveniles are excluded by the Dallas Police " +
      "Department before publication, per its public-data policy. " +
      "Authoritative source: City of Dallas Open Data."
  ),
  inputSchema: {
    keyword: z
      .string()
      .min(2)
      .optional()
      .describe('Free-text search across offense type/description, e.g. "burglary", "theft", "assault".'),
    council_district: z
      .string()
      .regex(/^\d{1,2}$/)
      .optional()
      .describe('Dallas city council district number (1-14), e.g. "10".'),
    address_contains: z
      .string()
      .min(3)
      .optional()
      .describe('Partial block/address match, e.g. "Main St" or "Elm".'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(25)
      .describe("Max results (default 25)."),
  },
  async handler(args) {
    const { keyword, council_district, address_contains, limit } = args;
    const fields = await resolveFields();

    const where = [];
    const qFallback = [];

    if (keyword) {
      if (fields.offense) where.push(sodaTextLike(fields.offense, keyword));
      else qFallback.push(keyword);
    }
    if (council_district) {
      if (fields.councilDistrict) where.push(sodaTextEq(fields.councilDistrict, council_district));
      else qFallback.push(council_district);
    }
    if (address_contains) {
      if (fields.address) where.push(sodaTextLike(fields.address, address_contains));
      else qFallback.push(address_contains);
    }

    const rows = await sodaQuery(DATASET, {
      base: BASE,
      where: where.length ? where.join(" AND ") : undefined,
      q: qFallback.length ? qFallback.join(" ") : undefined,
      order: fields.date ? `${fields.date} DESC` : undefined,
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
  if (args.keyword) filterParts.push(`keyword="${args.keyword}"`);
  if (args.council_district) filterParts.push(`district=${args.council_district}`);
  if (args.address_contains) filterParts.push(`address contains "${args.address_contains}"`);

  const lines = [
    `# Dallas Police Incidents: ${filterParts.join(", ") || "most recent"} -- ${rows.length} record${rows.length === 1 ? "" : "s"}`,
    "",
  ];

  if (rows.length === 0) {
    lines.push("No matching incidents found.", "");
  }

  for (const r of rows) {
    const offense = fields.offense ? r[fields.offense] : null;
    const address = fields.address ? r[fields.address] : null;
    const district = fields.councilDistrict ? r[fields.councilDistrict] : null;
    const date = fields.date ? r[fields.date] : null;
    const num = fields.incidentNumber ? r[fields.incidentNumber] : null;

    lines.push(`## ${offense ?? "(offense not identified in this dataset row)"}`);
    lines.push(`- **Block/Address:** ${address ?? "?"}  |  **District:** ${district ?? "?"}`);
    if (date) lines.push(`- **Date:** ${date}`);
    if (num) lines.push(`- **Incident #:** ${num}`);
    lines.push("");
  }

  lines.push("---");
  lines.push(`Source: City of Dallas Open Data -- Dallas Police RMS Incidents (${DATASET_URL}).`);
  lines.push("Sexually-oriented offenses and juvenile-involved records are excluded by DPD before publication.");
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}
