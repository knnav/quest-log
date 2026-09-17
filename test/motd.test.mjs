import { test } from "node:test";
import assert from "node:assert/strict";

let moduleCounter = 0;

// Fresh module per test: the pools are module-level state.
function load(data) {
  globalThis.window = { motd: { list: () => Promise.resolve(data) } };
  moduleCounter += 1;
  return import(`../js/features/motd.js?instance=${moduleCounter}`);
}

test("quotes carry an attribution and are picked from the situation's pool", async () => {
  const motd = await load({
    default: [{ text: "Fallback", by: "Nobody" }],
    cold: [{ text: "Begin at once to live.", by: "Seneca" }],
  });
  await motd.initMotd();

  assert.deepEqual(motd.pickMotd("cold"), { text: "Begin at once to live.", by: "Seneca" });
  assert.deepEqual(motd.pickMotd("no-such-pool"), { text: "Fallback", by: "Nobody" });
});

test("a plain-string line still works and has no attribution", async () => {
  const motd = await load(["just a line"]);
  await motd.initMotd();

  assert.deepEqual(motd.pickMotd("default"), { text: "just a line", by: "" });
  assert.equal(motd.motdHtml(motd.pickMotd("default")), '<span class="motd-text">just a line</span>');
});

test("motdHtml escapes the text and puts the attribution in its own span", async () => {
  const motd = await load({});
  await motd.initMotd();

  assert.equal(
    motd.motdHtml({ text: "a <b> & 'c'", by: "Zhuangzi" }),
    '<span class="motd-text">a &lt;b&gt; &amp; &#39;c&#39;</span> <span class="motd-by">— Zhuangzi</span>'
  );
  assert.equal(motd.motdHtml(null), "");
});

test("a missing or broken file leaves nothing to show", async () => {
  const motd = await load({ default: [null, "", { by: "no text" }] });
  await motd.initMotd();
  assert.equal(motd.pickMotd("default"), null);

  globalThis.window = { motd: { list: () => Promise.reject(new Error("nope")) } };
  moduleCounter += 1;
  const broken = await import(`../js/features/motd.js?instance=${moduleCounter}`);
  await broken.initMotd();
  assert.equal(broken.pickMotd("default"), null);
});
