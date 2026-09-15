/**
 * Generic ArcGIS REST FeatureServer / MapServer client.
 *
 * Many city/county GIS layers (311 case layers, appraisal district parcels,
 * zoning, flood zones) are published via Esri ArcGIS Online or a
 * self-hosted ArcGIS Server. The endpoints are public, return JSON, and
 * require no auth. This module wraps the /query endpoint with sane
 * defaults and one transient-failure retry.
 *
 * Ported from local-city-mcp-template's lib/arcgis.js (same client backs
 * local-austin-mcp's county appraisal district + FEMA flood tools).
 *
 * ArcGIS REST query reference:
 *   https://developers.arcgis.com/rest/services-reference/query-feature-service-layer.htm
 */

import { currentSignal } from "./request-context.js";
import { withLimit } from "./semaphore.js";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Query an ArcGIS FeatureServer / MapServer layer.
 *
 * @param {string} layerUrl - Full URL to the layer, e.g.
 *   "https://services1.arcgis.com/<id>/arcgis/rest/services/<svc>/FeatureServer/0"
 * @param {object} opts
 * @param {string} [opts.where="1=1"] - SQL WHERE clause. Use UPPER() for
 *   case-insensitive matches: "UPPER(SITEADDRESS) LIKE '%MAIN ST%'".
 * @param {string|string[]} [opts.outFields="*"] - Fields to return.
 * @param {number} [opts.resultRecordCount=10] - Max records.
 * @param {number} [opts.resultOffset] - Pagination offset.
 * @param {string} [opts.orderByFields] - SQL ORDER BY clause.
 * @param {boolean} [opts.returnGeometry=false] - Include geometry.
 * @param {string} [opts.outSR] - Output spatial reference WKID (e.g. "4326"
 *   for WGS-84 lat/lng) when `returnGeometry` is true and the layer's
 *   native CRS isn't what you want back.
 * @returns {Promise<Array<object>>} Array of `{ ...attributes, geometry? }`.
 */
export async function queryLayer(layerUrl, opts = {}) {
  const {
    where = "1=1",
    outFields = "*",
    resultRecordCount = 10,
    resultOffset,
    orderByFields,
    returnGeometry = false,
    outSR,
  } = opts;

  const params = new URLSearchParams({
    where,
    outFields: Array.isArray(outFields) ? outFields.join(",") : outFields,
    returnGeometry: String(returnGeometry),
    f: "json",
    resultRecordCount: String(resultRecordCount),
  });
  if (resultOffset !== undefined) {
    params.set("resultOffset", String(resultOffset));
  }
  if (orderByFields) {
    params.set("orderByFields", orderByFields);
  }
  if (outSR) {
    params.set("outSR", String(outSR));
  }

  const url = `${layerUrl.replace(/\/$/, "")}/query?${params.toString()}`;

  return withLimit("arcgis", () => retry(async () => {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": UA,
        Accept: "application/json,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: currentSignal(),
    });
    if (!res.ok) {
      throw new Error(`ArcGIS query failed: ${res.status} ${res.statusText} -- ${url}`);
    }
    const data = await res.json();
    if (data?.error) {
      throw new Error(
        `ArcGIS query error: ${data.error.code} ${data.error.message ?? ""}`
      );
    }
    const features = Array.isArray(data?.features) ? data.features : [];
    return features.map((f) => (f.geometry ? { ...f.attributes, geometry: f.geometry } : (f.attributes ?? {})));
  }));
}

/**
 * Point-in-polygon spatial query against an ArcGIS FeatureServer layer.
 * Returns the attributes of every polygon feature that contains the point.
 *
 * @param {string} layerUrl  Full layer URL (FeatureServer/<n>).
 * @param {number} lng       Longitude (WGS-84 / EPSG:4326).
 * @param {number} lat       Latitude (WGS-84 / EPSG:4326).
 * @param {object} [opts]
 * @param {string|string[]} [opts.outFields="*"]
 * @returns {Promise<Array<object>>}
 */
export async function queryPointInPolygon(layerUrl, lng, lat, opts = {}) {
  const { outFields = "*" } = opts;
  if (typeof lng !== "number" || typeof lat !== "number") {
    throw new Error("queryPointInPolygon requires numeric lng + lat");
  }

  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    where: "1=1",
    outFields: Array.isArray(outFields) ? outFields.join(",") : outFields,
    returnGeometry: "false",
    f: "json",
  });

  const url = `${layerUrl.replace(/\/$/, "")}/query?${params.toString()}`;

  return withLimit("arcgis", () => retry(async () => {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": UA,
        Accept: "application/json,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: currentSignal(),
    });
    if (!res.ok) {
      throw new Error(
        `ArcGIS point query failed: ${res.status} ${res.statusText} -- ${url}`
      );
    }
    const data = await res.json();
    if (data?.error) {
      throw new Error(
        `ArcGIS point query error: ${data.error.code} ${data.error.message ?? ""}`
      );
    }
    const features = Array.isArray(data?.features) ? data.features : [];
    return features.map((f) => f.attributes ?? {});
  }));
}

