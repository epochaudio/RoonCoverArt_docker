"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  applyZoneChanges,
  getZoneId,
  hasZoneListChanges
} = require("../utils/zoneUtils");

test("getZoneId accepts both Roon string IDs and zone objects", function() {
  assert.equal(getZoneId("zone-1"), "zone-1");
  assert.equal(getZoneId({ zone_id: "zone-2" }), "zone-2");
  assert.equal(getZoneId(null), null);
});

test("applyZoneChanges merges additions and replacements", function() {
  const initial = [
    { zone_id: "zone-1", state: "paused" },
    { zone_id: "zone-2", state: "playing" }
  ];
  const result = applyZoneChanges(initial, {
    zones_changed: [{ zone_id: "zone-1", state: "playing" }],
    zones_added: [{ zone_id: "zone-3", state: "stopped" }]
  });

  assert.deepEqual(result, [
    { zone_id: "zone-1", state: "playing" },
    { zone_id: "zone-2", state: "playing" },
    { zone_id: "zone-3", state: "stopped" }
  ]);
});

test("applyZoneChanges removes both string IDs and object IDs", function() {
  const initial = [
    { zone_id: "zone-1" },
    { zone_id: "zone-2" },
    { zone_id: "zone-3" }
  ];

  assert.deepEqual(
    applyZoneChanges(initial, { zones_removed: ["zone-1", { zone_id: "zone-3" }] }),
    [{ zone_id: "zone-2" }]
  );
});

test("seek-only changes are not treated as zone-list changes", function() {
  assert.equal(hasZoneListChanges({ zones_seek_changed: [{ zone_id: "zone-1" }] }), false);
  assert.equal(hasZoneListChanges({ zones_removed: ["zone-1"] }), true);
});
