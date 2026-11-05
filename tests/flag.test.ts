import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flag, routeTag, withFlag } from '../core/flag.ts';

test('flag maps two ASCII letters to regional indicators, anything else to empty', () => {
  assert.equal(flag('US'), '🇺🇸');
  assert.equal(flag('gb'), '🇬🇧');
  assert.equal(flag(''), '');
  assert.equal(flag(null), '');
  assert.equal(flag(undefined), '');
  assert.equal(flag('USA'), '');
  assert.equal(flag('U1'), '');
  assert.equal(withFlag('GB'), '🇬🇧 GB');
  assert.equal(withFlag('??'), '??');
});

test('routeTag flags the country of a location tag and leaves the rest', () => {
  assert.equal(routeTag('title:contract · remote:US'), 'title:contract · remote:🇺🇸 US');
  assert.equal(routeTag('perm · hybrid:GB'), 'perm · hybrid:🇬🇧 GB');
  assert.equal(routeTag('perm · onsite:split'), 'perm · onsite:split');
  assert.equal(routeTag('location:IN'), 'location:🇮🇳 IN');
  assert.equal(routeTag('evergreen'), 'evergreen');
  assert.equal(routeTag('perm · unknown:GB'), 'perm · unknown:🇬🇧 GB');
  assert.equal(routeTag('perm · remote:US-only'), 'perm · remote:🇺🇸 US-only');
  assert.equal(routeTag('title:contract · remote:DE-only'), 'title:contract · remote:🇩🇪 DE-only');
});