/**
 * Build an ArcGIS-safe SQL LIKE clause for a column. Escapes single quotes
 * by doubling them (standard SQL) and wraps with `%`.
 *
 * @param {string} column - Column name (already in correct case).
 * @param {string} value - User-provided text. Will be uppercased.
 * @param {object} [opts]
 * @param {boolean} [opts.uppercase=true] - Wrap column in UPPER() for case-insensitive match.
 * @returns {string} A SQL fragment safe to use in a `where` clause.
 */
export function likeClause(column, value, opts = {}) {
  const { uppercase = true } = opts;
  const safe = String(value).replace(/'/g, "''").toUpperCase();
  return uppercase
    ? `UPPER(${column}) LIKE '%${safe}%'`
    : `${column} LIKE '%${safe}%'`;
}

/**
 * Describe a FeatureServer's layers (id, name) via its root `?f=json`
 * metadata. Used to resolve which sub-layer holds the data we want without
 * hardcoding a layer index that may not match a given deployment.
 *
 * @param {string} featureServerUrl  Root FeatureServer URL (no trailing layer id).
 * @returns {Promise<Array<{id:number, name:string}>>}
 */
export async function describeService(featureServerUrl) {
  const url = `${featureServerUrl.replace(/\/$/, "")}?f=json`;
  return withLimit("arcgis", () => retry(async () => {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json,*/*;q=0.8" },
      signal: currentSignal(),
    });
    if (!res.ok) {
      throw new Error(`ArcGIS service metadata failed: ${res.status} ${res.statusText} -- ${url}`);
    }
    const data = await res.json();
    if (data?.error) {
      throw new Error(`ArcGIS service metadata error: ${data.error.code} ${data.error.message ?? ""}`);
    }
    return Array.isArray(data?.layers) ? data.layers.map((l) => ({ id: l.id, name: l.name })) : [];
  }));
}

/**
 * Describe one layer's field list (name, alias, type) via `?f=json`. Use
 * this to discover the real column names on a layer whose schema you don't
 * control or can't hardcode reliably (e.g. a county-published parcels
 * layer), instead of guessing field names and risking silent no-match
 * queries or a 400 from an unknown column in `where`.
 *
 * @param {string} layerUrl  Full layer URL (FeatureServer/<n>, no trailing slash needed).
 * @returns {Promise<Array<{name:string, alias:string, type:string}>>}
 */
export async function describeLayerFields(layerUrl) {
  const url = `${layerUrl.replace(/\/$/, "")}?f=json`;
  return withLimit("arcgis", () => retry(async () => {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json,*/*;q=0.8" },
      signal: currentSignal(),
    });
    if (!res.ok) {
      throw new Error(`ArcGIS layer metadata failed: ${res.status} ${res.statusText} -- ${url}`);
    }
    const data = await res.json();
    if (data?.error) {
      throw new Error(`ArcGIS layer metadata error: ${data.error.code} ${data.error.message ?? ""}`);
    }
    return Array.isArray(data?.fields)
      ? data.fields.map((f) => ({ name: f.name, alias: f.alias ?? f.name, type: f.type }))
      : [];
  }));
}

/**
 * Pick the field whose name or alias best matches one of the given
 * lowercase substrings, in priority order. Pure function -- no network.
 *
 * @param {Array<{name:string, alias:string}>} fields
 * @param {string[]} candidates  Substrings to look for, most-specific first.
 * @returns {string|null} The matching field's `name`, or null if none found.
 */
export function findField(fields, candidates) {
  if (!Array.isArray(fields) || fields.length === 0) return null;
  for (const c of candidates) {
    const needle = c.toLowerCase();
    const hit = fields.find(
      (f) =>
        f.name?.toLowerCase().includes(needle) ||
        f.alias?.toLowerCase().includes(needle)
    );
    if (hit) return hit.name;
  }
  return null;
}

/**
 * Up to 2 retries (3 attempts total) on 5xx / network glitches, 600ms apart.
 * Some ArcGIS instances flake intermittently on otherwise-valid requests --
 * needs the extra attempt beyond a single retry.
 */
async function retry(fn, attemptsLeft = 2) {
  try {
    return await fn();
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (attemptsLeft > 0 && /50\d|timeout|GATEWAY|ENOTFOUND|ECONNRESET|Failed to execute query/i.test(msg)) {
      await new Promise((r) => setTimeout(r, 600));
      return await retry(fn, attemptsLeft - 1);
    }
    throw err;
  }
}
