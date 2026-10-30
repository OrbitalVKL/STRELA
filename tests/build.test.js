import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../tools/build-site.mjs';

test('page d’attente : les marques du build sont remplacées, les inconnues gardées', () => {
  const html = '<b>v<!--@version-->dev<!--/@--></b> <!--@pass-->—<!--/@-->/<!--@total-->—<!--/@--> <!--@autre-->x<!--/@-->';
  assert.equal(render(html, { version: '1.2.3', pass: '40', total: '41' }), '<b>v1.2.3</b> 40/41 <!--@autre-->x<!--/@-->');
});
