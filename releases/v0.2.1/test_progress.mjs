import { createStage } from "./progress.js";
import assert from "node:assert/strict";

const node = () => {
  const attrs = {}, classes = new Set();
  return {
    hidden: true, textContent: "", dataset: {}, style: {}, attrs,
    setAttribute: (k, v) => (attrs[k] = v), removeAttribute: (k) => delete attrs[k],
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), has: (c) => classes.has(c) }
  };
};
const els = { box: node(), text: node(), bar: node(), fill: node(), slow: node() };
const bars = [];
const st = createStage({ ...els, onBar: (s) => bars.push(s) });

st.show("read");
assert.equal(els.box.hidden, false);
assert.equal(els.text.textContent, "Reading the page…");
assert.ok(els.bar.classList.has("indeterminate"));
assert.equal(els.bar.attrs["aria-valuenow"], undefined);

st.show("map");
assert.equal(els.text.textContent, "Finding claims and building cliff notes…");

st.show("check", { done: 3, total: 12 });
assert.equal(els.text.textContent, "Checking claims: 3 of 12");
assert.equal(els.bar.attrs["aria-valuenow"], "3");
assert.equal(els.bar.attrs["aria-valuemax"], "12");
assert.equal(els.fill.style.width, "25%");
assert.deepEqual(bars.at(-1), { mode: "determinate", value: 0.25 });

st.show("error", { message: "Rate limit reached." });
assert.equal(els.text.textContent, "Rate limit reached.");
assert.equal(els.bar.hidden, true);
assert.deepEqual(bars.at(-1), { mode: "remove" });

st.show("read");
st.show("done");
assert.equal(els.text.textContent, "Done");
assert.deepEqual(bars.at(-1), { mode: "remove" });
st.hide();
assert.equal(els.box.hidden, true);
console.log("progress tests pass");
process.exit(0); // don't wait for the 30 s slow-stage timer
