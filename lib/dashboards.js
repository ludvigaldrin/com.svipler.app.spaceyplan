'use strict';

// Data model for External Dashboards: dashboards -> pages -> blocks.
// Pure functions only (no homey access) so they can be tested in isolation.
// Floors stay the source of truth for floor plans; a `floorplan` block only
// points at a floor by id.

const BLOCK_TYPES = ['floorplan', 'buttons', 'room', 'devices', 'heading', 'spacer', 'link'];

// Default dashboard with one page per floor, each holding one floorplan block.
// Ids are derived from the floor id so repeated migrations give the same result.
function buildDefaultDashboards(floors) {
  if (!Array.isArray(floors) || floors.length === 0) return [];

  return [{
    id: 'default',
    name: 'Default',
    pages: floors.map(floor => ({
      id: `p_${floor.id}`,
      name: floor.name || 'Unnamed Floor',
      blocks: [{ id: `b_${floor.id}`, type: 'floorplan', floorId: floor.id }]
    }))
  }];
}

function assertString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function assertUniqueIds(items, label) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) throw new Error(`Duplicate ${label} id: ${item.id}`);
    seen.add(item.id);
  }
}

// Throws on the first problem. Returns the input unchanged when valid.
function validateDashboards(dashboards) {
  if (!Array.isArray(dashboards)) throw new Error('dashboards must be an array');

  for (const dashboard of dashboards) {
    if (!dashboard || typeof dashboard !== 'object') throw new Error('Dashboard must be an object');
    assertString(dashboard.id, 'Dashboard id');
    assertString(dashboard.name, `Dashboard "${dashboard.id}" name`);
    if (!Array.isArray(dashboard.pages)) throw new Error(`Dashboard "${dashboard.id}" pages must be an array`);

    for (const page of dashboard.pages) {
      if (!page || typeof page !== 'object') throw new Error('Page must be an object');
      assertString(page.id, 'Page id');
      assertString(page.name, `Page "${page.id}" name`);
      if (!Array.isArray(page.blocks)) throw new Error(`Page "${page.id}" blocks must be an array`);

      for (const block of page.blocks) {
        if (!block || typeof block !== 'object') throw new Error('Block must be an object');
        assertString(block.id, 'Block id');
        if (!BLOCK_TYPES.includes(block.type)) {
          throw new Error(`Block "${block.id}" has unknown type "${block.type}"`);
        }
        for (const item of block.type === 'buttons' ? (block.items || []) : []) {
          if (item.kind === 'device' && item.action !== undefined && !['toggle', 'on', 'off'].includes(item.action)) {
            throw new Error(`Button "${item.id}" action must be toggle, on or off`);
          }
        }
        if (block.visibleOn !== undefined && !['all', 'small', 'large'].includes(block.visibleOn)) {
          throw new Error(`Block "${block.id}" visibleOn must be all, small or large`);
        }
      }
      assertUniqueIds(page.blocks, 'block');
    }
    assertUniqueIds(dashboard.pages, 'page');
  }
  assertUniqueIds(dashboards, 'dashboard');

  return dashboards;
}

module.exports = { BLOCK_TYPES, buildDefaultDashboards, validateDashboards };
