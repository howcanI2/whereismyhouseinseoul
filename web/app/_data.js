// Small build-time helpers shared by the static pages: the latest mortgage rate and the graded 동 list.
import { readJson } from "./gu/data";
import { buildTiers } from "../src/tiers.js";

export const rateNow = () => { const r = readJson("rates.json").at(-1); return { pct: r.mortgage_pct, month: r.month }; };
let tiers;
export const tiersNow = () => (tiers ??= buildTiers(readJson("insights.json"), readJson("dong_summary.json"), readJson("gu_summary.json")));
