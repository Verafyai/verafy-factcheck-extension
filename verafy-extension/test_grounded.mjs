import { groundedLabels, verdictFor, truthScore } from "./grounded.js";
import assert from "node:assert/strict";
// a2 attacks a1, a3 attacks a2 -> a1 IN, a2 OUT, a3 IN
let L = groundedLabels(["a1","a2","a3"], [{from:"a2",to:"a1"},{from:"a3",to:"a2"}]);
assert.deepEqual(L, {a1:"IN",a2:"OUT",a3:"IN"});
// mutual attack -> both UNDEC -> contested
L = groundedLabels(["a1","a2"], [{from:"a1",to:"a2"},{from:"a2",to:"a1"}]);
assert.deepEqual(L, {a1:"UNDEC",a2:"UNDEC"});
assert.equal(verdictFor([{id:"a1",side:"supports"},{id:"a2",side:"refutes"}], L), "contested");
// refute defeats support
L = groundedLabels(["s","r"], [{from:"r",to:"s"}]);
assert.equal(verdictFor([{id:"s",side:"supports"},{id:"r",side:"refutes"}], L), "refuted");
assert.equal(verdictFor([], {}), "unverifiable");
const t = truthScore([{verdict:"supported",importance:3},{verdict:"refuted",importance:1},{verdict:"unverifiable",importance:2}]);
assert.deepEqual(t, {score:75,basis:2,total:3});
console.log("grounded tests pass");
