import { test } from "node:test";
import assert from "node:assert/strict";
import { sodaFindColumn } from "../../lib/soda.js";
import { findField } from "../../lib/arcgis.js";

test("sodaFindColumn matches on fieldName substring", () => {
  const columns = [
    { fieldName: "service_request_type", name: "Service Request Type" },
    { fieldName: "council_district", name: "Council District" },
  ];
  assert.equal(sodaFindColumn(columns, ["council district"]), "council_district");
});

test("sodaFindColumn matches on display name when fieldName differs", () => {
  const columns = [{ fieldName: "offincident", name: "Offense Description" }];
  assert.equal(sodaFindColumn(columns, ["offense description"]), "offincident");
});

test("sodaFindColumn respects candidate priority order", () => {
  const columns = [
    { fieldName: "status", name: "Status" },
    { fieldName: "permit_status", name: "Permit Status" },
  ];
  assert.equal(sodaFindColumn(columns, ["permit status", "status"]), "permit_status");
});

test("sodaFindColumn returns null when nothing matches", () => {
  const columns = [{ fieldName: "foo", name: "Foo" }];
  assert.equal(sodaFindColumn(columns, ["bar"]), null);
});

test("sodaFindColumn returns null for empty column list", () => {
  assert.equal(sodaFindColumn([], ["anything"]), null);
});

test("findField matches on ArcGIS field name or alias", () => {
  const fields = [
    { name: "SITUS_ADDR", alias: "Situs Address" },
    { name: "ACCT_NUM", alias: "Account Number" },
  ];
  assert.equal(findField(fields, ["situs"]), "SITUS_ADDR");
  assert.equal(findField(fields, ["account"]), "ACCT_NUM");
});

test("findField returns null when nothing matches", () => {
  const fields = [{ name: "FOO", alias: "Foo" }];
  assert.equal(findField(fields, ["bar"]), null);
});
