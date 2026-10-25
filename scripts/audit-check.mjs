// CI gate: `npm audit` must report no high or critical finding, except those listed in
// audit-allowlist.json with a reason and an expiry date (after which they fail again).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const allow = JSON.parse(readFileSync(new URL("../audit-allowlist.json", import.meta.url), "utf8"));
const today = new Date().toISOString().slice(0, 10);

let report;
try {
  report = JSON.parse(execFileSync("npm", ["audit", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
} catch (error) {
  // npm audit exits with 1 when it finds anything; the JSON is still on stdout.
  report = JSON.parse(error.stdout);
}

const problems = [];
for (const [name, v] of Object.entries(report.vulnerabilities ?? {})) {
  if (v.severity !== "high" && v.severity !== "critical") continue;
  const advisories = v.via.filter((x) => typeof x === "object").map((x) => x.url ?? x.source);
  const ok = allow.entries.find(
    (e) => e.package === name && e.expires >= today && (e.advisories.length === 0 || advisories.every((a) => e.advisories.includes(a))),
  );
  if (ok) {
    console.log(`allowed until ${ok.expires}: ${name} (${v.severity}) — ${ok.reason}`);
    continue;
  }
  problems.push(`${v.severity}: ${name} ${advisories.join(", ")}`);
}
for (const e of allow.entries.filter((e) => e.expires < today)) console.log(`expired allow-list entry: ${e.package} (${e.expires})`);

if (problems.length) {
  console.error(`npm audit: ${problems.length} high/critical finding(s) not on the allow-list:\n${problems.join("\n")}`);
  process.exit(1);
}
console.log("npm audit: no high or critical findings outside the allow-list.");
