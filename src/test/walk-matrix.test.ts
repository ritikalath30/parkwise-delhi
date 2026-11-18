import { beforeEach, describe, expect, it } from "vitest";
import { getArea } from "@/lib/data";
import { isRecommendable, routeKey } from "@/lib/engine";
import { clearWalkMatrixCache, loadWalkMatrix } from "@/lib/walk-matrix.server";

const area = getArea("hkv");
const parkings = area.parkings.filter(isRecommendable);

function osrmResponse(fill: (i: number, j: number) => number | null) {
  const distances = parkings.map((_, i) => area.restaurants.map((_, j) => fill(i, j)));
  return new Response(JSON.stringify({ code: "Ok", distances }), { status: 200 });
}

describe("OSM walking matrix", () => {
  beforeEach(() => clearWalkMatrixCache());

  it("makes one table request for the whole area and keys distances by pair", async () => {
    const urls: string[] = [];
    const fake = (async (u: string) => (urls.push(u), osrmResponse((i, j) => 100 + i * 10 + j))) as unknown as typeof fetch;
    const m = await loadWalkMatrix("hkv", fake);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/\/table\/v1\/foot\//);
    expect(m![routeKey(parkings[1]!.id, area.restaurants[2]!.id)]).toBe(112);
    await loadWalkMatrix("hkv", fake);
    expect(urls).toHaveLength(1); // cached
  });

  it("never includes restricted or unverified spaces", async () => {
    let url = "";
    const fake = (async (u: string) => ((url = u), osrmResponse(() => 200))) as unknown as typeof fetch;
    await loadWalkMatrix("hkv", fake);
    for (const p of area.parkings.filter((x) => !isRecommendable(x))) expect(url).not.toContain(`${p.lng},${p.lat}`);
  });

  it("returns null (estimates are used) when the service fails", async () => {
    const fake = (async () => new Response("err", { status: 503 })) as unknown as typeof fetch;
    expect(await loadWalkMatrix("hkv", fake)).toBeNull();
  });

  it("skips unroutable pairs", async () => {
    const fake = (async () => osrmResponse((i) => (i === 0 ? null : 300))) as unknown as typeof fetch;
    const m = (await loadWalkMatrix("hkv", fake))!;
    expect(m[routeKey(parkings[0]!.id, area.restaurants[0]!.id)]).toBeUndefined();
    expect(m[routeKey(parkings[1]!.id, area.restaurants[0]!.id)]).toBe(300);
  });
});
