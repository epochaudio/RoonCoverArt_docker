"use strict";

function getZoneId(zoneOrId) {
  if (typeof zoneOrId === "string") return zoneOrId;
  if (zoneOrId && typeof zoneOrId === "object") return zoneOrId.zone_id || null;
  return null;
}

function applyZoneChanges(currentZones, changes) {
  var zonesById = new Map();
  (Array.isArray(currentZones) ? currentZones : []).forEach(function(zone) {
    var zoneId = getZoneId(zone);
    if (zoneId) zonesById.set(zoneId, zone);
  });

  (Array.isArray(changes && changes.zones_removed) ? changes.zones_removed : [])
    .forEach(function(zoneOrId) {
      var zoneId = getZoneId(zoneOrId);
      if (zoneId) zonesById.delete(zoneId);
    });

  ["zones_added", "zones_changed"].forEach(function(changeName) {
    (Array.isArray(changes && changes[changeName]) ? changes[changeName] : [])
      .forEach(function(zone) {
        var zoneId = getZoneId(zone);
        if (zoneId) zonesById.set(zoneId, zone);
      });
  });

  return Array.from(zonesById.values());
}

function hasZoneListChanges(changes) {
  return ["zones_removed", "zones_added", "zones_changed"].some(function(changeName) {
    return Array.isArray(changes && changes[changeName]) && changes[changeName].length > 0;
  });
}

module.exports = {
  applyZoneChanges: applyZoneChanges,
  getZoneId: getZoneId,
  hasZoneListChanges: hasZoneListChanges
};
