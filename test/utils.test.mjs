import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml } from "../js/utils.js";

test("escapeHtml escapes all five special characters", () => {
  assert.equal(
    escapeHtml(`<b>"quote" & 'apos'</b>`),
    "&lt;b&gt;&quot;quote&quot; &amp; &#39;apos&#39;&lt;/b&gt;"
  );
});

test("escapeHtml leaves plain text unchanged", () => {
  assert.equal(escapeHtml("hello world"), "hello world");
});

test("escapeHtml coerces non-string input", () => {
  assert.equal(escapeHtml(42), "42");
});

test("escapeHtml handles empty string", () => {
  assert.equal(escapeHtml(""), "");
});
