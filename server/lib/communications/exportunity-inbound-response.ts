export function buildExportunityIndustrialInboundReply(language: "fr" | "en") {
  const response =
    language === "fr"
      ? "Exportunity traite les demandes B2B de sourcing, machines, matières et logistique. Indiquez la pièce ou le produit, la quantité, le lieu et le délai; aucun fournisseur n'est contacté automatiquement."
      : "Exportunity handles B2B sourcing, machinery, materials, and trade facilitation. Share the item, quantity, location, and timing; no supplier is contacted automatically.";

  return { mode: "canned" as const, response, confidence: 0.98, reason: "exportunity_industrial_scope" };
}
