import { runTerritoryDecay } from "../../src/lib/server/handlers";

/** v3.2: once a day (00:15 UTC), areas whose owners ignore the missions inside them shrink (see domain/territory.ts). */
export default async () => {
  const result = await runTerritoryDecay();
  console.log("[territory-decay]", JSON.stringify(result));
  return Response.json(result);
};

export const config = { schedule: "15 0 * * *" };
