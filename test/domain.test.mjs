import { test } from "node:test";
import assert from "node:assert/strict";
import { countByStatus } from "../js/core/domain.js";

test("countByStatus zeroes the statuses it was given and no others", () => {
  const counts = countByStatus(
    [{ status: "backlog" }, { status: "backlog" }, { status: "done" }],
    ["backlog", "in_progress", "done"]
  );

  assert.deepEqual(counts, { backlog: 2, in_progress: 0, done: 1 });
});

test("countByStatus survives an empty or absent list", () => {
  assert.deepEqual(countByStatus([], ["a", "b"]), { a: 0, b: 0 });
  assert.deepEqual(countByStatus(null, ["a"]), { a: 0 });
});
