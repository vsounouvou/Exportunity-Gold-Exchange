export type CommercialContactChannel = "email" | "whatsapp";

export function isCommercialContactEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isCommercialContactPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

export function commercialContactChannelFor(
  value: string,
): CommercialContactChannel | null {
  const answer = value.trim().toLocaleLowerCase("fr");
  if (answer.includes("mail") || isCommercialContactEmail(answer)) {
    return "email";
  }
  if (
    answer.includes("whatsapp") ||
    answer.includes("telephone") ||
    answer.includes("phone") ||
    isCommercialContactPhone(answer)
  ) {
    return "whatsapp";
  }
  return null;
}
