import { getBrowseAllPages } from "./server/lib/platform/pageRegistry";

(async () => {
  const pages = await getBrowseAllPages("Operations", 1, { role: "admin" });
  console.log(`operations_pages=${pages.length}`);
  const hits = pages.filter((p) => p.path.toLowerCase().includes("contact"));
  console.log(`contact_hits=${hits.length}`);
  for (const p of hits) {
    console.log(`${p.path}|${p.source}|${p.tags.join(",")}`);
  }
})();
