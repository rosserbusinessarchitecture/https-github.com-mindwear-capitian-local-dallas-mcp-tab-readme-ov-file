# Changelog

## 0.2.0

- Forked from [local-dallas-mcp](https://github.com/mindwear-capitian/local-dallas-mcp) 0.1.0 by Ed Neuhaus.
- Added `dallas_permits` (City of Dallas Open Data, Building Permits, dataset `e7gq-4sah`).
- Added `dallas_crime` (City of Dallas Open Data, Police RMS Incidents With GeoLocation, dataset `4ea4-q4ui`).
- Added `dallas_property` (City of Dallas GIS `DallasTaxParcels` FeatureServer, certified county appraisal-district data).
- Added `lib/arcgis.js` (ported from local-city-mcp-template) plus `describeService`/`describeLayerFields`/`findField` for runtime ArcGIS schema discovery.
- Added `sodaDescribeDataset`/`sodaFindColumn` to `lib/soda.js` for runtime Socrata schema discovery.
- Renamed env var prefix `LOCAL_DALLAS_*` to `DALLAS_CIVIC_*`; renamed package/bin to `dallas-civic-mcp`.
- **Caveat:** the three new tools' upstream field names were resolved via each source's own metadata rather than verified against a live sample (no outbound network access in this fork's dev environment) — run `npm run test:contract` before relying on them in production.

## 0.1.0

- Initial scaffold from local-city-mcp-template: `about` + `dallas_nws_alerts` tools, central registration/retry/logging infrastructure, contract test, CI. (Inherited from local-dallas-mcp by Ed Neuhaus.)
