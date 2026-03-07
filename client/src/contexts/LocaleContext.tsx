import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { BrandInfo } from "@/lib/brand";
import { queryClient } from "@/lib/queryClient";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { useTenant } from "@/lib/tenant";
import type { TenantKey } from "@/types/tenant";
import { resolveTenantKey } from "@/lib/tenantResolution";
import { getTenantConfigByKey } from "../../../tenants/index";

export type Language = "en" | "fr" | "ar";
export type Currency = "USD" | "EUR" | "GBP" | "XOF" | "GHS" | "NGN" | "KES" | "AED";

export interface LBMARates {
  USD: number;
  EUR: number;
  GBP: number;
  XOF: number;
  GHS: number;
  NGN: number;
  KES: number;
  AED: number;
}

interface LocaleContextType {
  language: Language;
  currency: Currency;
  source: LocaleResolutionSource;
  manualOverride: boolean;
  detectedCountry: string | null;
  setLanguage: (lang: Language) => void;
  setCurrency: (curr: Currency) => void;
  applyAutoLocaleFromCountry: (countryCode: string | null | undefined) => void;
  t: (key: string) => string;
  formatPrice: (priceXOF: number, rates?: LBMARates) => string;
  formatCurrency: (priceXOF: number, suffix?: string, rates?: LBMARates) => string;
  formatPriceValue: (priceXOF: number, rates?: LBMARates) => number;
  formatAmount: (amount: number, fromCurrency: Currency, suffix?: string, rates?: LBMARates) => string;
  formatAmountValue: (amount: number, fromCurrency: Currency, rates?: LBMARates) => number;
  getCurrencySymbol: () => string;
}

function buildTenantSubtitle(language: Language, brand: BrandInfo) {
  if (language === "fr") {
    return `Sources aupres de fournisseurs agrees, vendus par ${brand.name}`;
  }
  if (language === "ar") {
    return `Ù…ÙˆØ±Ù‘Ø¯Ø© Ù…Ù† Ø¬Ù‡Ø§Øª Ù…Ø±Ø®Ù‘ØµØ©ØŒ ÙˆØªØ¨Ø§Ø¹ Ø¹Ø¨Ø± ${brand.name}`;
  }
  return `Sourced from licensed suppliers, sold by ${brand.name}`;
}

function getTenantTranslationOverrides(
  tenantKey: TenantKey,
  language: Language,
  brand: BrandInfo,
): Record<string, string> {
  const conciergePlaceholder = "Ask about products, suppliers, or orders...";
  const conciergeScopeLabel = "Multi-category";

  if (tenantKey === "bdo") {
    const bdoSubtitle =
      language === "fr"
        ? "Unités d'or d'investissement estampillées • Lingots certifiés et scellés"
        : language === "ar"
          ? "ÙˆØ­Ø¯Ø§Øª Ø°Ù‡Ø¨ Ø§Ø³ØªØ«Ù…Ø§Ø±ÙŠ Ù…Ø®ØªÙˆÙ…Ø© â€¢ Ø³Ø¨Ø§Ø¦Ùƒ Ù…Ø¹ØªÙ…Ø¯Ø© ÙˆÙ…Ø®ØªÙˆÙ…Ø©"
          : "Unités d'or d'investissement estampillées • Lingots certifiés et scellés";
    const proLabel = language === "ar" ? "Ù…Ø³Ø§Ø­Ø© Ø§Ù„Ù…Ø­ØªØ±ÙÙŠÙ†" : "Espace Pro";
    const retailTitle =
      language === "ar" ? "Ø§Ù„Ø°Ù‡Ø¨ Ø§Ù„Ù…Ø®ØªÙˆÙ…" : "Or Estampillé";
    return {
      "nav.dore": proLabel,
      "mode.wholesale": proLabel,
      "sections.doreLots.title": proLabel,
      "sections.doreLots.subtitle":
        language === "fr"
          ? "L'espace dédié aux professionnels de l'or : mines, négociants, maisons, investisseurs et acheteurs en gros."
          : "Professional gold counterparties and institutional sourcing flows.",
      "buyer.panel.wholesaleDore.title": proLabel,
      "buyer.panel.wholesaleMarketplace.title": proLabel,
      "buyer.panel.wholesaleMarketplace.subtitle":
        language === "fr"
          ? "Mines, négociants, maisons, investisseurs et acheteurs en gros."
          : "Mines, traders, maisons, investors, and institutional buyers.",
      "wholesale.preview.title": language === "fr" ? "Aperçu Espace Pro (accès contrôlé)" : "Pro Space preview (restricted)",
      "wholesale.apply.accessButton": language === "fr" ? "Demander l'accès Espace Pro" : "Request Pro Space access",
      "nav.wallet": language === "fr" ? "Mon Portefeuille" : "My Wallet",
      "sections.stamped.title": retailTitle,
      "buyer.panel.retailGold.title": retailTitle,
      "buyer.panel.retailGold.subtitle": bdoSubtitle,
    };
  }

  if (tenantKey === "exportunity" || tenantKey === "zone") {
    return {
      "header.title": brand.name,
      "header.subtitle": brand.tagline,
      "header.suppliers": "market suppliers",
      "header.certified": "Verified network",
      "header.availableGold": "Available items",
      "mode.retail": "Marketplace",
      "nav.dore": "Wholesale",
      "sections.doreLots.title": "Wholesale lots",
      "sections.doreLots.subtitle": buildTenantSubtitle(language, brand),
      "buyer.panel.retailNearby.title": "Global Export Marketplace",
      "buyer.panel.retailNearby.subtitle": "Browse export-ready inventory from verified suppliers.",
      "buyer.noProducts.titleGeneral": "No export-ready products yet",
      "buyer.noProducts.titleGlobal": "No export-ready products yet",
      "buyer.noProducts.desc.category": "No products match this category yet. Try clearing filters.",
      "buyer.noProducts.desc.noSellers": "No verified suppliers are currently published.",
      "buyer.noProducts.desc.sellersNoProducts": "Suppliers exist, but no active export-ready products are published.",
      "buyer.noProducts.desc.generic": "Global Export Marketplace: browse export-ready inventory from verified suppliers.",
      "chat.goldOnlyLabel": conciergeScopeLabel,
      "chat.placeholder": conciergePlaceholder,
      "chat.placeholderFull": conciergePlaceholder,
      "chat.placeholderWholesalePreviewMobile": conciergePlaceholder,
      "chat.placeholderWholesalePreview": conciergePlaceholder,
      "chat.placeholderWholesaleMobile": conciergePlaceholder,
      "chat.placeholderWholesale": conciergePlaceholder,
    };
  }

  if (tenantKey === "mindbase") {
    return {
      "buyer.panel.retailNearby.title": "MindBase Intelligence Marketplace",
      "buyer.panel.retailNearby.subtitle": "Deploy agents, templates, and knowledge modules.",
      "buyer.noProducts.titleGeneral": "No intelligence assets loaded yet.",
      "buyer.noProducts.titleGlobal": "No intelligence assets loaded yet.",
      "buyer.noProducts.desc.category": "No assets match this category yet. Try clearing filters.",
      "buyer.noProducts.desc.noSellers": "No creators have published intelligence assets yet.",
      "buyer.noProducts.desc.sellersNoProducts": "Creators are present, but no active assets are published.",
      "buyer.noProducts.desc.generic": "Deploy your first agent or knowledge module.",
    };
  }

  if (tenantKey === "met") {
    const title = language === "fr" ? "Materiaux de construction" : "Materials Marketplace";
    const subtitle =
      language === "fr"
        ? "Briques BTC/CEB, maison modele et livraison chantier."
        : "Earth materials, plans, and contractor services.";
    return {
      "buyer.panel.retailNearby.title": title,
      "buyer.panel.retailNearby.subtitle": subtitle,
      "buyer.noProducts.titleGeneral":
        language === "fr" ? "Aucun materiau publie pour le moment" : "No materials listed yet",
      "buyer.noProducts.titleGlobal":
        language === "fr" ? "Aucun materiau publie pour le moment" : "No materials listed yet",
      "buyer.noProducts.desc.category":
        language === "fr"
          ? "Aucun materiau ne correspond a cette categorie pour le moment. Essayez de reinitialiser les filtres."
          : "No materials match this category yet. Try clearing filters.",
      "buyer.noProducts.desc.noSellers":
        language === "fr" ? "Aucun fournisseur n'est publie actuellement." : "No suppliers are currently published.",
      "buyer.noProducts.desc.sellersNoProducts":
        language === "fr"
          ? "Des fournisseurs existent, mais aucun materiau actif n'est publie."
          : "Suppliers exist, but no active materials are published.",
      "buyer.noProducts.desc.generic":
        language === "fr"
          ? "Parcourez les materiaux, plans et services verifies."
          : "Browse materials inventory from verified suppliers.",
    };
  }

  if (tenantKey === "hoz") {
    return {
      "buyer.panel.retailNearby.title": "Collections",
      "buyer.panel.retailNearby.subtitle": "Luxury jewelry, couture, and cultural collectibles.",
      "buyer.noProducts.titleGeneral": "No collection items available yet",
      "buyer.noProducts.titleGlobal": "No collection items available yet",
      "buyer.noProducts.desc.category": "No collection items match this category yet. Try clearing filters.",
      "buyer.noProducts.desc.noSellers": "No ateliers are currently published.",
      "buyer.noProducts.desc.sellersNoProducts": "Ateliers exist, but no active collection items are published.",
      "buyer.noProducts.desc.generic": "Luxury collections will appear here as inventory is published.",
    };
  }

  if (tenantKey === "vs") {
    return {
      "buyer.panel.retailNearby.title": "Vital Sounouvou Studio",
      "buyer.panel.retailNearby.subtitle": "Books, courses, talks, and digital assets.",
      "buyer.noProducts.titleGeneral": "No studio assets published yet",
      "buyer.noProducts.titleGlobal": "No studio assets published yet",
      "buyer.noProducts.desc.category": "No studio assets match this category yet. Try clearing filters.",
      "buyer.noProducts.desc.noSellers": "No publishers are currently active.",
      "buyer.noProducts.desc.sellersNoProducts": "Publishers exist, but no active assets are published.",
      "buyer.noProducts.desc.generic": "Studio catalog is being prepared.",
    };
  }

  if (tenantKey === "zogueland") {
    return {
      "buyer.panel.retailNearby.title": "Zogueland Marketplace",
      "buyer.panel.retailNearby.subtitle": "Stories, audio, and learning products for children.",
      "buyer.noProducts.titleGeneral": "No stories available yet",
      "buyer.noProducts.titleGlobal": "No stories available yet",
      "buyer.noProducts.desc.category": "No stories match this category yet. Try clearing filters.",
      "buyer.noProducts.desc.noSellers": "No creators are currently published.",
      "buyer.noProducts.desc.sellersNoProducts": "Creators exist, but no active story products are published.",
      "buyer.noProducts.desc.generic": "New stories and learning assets are loading.",
    };
  }

  return {};
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    "header.title": "Bourse de lâ€™Or",
    "header.subtitle": "By Exportunity",
    "header.suppliers": "gold suppliers",
    "header.certified": "Certified Bureau d'Achat",
    "header.availableGold": "Available Gold",

    "nav.marketplace": "Marketplace",
    "nav.dore": "DorÃ©",
    "nav.machinery": "Mining Machinery",
    "nav.investments": "Investment Opportunities",

    "nav.account": "Account",
    "nav.orders": "Orders",
    "nav.contracts": "Contracts",
    "nav.map": "Map",
    "nav.wallet": "Wallet",
    "nav.vault": "Vault",
    "account.deliveryDashboard": "Delivery dashboard",
    "account.adminConsole": "Admin console",
    "account.signInToAccessOrdersAndWallet": "Sign in to access your orders and your wallet.",

    "mode.retail": "Marketplace",
    "mode.wholesale": "Wholesale",

    "feed.aroundYou.title": "Around you right now",
    "feed.aroundYou.subtitle": "Fresh finds nearby",
    "feed.popular.title": "Top picks from nearby shops",
    "feed.popular.subtitle": "Popular with locals",

    "sections.doreLots.title": "Dor\u00e9 Lots",
    "sections.doreLots.subtitle": "Sourced from licensed suppliers, sold by Bourse de l'Or",
    "sections.stamped.title": "Stamped Gold (10g+)",
    "sections.stamped.subtitle": "Stamped investment gold units, certified and sealed",
    "sections.jewelry.title": "Jewelry",
    "sections.jewelry.subtitle": "Curated jewelry from verified makers",
    "sections.goldArt.title": "Gold Art",
    "sections.goldArt.subtitle": "Curated objects and collector pieces",

    "cart.subtotal": "Subtotal",
    "cart.delivery": "Delivery",

    "units.month": "month",
    "units.months": "months",
    "units.year": "year",
    "units.years": "years",
    "units.kg": "kg",
    "units.kgPerMonth": "kg/month",

    "investments.subtitle": "Cadastre-verified permits \u2014 investment overlays",
    "investments.searchPlaceholder": "Search opportunities\u2026",
    "investments.listMine": "Claim a cadastre permit",
    "investments.empty": "No opportunities match these filters.",
    "investments.badge.verifiedMine": "Licensed mine (verified)",
    "investments.snapshot.title": "Mine Snapshot",
    "investments.field.licenseActiveSince": "License active since",
    "investments.field.currentCapacity": "Current capacity",
    "investments.field.historicalProduction": "Historical production",
    "investments.field.remainingPotential": "Remaining potential",
    "investments.field.capitalRequired": "Capital required",
    "investments.field.duration": "Duration",
    "investments.historical.totalSuffix": "total",
    "investments.historical.last12m": "12m",
    "investments.atCurrentRate": "at current rate",
    "investments.potential.low": "Low",
    "investments.potential.medium": "Medium",
    "investments.potential.high": "High",
    "investments.returnModel.rotationIndicative": "Return per rotation (indicative)",
    "investments.actions.viewOpportunity": "View Opportunity",
    "investments.actions.viewMachinery": "View Machinery",

    "cadastre.badgeVerified": "Cadastre Verified",
    "cadastre.permit": "Cadastre permit",
    "cadastre.permitId": "Permit ID",
    "cadastre.permitType": "Permit type",
    "cadastre.permitStatus": "Permit status",
    "cadastre.commodity": "Commodity",
    "cadastre.region": "Location",
    "cadastre.sourceLink": "Official cadastre source",
    "cadastre.sectionTitle": "Cadastre reference",
    "cadastre.missing": "Cadastre reference missing \u2014 this opportunity cannot be shown.",
    "cadastre.unavailable": "Cadastre data unavailable for the selected country. Investment features are disabled.",
    "cadastre.claimCta": "Claim a cadastre permit",
    "cadastre.claimTitle": "Claim a cadastre permit",
    "cadastre.claimDescription": "Select a permit from the official cadastre. No manual mine entries are allowed.",
    "cadastre.claimRule": "Permits must exist in the official cadastre. No cadastre reference = no listing, no chat, no investment.",
    "cadastre.searchPlaceholder": "Search by permit ID, holder, or region",
    "cadastre.allCountries": "All cadastre countries",
    "cadastre.noResults": "No cadastre permits match this search.",
    "cadastre.selectedPermit": "Selected permit",
    "cadastre.proofLabel": "Proof of authority",
    "cadastre.proofSelected": "Selected: {file}",
    "cadastre.claimNote": "Claim note (optional)",
    "cadastre.claimNotePlaceholder": "Add any verification notes\u2026",
    "cadastre.selectPrompt": "Select a cadastre permit first.",
    "cadastre.proofRequired": "Proof of authority is required.",
    "cadastre.claimSubmit": "Claim this permit",
    "cadastre.claimSubmitted": "Claim submitted",
    "cadastre.claimSubmittedDesc": "Verification will review your documents before activation.",
    "cadastre.claimRequired": "Cadastre claim required",

    "machinery.category.extraction": "Extraction",
    "machinery.category.processing": "Processing",
    "machinery.category.support": "Support",
    "machinery.category.mobility": "Mobility",
    "machinery.category.spare_parts": "Spare Parts",
    "machinery.condition.new": "New",
    "machinery.condition.refurbished": "Refurbished",
    "machinery.condition.used": "Used",
    "machinery.status.in_stock": "In stock",
    "machinery.status.built_to_order": "Built-to-order",
    "machinery.status.used": "Used (second-hand)",
    "machinery.status.reserved": "Reserved",
    "machinery.status.unavailable": "Unavailable",
    "seller.type.manufacturer": "Manufacturer",
    "seller.type.authorized_representative": "Authorized Representative",
    "seller.type.owner_resale": "Owner resale (Used)",
    "machinery.soldBy": "Sold by:",
    "machinery.financingAvailable": "Financing Available",
    "machinery.requestFinancing": "Request financing",
    "machinery.toast.buyRequestTitle": "Buy request",
    "machinery.toast.buyRequestDescription": "A purchase request has been created.",
    "machinery.toast.financingRequestTitle": "Financing request",
    "machinery.toast.financingRequestDescription": "We'll contact you shortly.",
    "machinery.toast.deployTitle": "Deploy",
    "machinery.toast.deployDescription": "Deployment flow coming next.",

    "product.sellerType.wholesaleSupplier": "Dor\u00e9 supplier (wholesale)",
    "product.sellerType.jewelryManufacturer": "Jewelry manufacturer",
    "product.sellerType.retailSeller": "Stamped gold partner",
    "product.pricing.lbma": "LBMA reference pricing",
    "product.pricing.curated": "Curated atelier pricing",
    "product.certificationsCompliance": "Certifications & Compliance",
    "product.favorites.savedTitle": "Saved to favorites",
    "product.favorites.savedDescription": "Added to your favorites",
    "product.addedToOrder": "Added to order",

    "wholesale.preview.title": "Wholesale preview (access controlled)",
    "wholesale.preview.subtitle": "Apply to unlock licensed counterparties",
    "wholesale.preview.accessRequired": "Authorized access required",
    "wholesale.preview.hiddenUntilApproval": "Counterparties, precise locations, and trading flows are hidden until approval.",
    "wholesale.preview.requestPending": "Request pending",
    "wholesale.apply.accessButton": "Apply for wholesale access",
    "wholesale.apply.dialogTitle": "Wholesale partner application",
    "wholesale.apply.dialogDescription": "Upload your trading license to request authorized access. Counterparties and precise locations remain hidden until approval.",
    "wholesale.apply.step1.title": "Step 1 â€” Sign in",
    "wholesale.apply.step1.description": "Wholesale access is only available to verified accounts.",
    "wholesale.apply.step2.title": "Step 2 â€” Upload license",
    "wholesale.apply.step2.description": "Accepted: PDF / image. Issuing authority, type, and expiration are required.",
    "wholesale.apply.selectedFile": "Selected: {file}",
    "wholesale.apply.step3.title": "Step 3 â€” Submit for review",
    "wholesale.apply.step3.description": "Access is granted only after verification and compliance checks.",
    "wholesale.apply.status.approved": "Already approved",
    "wholesale.apply.submitApplication": "Submit application",
    "wholesale.apply.cta": "Apply to become an authorized partner",
    "wholesale.apply.continueRetail": "Continue in marketplace mode",

    "product.dore": "Dor\u00e9",
    "product.refined": "Refined",
    "product.22k": "22K",
    "product.18k": "18K",
    "product.available": "available",
    "product.sold": "SOLD",
    "product.soldOut": "SOLD OUT",
    "product.purity.dore": "Dor\u00e9 (raw gold) | assay-based",
    "product.purity.22k": "Stamped gold | 22K sealed units",
    "product.purity.18k": "Stamped gold | 18K sealed units",
    "product.lbmaRef": "Reference:",
    "product.vsLbma": "vs reference",

    "productDetails.section.descriptionTitle": "Description",
    "productDetails.section.complianceTitle": "Compliance",
    "productDetails.section.deliveryTitle": "Delivery",
    "productDetails.descriptionFallback": "Premium quality {product} sourced directly from {shop}.",
    "productDetails.complianceBody": "Verified provenance, custody, and certification records are available on request.",
    "productDetails.deliveryBody": "Delivery schedules and custody handoffs are confirmed at checkout.",

    "button.add": "Add",
    "button.addToOrder": "Add to Order",
    "button.viewProducts": "View all products",
    "button.viewProducer": "View producer",

    "cart.title": "Your Order",
    "cart.empty": "Your cart is empty",
    "cart.total": "Total",
    "cart.checkout": "Proceed to Checkout",
    "cart.toast.updatedTitle": "Updated cart",
    "cart.toast.quantityIncreased": "{product} quantity increased",
    "cart.toast.couldNotAddTitle": "Couldn't add item",
    "cart.toast.couldNotAddDescription": "That product isn't available right now. Try selecting it from the list.",
    "cart.toast.addedTitle": "Added to cart",
    "cart.toast.addedDescription": "{product} added to your cart",
    "cart.toast.couldNotOpenTitle": "Couldn't open product",
    "cart.toast.couldNotOpenDescription": "Please select a product from the list to view details.",

    "chat.welcome": "What are you looking for?",
    "chat.continueToConcierge": "Continue to Concierge",
    "chat.openConcierge": "Open Concierge",
    "chat.goldOnlyLabel": "Gold only",
    "chat.placeholder": "Ask anything about gold...",
    "chat.placeholderFull": "Ask anything about gold...",
    "chat.placeholderWholesalePreviewMobile": "Ask anything about gold...",
    "chat.placeholderWholesalePreview": "Ask anything about gold...",
    "chat.placeholderWholesaleMobile": "Ask anything about gold...",
    "chat.placeholderWholesale": "Ask anything about gold...",
    "chat.failedToGetResponse": "Failed to get response",

    "assistantDock.title": "Chairman Assistant",
    "assistantDock.allCompanies": "All companies",
    "assistantDock.thinking": "Thinking",
    "assistantDock.voiceResponseReady.title": "Voice response ready",
    "assistantDock.voiceResponseReady.description": "Click the volume icon to enable audio playback",
    "assistantDock.conversationSummary": "Conversation Summary",
    "assistantDock.keyDecisions": "Key Decisions:",
    "assistantDock.actionItems": "Action Items:",
    "assistantDock.loadOlder": "Load older messages",
    "assistantDock.emptyTitle": "Your Strategic Assistant",
    "assistantDock.emptyDescription": "I remember our conversations and learn from past decisions. Ask me anything!",
    "assistantDock.viewThinkingProcess": "View thinking process",
    "assistantDock.internalReasoning": "Internal Reasoning",
    "assistantDock.jumpToLatest": "Jump to latest",
    "assistantDock.placeholder": "Ask your assistant...",
    "assistantDock.historicalNote": "Historical conversation. Return to today's session to send messages.",
    "assistantDock.failedToSend": "Failed to send message",

    "settings.language": "Language",
    "settings.currency": "Currency",

    "common.close": "Close",
    "common.cancel": "Cancel",
    "common.signIn": "Sign in",
    "common.createAccount": "Create account",
    "common.signOut": "Sign out",
    "common.notNow": "Not now",
    "common.select": "Select...",
    "common.error": "Error",
    "common.loading": "Loading...",
    "common.guest": "Guest",
    "common.menu": "Menu",
    "common.settings": "Settings",
    "common.all": "All",
    "common.allCategories": "All categories",
    "common.browse": "Browse",
    "common.continueBrowsing": "Continue browsing",
    "common.clear": "Clear",
    "common.clearFilter": "Clear filter",
    "common.terms": "Terms",
    "common.privacy": "Privacy",
    "common.compliance": "Compliance",
    "common.item": "item",
    "common.items": "items",
    "common.product": "product",
    "common.products": "products",
    "common.seller": "seller",
    "common.sellers": "sellers",
    "common.categories": "Categories",
    "common.back": "Back",
    "common.continue": "Continue",
    "common.skip": "Skip",
    "common.submit": "Submit",
    "common.submitting": "Submittingâ€¦",
    "common.selectLabel": "Select",
    "common.remove": "Remove",
    "common.noFileSelected": "No file selected",
    "common.required": "Required",
    "common.optional": "Optional",
    "common.updated": "updated",
    "common.view": "View",
    "common.viewDetails": "View details",
    "common.viewCatalog": "View catalog",
    "common.contactWhatsapp": "Contact (WhatsApp)",
    "common.deploy": "Deploy",

    "wizard.toast.checkStepTitle": "Check this step",
    "wizard.toast.submittedTitle": "Submitted",
    "wizard.toast.submittedDescription": "Your application was submitted successfully.",
    "wizard.toast.submitFailedTitle": "Submit failed",
    "wizard.error.uploadRequired": "Please upload the required document.",
    "wizard.error.completeStep": "Please complete this step before continuing.",
    "wizard.error.answerToContinue": "Please answer to continue.",
    "wizard.error.selectOptionToContinue": "Select an option to continue.",
    "wizard.label.uploadedPrefix": "Uploaded:",
    "wizard.label.done": "Done",
    "wizard.file.reuploadWarning": "You previously selected a file, but it must be re-uploaded after refresh before submitting.",

    "auth.verificationRequired": "Verification required",
    "auth.signInToAccessExportunity": "Sign in to access Exportunity",
    "auth.completeVerificationToUnlockExportunity": "Complete basic verification to unlock Exportunity (Marketplace + Wholesale).",
    "auth.exportunityRequiresVerifiedAccount": "Exportunity requires a verified account to browse and transact.",
    "auth.startVerification": "Start verification",
    "auth.signedOutTitle": "Signed out",
    "auth.signedOutDescription": "You have been signed out.",

    "units.km": "km",

    "pro.space": "Pro space",
    "pro.app.title": "Pro App",
    "pro.app.scanToOpen": "Scan to open:",
    "pro.app.qrAlt": "Pro app QR",

    "buyer.expandTo": "Expand to",
    "buyer.expandRadius": "Expand radius",
    "buyer.exploreAll": "Explore all",
    "buyer.noProducts.titleGold": "No products found",
    "buyer.noProducts.titleGeneral": "No products nearby",
    "buyer.noProducts.titleGlobal": "No products available",
    "buyer.noProducts.desc.loadError": "We couldn't load products right now. Please try again.",
    "buyer.noProducts.desc.category": "No products match this category. Try clearing filters or expanding your radius.",
    "buyer.noProducts.desc.noSellers": "No sellers are available in this area yet. Try setting your location or expanding your radius.",
    "buyer.noProducts.desc.sellersNoProducts": "Sellers are nearby, but no products are published yet. Try again soon or switch categories.",
    "buyer.noProducts.desc.generic": "Try expanding your radius or setting your location for better results.",
    "buyer.categories.scrollLeft": "Scroll categories left",
    "buyer.categories.scrollRight": "Scroll categories right",
    "buyer.categories.showingClosestItems": "Showing closest items (no sellers within {radiusKm} {unit}).",
    "buyer.categories.scrollForMore": "Scroll for more categories.",
    "buyer.categories.noItemsFallback": "No items in this category yet. Showing all products.",
    "buyer.feed.expandingGold": "Expanding search for gold around you.",
    "buyer.feed.expandingGeneral": "Expanding search for items around you.",

    "buyer.panel.wholesaleDore.title": "Wholesale DorÃ© Trading",
    "buyer.panel.wholesaleMarketplace.title": "Wholesale Marketplace",
    "buyer.panel.wholesaleMarketplace.subtitle": "Bulk purchasing, RFQs, and supplier coordination.",
    "buyer.panel.retailGold.title": "Stamped Gold",
    "buyer.panel.retailGold.subtitle": "Stamped investment gold units â€¢ Certified and sealed bullion pieces",
    "buyer.panel.retailNearby.title": "Nearby Marketplace",
    "buyer.panel.retailNearby.subtitle": "Near-me retail, fast checkout, and local delivery.",

    "location.set": "Set location",
    "location.setToSeeDistance": "Set location to see distance",

    "admin.addProduct": "Add product",
    "admin.noProducts.desc.addProduct": "Add a product to populate this section.",
    "admin.seedInventory": "Seed inventory",
    "admin.seedFailed": "Seed failed",
    "admin.seededInventory.title": "Seeded marketplace inventory",

    "cart.emptyHelp": "Browse the feed to add products and gold lots.",
    "cart.multipleShops.title": "Multiple shops detected",
    "cart.multipleShops.description": "Please order from one shop at a time. Remove items from other shops.",

    "location.locating": "Locating...",
    "location.enable": "Enable location",
    "location.unavailable": "Location unavailable",
    "location.approx.title": "Using approximate location",
    "location.approx.description": "We couldn't get a precise GPS fix. Showing nearby results using an approximate location.",
    "location.approx.label": "Approx.",
    "location.toast.title": "Location needed",
    "location.toast.description": "Allow location access to see sellers around you.",
    "location.title": "Location",
    "location.subtitle": "The platform can use your device location and update it while you browse.",
    "location.status.updating": "Updating location...",
    "location.status.off": "Location off",
    "location.status.active": "Location active",
    "location.status.nearbyGps": "Near you (GPS)",
    "location.status.nearbyApprox": "Near you (Approx.)",
    "location.status.denied": "Location permission blocked",
    "location.status.unavailable": "Location not available",
    "location.status.error": "Location error",
    "location.help.secureContext": "Location requires HTTPS. Open the site over https and try again.",
    "location.help.denied": "Enable location access in your browser settings, then tap Retry.",
    "location.help.iosPwa": "On iOS, location may be blocked in the installed app. Open in Safari and allow location, then tap Retry.",
    "location.help.unavailable": "Your browser/device doesn't support location services.",
    "location.help.requesting": "Waiting for your browser's GPS response.",
    "location.help.active": "Your location updates automatically while this page is open.",
    "location.help.timeout": "GPS is taking too long. Try again or use manual/approximate location.",
    "location.help.positionUnavailable": "GPS couldn't determine your position. Try again or use manual/approximate location.",
    "location.help.errorGeneric": "Couldn't determine your location. Try again or use manual/approximate location.",
    "location.lastUpdate": "Last update:",
    "location.radius.title": "Nearby radius",
    "location.radius.subtitle": "Controls how far we search for nearby sellers.",
    "location.manual.title": "Set location manually",
    "location.manual.subtitle": "If device location fails, choose your country/city and weâ€™ll use it for nearby results.",
    "location.manual.country": "Country",
    "location.manual.region": "Region",
    "location.manual.city": "City",
    "location.manual.use": "Use selected location",
    "location.manual.toast.title": "Select a city",
    "location.manual.toast.description": "Choose a country, region, and city to set your location manually.",
    "location.manual.noGps.title": "City has no GPS coordinates",
    "location.manual.noGps.description": "Please select a different city or enable device location.",
    "location.retry": "Retry location",

    "wallet.availableBalance": "Available Balance",
    "wallet.deposited": "Deposited",
    "wallet.spent": "Spent",
    "wallet.sendHint": "Send credits instantly via username, phone, or QR code - free!",
    "wallet.saveWalletSuffix": "to save your wallet",
    "wallet.deposit": "Deposit",
    "wallet.depositAmount": "Amount",
    "wallet.depositSuccess": "Deposit successful",
    "wallet.depositSuccessDetail": "Your wallet has been credited.",
    "wallet.depositFailed": "Deposit failed",

    "wallet.title": "My Wallet",
    "vault.title": "My Vault",
    "vault.totalGold": "Total gold",
    "vault.units": "Gold Units",
    "vault.signInToAccess": "Sign in to access your Virtual Gold Vault.",
    "vault.description": "Stored in your Virtual Gold Vault (delivery now or later).",
    "vault.noUnits": "No gold units yet.",
    "vault.status": "Status",
    "vault.locked": "LOCKED",
    "vault.available": "AVAILABLE",
    "vault.lockupEnds": "Lockup ends",
    "vault.buyUnits": "Buy gold units",
    "vault.buyUnitsDescription": "Choose a standard unit in grams and confirm purchase.",
    "vault.unitSize": "Unit size",
    "vault.deliveryChoice": "Delivery",
    "vault.storeInVault": "Store in vault",
    "vault.deliveryNow": "Deliver now",
    "vault.lockupLabel": "Do not deliver before",
    "vault.lockupHelp": "Optional: blocks delivery requests until this date.",
    "vault.confirmPurchase": "Confirm purchase",
    "vault.pricingAtPurchase": "Price is fixed at purchase time (snapshot).",
    "vault.purchaseSuccess": "Purchase confirmed",
    "vault.purchaseSuccessDetail": "Your gold unit has been added to your vault.",
    "vault.purchaseFailed": "Purchase failed",
    "vault.requestDelivery": "Request delivery",
    "vault.deliveryRequested": "Delivery requested",
    "vault.deliveryRequestedDetail": "Your delivery request has been recorded.",
    "vault.deliveryRequestFailed": "Delivery request failed",
    "vault.authorizeResale": "Authorize resale",
    "vault.resaleAuthorized": "Resale authorized",
    "vault.resaleAuthorizedDetail": "You can now create a secondary-market listing.",
    "vault.resaleAuthorizeFailed": "Resale authorization failed",
    "vault.listForResale": "List for resale",
    "vault.listingCreated": "Listing created",
    "vault.listingCreatedDetail": "Your unit is listed for confirmed clients.",
    "vault.listingCreateFailed": "Listing creation failed",

    "secondaryMarket.title": "Secondary market",
    "secondaryMarket.description": "Restricted to confirmed clients. Purchases settle via the wallet.",
    "secondaryMarket.restricted": "Secondary market access is restricted to confirmed clients.",
    "secondaryMarket.empty": "No listings right now.",
    "secondaryMarket.listing": "Listing",
    "secondaryMarket.visibleToConfirmed": "Visible only to confirmed clients",
    "secondaryMarket.buy": "Buy",
    "secondaryMarket.purchaseSuccess": "Purchase successful",
    "secondaryMarket.purchaseSuccessDetail": "The unit has been transferred to your vault.",
    "secondaryMarket.purchaseFailed": "Purchase failed",

    "badge.bureauAchat": "Bureau d'Achat",
    "badge.govLicensed": "Government Licensed",
    "badge.assayerVerified": "Assayer Verified",
    "badge.lbmaCustody": "Chain of Custody",

    "certifications.title": "Certifications",
    "trading.title": "Gold Trading",
    "trading.subtitle": "Dor\u00e9 & Stamped Gold",

    "price.perGram": "/g",
    "price.perOz": "/oz",

    "ticker.lbmaGold": "GOLD SPOT",
    "ticker.localPremium": "local premium",
    "ticker.coteIvoire": "C\u00d4TE D'IVOIRE",
  },
  fr: {
    "header.title": "Bourse de lâ€™Or",
    "header.subtitle": "Par Exportunity",
    "header.suppliers": "fournisseurs d'or",
    "header.certified": "Bureau d'Achat certifi\u00e9",
    "header.availableGold": "Or disponible",

    "nav.marketplace": "MarchÃ©",
    "nav.dore": "DorÃ©",
    "nav.machinery": "Machines miniÃ¨res",
    "nav.investments": "OpportunitÃ©s dâ€™investissement",

    "nav.account": "Compte",
    "nav.orders": "Commandes",
    "nav.contracts": "Contrats",
    "nav.map": "Carte",
    "nav.wallet": "Portefeuille",
    "nav.vault": "Coffre",
    "account.deliveryDashboard": "Tableau de livraison",
    "account.adminConsole": "Console admin",
    "account.signInToAccessOrdersAndWallet": "Connectez-vous pour accÃ©der Ã  vos commandes et Ã  votre portefeuille.",

    "mode.retail": "Marketplace",
    "mode.wholesale": "Gros",

    "feed.aroundYou.title": "Autour de vous",
    "feed.aroundYou.subtitle": "Nouveaut\u00e9s \u00e0 proximit\u00e9",
    "feed.popular.title": "S\u00e9lection pr\u00e8s de chez vous",
    "feed.popular.subtitle": "Populaire aupr\u00e8s des locaux",

    "sections.doreLots.title": "Lots de dor\u00e9",
    "sections.doreLots.subtitle": "Sourc\u00e9s aupr\u00e8s de fournisseurs agr\u00e9\u00e9s, vendus par Bourse de l\u2019Or",
    "sections.stamped.title": "Barres estamp\u00e9es (10g+)",
    "sections.stamped.subtitle": "Unités d'or estampé, certifiées et scellées",
    "sections.jewelry.title": "Bijoux",
    "sections.jewelry.subtitle": "Bijoux s\u00e9lectionn\u00e9s & ateliers v\u00e9rifi\u00e9s",
    "sections.goldArt.title": "Objets d\u2019art en or",
    "sections.goldArt.subtitle": "Pi\u00e8ces de collection & objets d\u2019atelier",

    "cart.subtotal": "Sous-total",
    "cart.delivery": "Livraison",

    "units.month": "mois",
    "units.months": "mois",
    "units.year": "an",
    "units.years": "ans",
    "units.kg": "kg",
    "units.kgPerMonth": "kg/mois",

    "investments.subtitle": "Permis cadastre v\u00e9rifi\u00e9s \u2014 overlays d'investissement",
    "investments.searchPlaceholder": "Rechercher des opportunit\u00e9s\u2026",
    "investments.listMine": "Revendiquer un permis cadastre",
    "investments.empty": "Aucune opportunit\u00e9 ne correspond \u00e0 ces filtres.",
    "investments.badge.verifiedMine": "Mine licenci\u00e9e (v\u00e9rifi\u00e9e)",
    "investments.snapshot.title": "R\u00e9sum\u00e9 de la mine",
    "investments.field.licenseActiveSince": "Licence active depuis",
    "investments.field.currentCapacity": "Capacit\u00e9 actuelle",
    "investments.field.historicalProduction": "Production historique",
    "investments.field.remainingPotential": "Potentiel restant",
    "investments.field.capitalRequired": "Capital requis",
    "investments.field.duration": "Dur\u00e9e",
    "investments.historical.totalSuffix": "au total",
    "investments.historical.last12m": "12 mois",
    "investments.atCurrentRate": "au rythme actuel",
    "investments.potential.low": "Faible",
    "investments.potential.medium": "Moyen",
    "investments.potential.high": "\u00c9lev\u00e9",
    "investments.returnModel.rotationIndicative": "Rendement par rotation (indicatif)",
    "investments.actions.viewOpportunity": "Voir l\u2019opportunit\u00e9",
    "investments.actions.viewMachinery": "Voir la machine",

    "cadastre.badgeVerified": "Cadastre v\u00e9rifi\u00e9",
    "cadastre.permit": "Permis cadastre",
    "cadastre.permitId": "ID du permis",
    "cadastre.permitType": "Type de permis",
    "cadastre.permitStatus": "Statut du permis",
    "cadastre.commodity": "Substance",
    "cadastre.region": "Localisation",
    "cadastre.sourceLink": "Source officielle du cadastre",
    "cadastre.sectionTitle": "R\u00e9f\u00e9rence cadastre",
    "cadastre.missing": "R\u00e9f\u00e9rence cadastre manquante \u2014 cette opportunit\u00e9 ne peut pas \u00eatre affich\u00e9e.",
    "cadastre.unavailable": "Donn\u00e9es de cadastre indisponibles pour ce pays. Les investissements sont d\u00e9sactiv\u00e9s.",
    "cadastre.claimCta": "Revendiquer un permis cadastre",
    "cadastre.claimTitle": "Revendiquer un permis cadastre",
    "cadastre.claimDescription": "S\u00e9lectionnez un permis depuis le cadastre officiel. Aucune saisie manuelle de mine.",
    "cadastre.claimRule": "Les permis doivent exister dans le cadastre officiel. Sans r\u00e9f\u00e9rence = pas d'annonce, pas de chat, pas d'investissement.",
    "cadastre.searchPlaceholder": "Rechercher par ID de permis, titulaire ou r\u00e9gion",
    "cadastre.allCountries": "Tous les pays (cadastre)",
    "cadastre.noResults": "Aucun permis cadastre ne correspond \u00e0 la recherche.",
    "cadastre.selectedPermit": "Permis s\u00e9lectionn\u00e9",
    "cadastre.proofLabel": "Preuve d'autorit\u00e9",
    "cadastre.proofSelected": "S\u00e9lectionn\u00e9 : {file}",
    "cadastre.claimNote": "Note de demande (optionnelle)",
    "cadastre.claimNotePlaceholder": "Ajoutez des notes de v\u00e9rification\u2026",
    "cadastre.selectPrompt": "S\u00e9lectionnez d\u2019abord un permis cadastre.",
    "cadastre.proofRequired": "La preuve d'autorit\u00e9 est requise.",
    "cadastre.claimSubmit": "Revendiquer ce permis",
    "cadastre.claimSubmitted": "Demande envoy\u00e9e",
    "cadastre.claimSubmittedDesc": "La v\u00e9rification examinera vos documents avant activation.",
    "cadastre.claimRequired": "Demande cadastre requise",

    "machinery.category.extraction": "Extraction",
    "machinery.category.processing": "Traitement",
    "machinery.category.support": "Support",
    "machinery.category.mobility": "Mobilit\u00e9",
    "machinery.category.spare_parts": "Pi\u00e8ces d\u00e9tach\u00e9es",
    "machinery.condition.new": "Neuf",
    "machinery.condition.refurbished": "Reconditionn\u00e9",
    "machinery.condition.used": "Occasion",
    "machinery.status.in_stock": "En stock",
    "machinery.status.built_to_order": "Sur commande",
    "machinery.status.used": "Occasion",
    "machinery.status.reserved": "R\u00e9serv\u00e9",
    "machinery.status.unavailable": "Indisponible",
    "seller.type.manufacturer": "Fabricant",
    "seller.type.authorized_representative": "Repr\u00e9sentant agr\u00e9\u00e9",
    "seller.type.owner_resale": "Revente propri\u00e9taire (occasion)",
    "machinery.soldBy": "Vendu par :",
    "machinery.financingAvailable": "Financement disponible",
    "machinery.requestFinancing": "Demander un financement",
    "machinery.toast.buyRequestTitle": "Demande dâ€™achat",
    "machinery.toast.buyRequestDescription": "Une demande dâ€™achat a Ã©tÃ© crÃ©Ã©e.",
    "machinery.toast.financingRequestTitle": "Demande de financement",
    "machinery.toast.financingRequestDescription": "Nous vous contacterons sous peu.",
    "machinery.toast.deployTitle": "DÃ©ployer",
    "machinery.toast.deployDescription": "Le flux de dÃ©ploiement arrive bientÃ´t.",

    "product.sellerType.wholesaleSupplier": "Fournisseur de dor\u00e9 (gros)",
    "product.sellerType.jewelryManufacturer": "Fabricant de bijoux",
    "product.sellerType.retailSeller": "Vendeur d\u2019or (d\u00e9tail)",
    "product.pricing.lbma": "Prix de r\u00e9f\u00e9rence LBMA",
    "product.pricing.curated": "Prix atelier (s\u00e9lection)",
    "product.certificationsCompliance": "Certifications & conformit\u00e9",
    "product.favorites.savedTitle": "Ajout\u00e9 aux favoris",
    "product.favorites.savedDescription": "Ajout\u00e9 \u00e0 vos favoris",
    "product.addedToOrder": "Ajout\u00e9 \u00e0 la commande",

    "wholesale.preview.title": "Aper\u00e7u gros (acc\u00e8s contr\u00f4l\u00e9)",
    "wholesale.preview.subtitle": "Postulez pour d\u00e9bloquer des contreparties agr\u00e9\u00e9es",
    "wholesale.preview.accessRequired": "Acc\u00e8s autoris\u00e9 requis",
    "wholesale.preview.hiddenUntilApproval": "Les contreparties, emplacements pr\u00e9cis et flux de trading sont masqu\u00e9s jusqu\u2019\u00e0 approbation.",
    "wholesale.preview.requestPending": "Demande en attente",
    "wholesale.apply.accessButton": "Demander l\u2019acc\u00e8s au gros",
    "wholesale.apply.dialogTitle": "Demande de partenaire gros",
    "wholesale.apply.dialogDescription": "TÃ©lÃ©versez votre licence de trading pour demander un accÃ¨s autorisÃ©. Les contreparties et emplacements prÃ©cis restent masquÃ©s jusquâ€™Ã  approbation.",
    "wholesale.apply.step1.title": "Ã‰tape 1 â€” Se connecter",
    "wholesale.apply.step1.description": "Lâ€™accÃ¨s au gros nâ€™est disponible que pour les comptes vÃ©rifiÃ©s.",
    "wholesale.apply.step2.title": "Ã‰tape 2 â€” TÃ©lÃ©verser la licence",
    "wholesale.apply.step2.description": "AcceptÃ© : PDF / image. Lâ€™autoritÃ© Ã©mettrice, le type et la date dâ€™expiration sont requis.",
    "wholesale.apply.selectedFile": "SÃ©lectionnÃ© : {file}",
    "wholesale.apply.step3.title": "Ã‰tape 3 â€” Soumettre pour examen",
    "wholesale.apply.step3.description": "Lâ€™accÃ¨s est accordÃ© uniquement aprÃ¨s vÃ©rification et contrÃ´les de conformitÃ©.",
    "wholesale.apply.status.approved": "DÃ©jÃ  approuvÃ©",
    "wholesale.apply.submitApplication": "Envoyer la demande",
    "wholesale.apply.cta": "Postuler pour devenir partenaire autoris\u00e9",
    "wholesale.apply.continueRetail": "Continuer en mode marketplace",

    "product.dore": "Dor\u00e9",
    "product.refined": "Raffin\u00e9",
    "product.22k": "22K",
    "product.18k": "18K",
    "product.available": "disponible",
    "product.sold": "VENDU",
    "product.soldOut": "\u00c9PUIS\u00c9",
    "product.purity.dore": "Dor\u00e9 (or brut) | selon analyse",
    "product.purity.22k": "Or estamp\u00e9 | unit\u00e9s 22K scell\u00e9es",
    "product.purity.18k": "Or estamp\u00e9 | unit\u00e9s 18K scell\u00e9es",
    "product.lbmaRef": "R\u00e9f :",
    "product.vsLbma": "vs r\u00e9f",

    "productDetails.section.descriptionTitle": "Description",
    "productDetails.section.complianceTitle": "Conformit\u00e9",
    "productDetails.section.deliveryTitle": "Livraison",
    "productDetails.descriptionFallback": "{product} de qualit\u00e9 premium, sourc\u00e9 directement aupr\u00e8s de {shop}.",
    "productDetails.complianceBody": "Les justificatifs de provenance, de garde et de certification sont disponibles sur demande.",
    "productDetails.deliveryBody": "Les d\u00e9lais de livraison et les transferts de garde sont confirm\u00e9s lors du paiement.",

    "button.add": "Ajouter",
    "button.addToOrder": "Ajouter \u00e0 la commande",
    "button.viewProducts": "Voir tous les produits",
    "button.viewProducer": "Voir le producteur",

    "cart.title": "Votre commande",
    "cart.empty": "Votre panier est vide",
    "cart.total": "Total",
    "cart.checkout": "Passer \u00e0 la caisse",
    "cart.toast.updatedTitle": "Panier mis Ã  jour",
    "cart.toast.quantityIncreased": "QuantitÃ© augmentÃ©e pour {product}",
    "cart.toast.couldNotAddTitle": "Impossible dâ€™ajouter lâ€™article",
    "cart.toast.couldNotAddDescription": "Ce produit nâ€™est pas disponible pour le moment. Essayez de le sÃ©lectionner dans la liste.",
    "cart.toast.addedTitle": "AjoutÃ© au panier",
    "cart.toast.addedDescription": "{product} a Ã©tÃ© ajoutÃ© Ã  votre panier",
    "cart.toast.couldNotOpenTitle": "Impossible dâ€™ouvrir le produit",
    "cart.toast.couldNotOpenDescription": "Veuillez sÃ©lectionner un produit dans la liste pour voir les dÃ©tails.",

    "chat.welcome": "Que cherchez-vous ?",
    "chat.continueToConcierge": "Continuer vers le concierge",
    "chat.openConcierge": "Ouvrir le concierge",
    "chat.goldOnlyLabel": "Or uniquement",
    "chat.placeholder": "Demandez tout sur l'or...",
    "chat.placeholderFull": "Demandez tout sur l'or...",
    "chat.placeholderWholesalePreviewMobile": "Demandez tout sur l'or...",
    "chat.placeholderWholesalePreview": "Demandez tout sur l'or...",
    "chat.placeholderWholesaleMobile": "Demandez tout sur l'or...",
    "chat.placeholderWholesale": "Demandez tout sur l'or...",
    "chat.failedToGetResponse": "Impossible d'obtenir une rÃ©ponse",

    "assistantDock.title": "Assistant du Chairman",
    "assistantDock.allCompanies": "Toutes les entreprises",
    "assistantDock.thinking": "RÃ©flexion",
    "assistantDock.voiceResponseReady.title": "RÃ©ponse vocale prÃªte",
    "assistantDock.voiceResponseReady.description": "Cliquez sur lâ€™icÃ´ne de volume pour activer la lecture audio",
    "assistantDock.conversationSummary": "RÃ©sumÃ© de la conversation",
    "assistantDock.keyDecisions": "DÃ©cisions clÃ©s :",
    "assistantDock.actionItems": "Actions :",
    "assistantDock.loadOlder": "Charger les messages plus anciens",
    "assistantDock.emptyTitle": "Votre assistant stratÃ©gique",
    "assistantDock.emptyDescription": "Je me souviens de nos conversations et jâ€™apprends des dÃ©cisions passÃ©es. Demandez-moi nâ€™importe quoi !",
    "assistantDock.viewThinkingProcess": "Voir le raisonnement",
    "assistantDock.internalReasoning": "Raisonnement interne",
    "assistantDock.jumpToLatest": "Aller au plus rÃ©cent",
    "assistantDock.placeholder": "Demandez Ã  votre assistant...",
    "assistantDock.historicalNote": "Conversation historique. Revenez Ã  la session du jour pour envoyer des messages.",
    "assistantDock.failedToSend": "Ã‰chec de lâ€™envoi du message",

    "settings.language": "Langue",
    "settings.currency": "Devise",

    "common.close": "Fermer",
    "common.cancel": "Annuler",
    "common.signIn": "Se connecter",
    "common.createAccount": "Creer un compte",
    "common.signOut": "Se deconnecter",
    "common.notNow": "Pas maintenant",
    "common.select": "Selectionner...",
    "common.error": "Erreur",
    "common.loading": "Chargement...",
    "common.guest": "Invite",
    "common.menu": "Menu",
    "common.settings": "Parametres",
    "common.all": "Tout",
    "common.allCategories": "Toutes les categories",
    "common.browse": "Parcourir",
    "common.continueBrowsing": "Continuer a parcourir",
    "common.clear": "Effacer",
    "common.clearFilter": "Effacer le filtre",
    "common.terms": "Conditions",
    "common.privacy": "Confidentialite",
    "common.compliance": "Conformite",
    "common.item": "article",
    "common.items": "articles",
    "common.product": "produit",
    "common.products": "produits",
    "common.seller": "vendeur",
    "common.sellers": "vendeurs",
    "common.categories": "Categories",
    "common.back": "Retour",
    "common.continue": "Continuer",
    "common.skip": "Passer",
    "common.submit": "Envoyer",
    "common.submitting": "Envoi...",
    "common.selectLabel": "Selectionner",
    "common.remove": "Retirer",
    "common.noFileSelected": "Aucun fichier selectionne",
    "common.required": "Requis",
    "common.optional": "Optionnel",
    "common.updated": "mis Ã  jour",
    "common.view": "Voir",
    "common.viewDetails": "Voir les dÃ©tails",
    "common.viewCatalog": "Voir le catalogue",
    "common.contactWhatsapp": "Contacter (WhatsApp)",
    "common.deploy": "DÃ©ployer",

    "wizard.toast.checkStepTitle": "VÃ©rifiez cette Ã©tape",
    "wizard.toast.submittedTitle": "EnvoyÃ©",
    "wizard.toast.submittedDescription": "Votre demande a Ã©tÃ© envoyÃ©e avec succÃ¨s.",
    "wizard.toast.submitFailedTitle": "Ã‰chec de lâ€™envoi",
    "wizard.error.uploadRequired": "Veuillez tÃ©lÃ©verser le document requis.",
    "wizard.error.completeStep": "Veuillez complÃ©ter cette Ã©tape avant de continuer.",
    "wizard.error.answerToContinue": "Veuillez rÃ©pondre pour continuer.",
    "wizard.error.selectOptionToContinue": "SÃ©lectionnez une option pour continuer.",
    "wizard.label.uploadedPrefix": "TÃ©lÃ©versÃ©:",
    "wizard.label.done": "TerminÃ©",
    "wizard.file.reuploadWarning": "Vous aviez sÃ©lectionnÃ© un fichier, mais il doit Ãªtre tÃ©lÃ©versÃ© Ã  nouveau aprÃ¨s un rafraÃ®chissement avant lâ€™envoi.",

    "auth.verificationRequired": "VÃ©rification requise",
    "auth.signInToAccessExportunity": "Connectez-vous pour accÃ©der Ã  Exportunity",
    "auth.completeVerificationToUnlockExportunity": "ComplÃ©tez la vÃ©rification de base pour dÃ©bloquer Exportunity (Marketplace + Gros).",
    "auth.exportunityRequiresVerifiedAccount": "Exportunity nÃ©cessite un compte vÃ©rifiÃ© pour parcourir et effectuer des transactions.",
    "auth.startVerification": "DÃ©marrer la vÃ©rification",
    "auth.signedOutTitle": "DÃ©connectÃ©",
    "auth.signedOutDescription": "Vous avez Ã©tÃ© dÃ©connectÃ©.",

    "units.km": "km",

    "pro.space": "Espace Pro",
    "pro.app.title": "App Pro",
    "pro.app.scanToOpen": "Scannez pour ouvrir :",
    "pro.app.qrAlt": "QR App Pro",

    "buyer.expandTo": "Ã‰tendre Ã ",
    "buyer.expandRadius": "Ã‰tendre le rayon",
    "buyer.exploreAll": "Explorer tout",
    "buyer.noProducts.titleGold": "Aucun produit trouvÃ©",
    "buyer.noProducts.titleGeneral": "Aucun produit Ã  proximitÃ©",
    "buyer.noProducts.titleGlobal": "Aucun produit disponible",
    "buyer.noProducts.desc.loadError": "Impossible de charger les produits pour le moment. Veuillez rÃ©essayer.",
    "buyer.noProducts.desc.category": "Aucun produit ne correspond Ã  cette catÃ©gorie. Effacez les filtres ou Ã©tendez le rayon.",
    "buyer.noProducts.desc.noSellers": "Aucun vendeur disponible dans cette zone. DÃ©finissez votre localisation ou Ã©tendez le rayon.",
    "buyer.noProducts.desc.sellersNoProducts": "Des vendeurs sont proches, mais aucun produit nâ€™est publiÃ©. RÃ©essayez plus tard ou changez de catÃ©gorie.",
    "buyer.noProducts.desc.generic": "Essayez dâ€™Ã©tendre le rayon ou de dÃ©finir votre localisation pour de meilleurs rÃ©sultats.",
    "buyer.categories.scrollLeft": "Defiler les categories vers la gauche",
    "buyer.categories.scrollRight": "Defiler les categories vers la droite",
    "buyer.categories.showingClosestItems": "Affichage des articles les plus proches (aucun vendeur dans un rayon de {radiusKm} {unit}).",
    "buyer.categories.scrollForMore": "Defiler pour plus de categories.",
    "buyer.categories.noItemsFallback": "Aucun article dans cette catÃ©gorie pour le moment. Affichage de tous les produits.",
    "buyer.feed.expandingGold": "Ã‰largissement de la recherche dâ€™or autour de vous.",
    "buyer.feed.expandingGeneral": "Ã‰largissement de la recherche dâ€™articles autour de vous.",

    "buyer.panel.wholesaleDore.title": "DorÃ© en gros",
    "buyer.panel.wholesaleMarketplace.title": "MarchÃ© de gros",
    "buyer.panel.wholesaleMarketplace.subtitle": "Achats en volume, demandes de devis et coordination fournisseurs.",
    "buyer.panel.retailGold.title": "Or estampé",
    "buyer.panel.retailGold.subtitle": "UnitÃ©s d'or d'investissement estampÃ©es â€¢ Lingots certifiÃ©s et scellÃ©s",
    "buyer.panel.retailNearby.title": "Marketplace Ã  proximitÃ©",
    "buyer.panel.retailNearby.subtitle": "Vente locale, paiement rapide et livraison.",

    "location.set": "DÃ©finir la localisation",
    "location.setToSeeDistance": "DÃ©finissez la localisation pour voir la distance",

    "admin.addProduct": "Ajouter un produit",
    "admin.noProducts.desc.addProduct": "Ajoutez un produit pour remplir cette section.",
    "admin.seedInventory": "GÃ©nÃ©rer un inventaire",
    "admin.seedFailed": "Ã‰chec de gÃ©nÃ©ration",
    "admin.seededInventory.title": "Inventaire gÃ©nÃ©rÃ©",

    "cart.emptyHelp": "Parcourez le flux pour ajouter des produits et des lots dâ€™or.",
    "cart.multipleShops.title": "Plusieurs boutiques dÃ©tectÃ©es",
    "cart.multipleShops.description": "Veuillez commander auprÃ¨s dâ€™une seule boutique Ã  la fois. Retirez les articles des autres boutiques.",

    "location.locating": "Localisation...",
    "location.enable": "Activer la localisation",
    "location.unavailable": "Localisation indisponible",
    "location.approx.title": "Localisation approximative",
    "location.approx.description": "Impossible d'obtenir une localisation GPS prÃ©cise. Nous affichons des rÃ©sultats proches Ã  partir d'une localisation approximative.",
    "location.approx.label": "Approx.",
    "location.toast.title": "Localisation nÃ©cessaire",
    "location.toast.description": "Autorisez la localisation pour voir les vendeurs autour de vous.",
    "location.title": "Localisation",
    "location.subtitle": "La plateforme peut utiliser votre localisation et la mettre Ã  jour pendant votre navigation.",
    "location.status.updating": "Mise Ã  jour de la localisation...",
    "location.status.off": "Localisation dÃ©sactivÃ©e",
    "location.status.active": "Localisation active",
    "location.status.nearbyGps": "PrÃ¨s de vous (GPS)",
    "location.status.nearbyApprox": "PrÃ¨s de vous (Approx.)",
    "location.status.denied": "Autorisation de localisation bloquÃ©e",
    "location.status.unavailable": "Localisation non disponible",
    "location.status.error": "Erreur de localisation",
    "location.help.secureContext": "La localisation nÃ©cessite HTTPS. Ouvrez le site en https puis rÃ©essayez.",
    "location.help.denied": "Activez la localisation dans les paramÃ¨tres du navigateur, puis appuyez sur RÃ©essayer.",
    "location.help.iosPwa": "Sur iOS, la localisation peut Ãªtre bloquÃ©e dans lâ€™app installÃ©e. Ouvrez dans Safari, autorisez la localisation, puis appuyez sur RÃ©essayer.",
    "location.help.unavailable": "Votre navigateur/appareil ne prend pas en charge la localisation.",
    "location.help.requesting": "En attente de la rÃ©ponse GPS de votre navigateur.",
    "location.help.active": "Votre localisation se met Ã  jour automatiquement tant que cette page est ouverte.",
    "location.help.timeout": "Le GPS met trop de temps. RÃ©essayez ou utilisez une localisation manuelle/approximative.",
    "location.help.positionUnavailable": "Le GPS ne parvient pas Ã  dÃ©terminer votre position. RÃ©essayez ou utilisez une localisation manuelle/approximative.",
    "location.help.errorGeneric": "Impossible de dÃ©terminer votre localisation. RÃ©essayez ou utilisez une localisation manuelle/approximative.",
    "location.lastUpdate": "DerniÃ¨re mise Ã  jour :",
    "location.radius.title": "Rayon de proximitÃ©",
    "location.radius.subtitle": "DÃ©finit jusquâ€™oÃ¹ nous cherchons des vendeurs proches.",
    "location.manual.title": "DÃ©finir manuellement la localisation",
    "location.manual.subtitle": "Si la localisation Ã©choue, choisissez votre ville et nous lâ€™utiliserons pour les rÃ©sultats Ã  proximitÃ©.",
    "location.manual.country": "Pays",
    "location.manual.region": "RÃ©gion",
    "location.manual.city": "Ville",
    "location.manual.use": "Utiliser la localisation sÃ©lectionnÃ©e",
    "location.manual.toast.title": "Choisissez une ville",
    "location.manual.toast.description": "Choisissez un pays, une rÃ©gion et une ville pour dÃ©finir votre localisation manuellement.",
    "location.manual.noGps.title": "Ville sans coordonnÃ©es GPS",
    "location.manual.noGps.description": "Veuillez choisir une autre ville ou activer la localisation de lâ€™appareil.",
    "location.retry": "RÃ©essayer la localisation",

    "wallet.title": "Mon portefeuille",
    "wallet.availableBalance": "Solde disponible",
    "wallet.deposited": "DÃ©posÃ©",
    "wallet.spent": "DÃ©pensÃ©",
    "wallet.sendHint": "Envoyez des crÃ©dits instantanÃ©ment via nom dâ€™utilisateur, tÃ©lÃ©phone ou QR code â€” gratuit !",
    "wallet.saveWalletSuffix": "pour sauvegarder votre portefeuille",
    "wallet.deposit": "DÃ©poser",
    "wallet.depositAmount": "Montant",
    "wallet.depositSuccess": "DÃ©pÃ´t effectuÃ©",
    "wallet.depositSuccessDetail": "Votre portefeuille a Ã©tÃ© crÃ©ditÃ©.",
    "wallet.depositFailed": "Ã‰chec du dÃ©pÃ´t",

    "vault.title": "Mon coffre",
    "vault.totalGold": "Or total",
    "vault.units": "UnitÃ©s dâ€™or",
    "vault.signInToAccess": "Connectez-vous pour accÃ©der Ã  votre coffre dâ€™or virtuel.",
    "vault.description": "StockÃ© dans votre coffre dâ€™or virtuel (livraison maintenant ou plus tard).",
    "vault.noUnits": "Aucune unitÃ© dâ€™or pour le moment.",
    "vault.status": "Statut",
    "vault.locked": "VERROUILLÃ‰",
    "vault.available": "DISPONIBLE",
    "vault.lockupEnds": "Fin du verrouillage",
    "vault.buyUnits": "Acheter des unitÃ©s dâ€™or",
    "vault.buyUnitsDescription": "Choisissez une unitÃ© standard (en grammes) puis confirmez lâ€™achat.",
    "vault.unitSize": "Taille de lâ€™unitÃ©",
    "vault.deliveryChoice": "Livraison",
    "vault.storeInVault": "Stocker au coffre",
    "vault.deliveryNow": "Livrer maintenant",
    "vault.lockupLabel": "Ne pas livrer avant",
    "vault.lockupHelp": "Optionnel : bloque la livraison jusquâ€™Ã  cette date.",
    "vault.confirmPurchase": "Confirmer lâ€™achat",
    "vault.pricingAtPurchase": "Le prix est fixÃ© au moment de lâ€™achat (snapshot).",
    "vault.purchaseSuccess": "Achat confirmÃ©",
    "vault.purchaseSuccessDetail": "Votre unitÃ© dâ€™or a Ã©tÃ© ajoutÃ©e Ã  votre coffre.",
    "vault.purchaseFailed": "Ã‰chec de lâ€™achat",
    "vault.requestDelivery": "Demander la livraison",
    "vault.deliveryRequested": "Livraison demandÃ©e",
    "vault.deliveryRequestedDetail": "Votre demande a Ã©tÃ© enregistrÃ©e.",
    "vault.deliveryRequestFailed": "Ã‰chec de la demande de livraison",
    "vault.authorizeResale": "Autoriser la revente",
    "vault.resaleAuthorized": "Revente autorisÃ©e",
    "vault.resaleAuthorizedDetail": "Vous pouvez maintenant crÃ©er une annonce sur le marchÃ© secondaire.",
    "vault.resaleAuthorizeFailed": "Ã‰chec de lâ€™autorisation de revente",
    "vault.listForResale": "Mettre en vente",
    "vault.listingCreated": "Annonce crÃ©Ã©e",
    "vault.listingCreatedDetail": "Votre unitÃ© est listÃ©e pour les clients confirmÃ©s.",
    "vault.listingCreateFailed": "Ã‰chec de crÃ©ation dâ€™annonce",

    "secondaryMarket.title": "MarchÃ© secondaire",
    "secondaryMarket.description": "RÃ©servÃ© aux clients confirmÃ©s. Les achats se rÃ¨glent via le portefeuille.",
    "secondaryMarket.restricted": "AccÃ¨s rÃ©servÃ© aux clients confirmÃ©s.",
    "secondaryMarket.empty": "Aucune annonce pour le moment.",
    "secondaryMarket.listing": "Annonce",
    "secondaryMarket.visibleToConfirmed": "Visible uniquement aux clients confirmÃ©s",
    "secondaryMarket.buy": "Acheter",
    "secondaryMarket.purchaseSuccess": "Achat rÃ©ussi",
    "secondaryMarket.purchaseSuccessDetail": "Lâ€™unitÃ© a Ã©tÃ© transfÃ©rÃ©e dans votre coffre.",
    "secondaryMarket.purchaseFailed": "Ã‰chec de lâ€™achat",

    "badge.bureauAchat": "Bureau d'Achat",
    "badge.govLicensed": "Licence gouvernementale",
    "badge.assayerVerified": "V\u00e9rifi\u00e9 par essayeur",
    "badge.lbmaCustody": "Cha\u00eene de tra\u00e7abilit\u00e9",

    "certifications.title": "Certifications",
    "trading.title": "Commerce de l'or",
    "trading.subtitle": "Dor\u00e9 & Or estamp\u00e9",

    "price.perGram": "/g",
    "price.perOz": "/oz",

    "ticker.lbmaGold": "OR SPOT",
    "ticker.localPremium": "prime locale",
    "ticker.coteIvoire": "C\u00d4TE D'IVOIRE",
  },
  ar: {
    "feed.aroundYou.title": "Ù‚Ø±ÙŠØ¨ Ù…Ù†Ùƒ Ø§Ù„Ø¢Ù†",
    "feed.aroundYou.subtitle": "Ø§ÙƒØªØ´Ø§ÙØ§Øª Ø¬Ø¯ÙŠØ¯Ø© Ø¨Ø§Ù„Ù‚Ø±Ø¨ Ù…Ù†Ùƒ",
    "feed.popular.title": "Ø£ÙØ¶Ù„ Ø§Ù„Ø§Ø®ØªÙŠØ§Ø±Ø§Øª Ù…Ù† Ø§Ù„Ù…ØªØ§Ø¬Ø± Ø§Ù„Ù‚Ø±ÙŠØ¨Ø©",
    "feed.popular.subtitle": "Ø´Ø§Ø¦Ø¹ Ù„Ø¯Ù‰ Ø§Ù„Ù…Ø­Ù„ÙŠÙŠÙ†",

    "sections.doreLots.title": "Ø¯ÙØ¹Ø§Øª Ø¯ÙˆØ±ÙŠÙ‡",
    "sections.doreLots.subtitle": "Ù…ÙˆØ±Ù‘Ø¯Ø© Ù…Ù† Ø¬Ù‡Ø§Øª Ù…Ø±Ø®Ù‘ØµØ©ØŒ ÙˆÙ…Ø¨Ø§Ø¹Ø© Ø¹Ø¨Ø± Bourse de lâ€™Or",
    "sections.stamped.title": "Ø³Ø¨Ø§Ø¦Ùƒ Ù…Ø®ØªÙˆÙ…Ø© (10Øº+)",
    "sections.stamped.subtitle": "وحدات ذهب مختومة، معتمدة ومختومة",
    "sections.jewelry.title": "Ù…Ø¬ÙˆÙ‡Ø±Ø§Øª",
    "sections.jewelry.subtitle": "Ù…Ø¬ÙˆÙ‡Ø±Ø§Øª Ù…Ø®ØªØ§Ø±Ø© Ù…Ù† ØµÙÙ†Ù‘Ø§Ø¹ Ù…ÙˆØ«ÙˆÙ‚ÙŠÙ†",
    "sections.goldArt.title": "Ù‚Ø·Ø¹ ÙÙ†ÙŠØ© Ø°Ù‡Ø¨ÙŠØ©",
    "sections.goldArt.subtitle": "Ù‚Ø·Ø¹ ÙÙ†ÙŠØ© ÙˆÙ…Ù‚ØªÙ†ÙŠØ§Øª Ù„Ù„Ø¬Ø§Ù…Ø¹ÙŠÙ†",

    "cart.subtotal": "Ø§Ù„Ù…Ø¬Ù…ÙˆØ¹ Ø§Ù„ÙØ±Ø¹ÙŠ",
    "cart.delivery": "Ø§Ù„ØªÙˆØµÙŠÙ„",

    "units.month": "Ø´Ù‡Ø±",
    "units.months": "Ø£Ø´Ù‡Ø±",
    "units.year": "Ø³Ù†Ø©",
    "units.years": "Ø³Ù†ÙˆØ§Øª",
    "units.kg": "ÙƒØº",
    "units.kgPerMonth": "ÙƒØº/Ø´Ù‡Ø±",

    "investments.subtitle": "Ù…Ù†Ø§Ø¬Ù… Ù…ÙˆØ«Ù‘Ù‚Ø© â€” Ù…Ø´Ø§Ø±ÙƒØ© ÙÙŠ Ø§Ù„Ø¥Ù†ØªØ§Ø¬",
    "investments.searchPlaceholder": "Ø§Ø¨Ø­Ø« Ø¹Ù† ÙØ±Øµâ€¦",
    "investments.listMine": "Ø£Ø¯Ø±Ø¬ Ù…Ù†Ø¬Ù…Ùƒ",
    "investments.empty": "Ù„Ø§ ØªÙˆØ¬Ø¯ ÙØ±Øµ ØªØ·Ø§Ø¨Ù‚ Ø¹ÙˆØ§Ù…Ù„ Ø§Ù„ØªØµÙÙŠØ©.",
    "investments.badge.verifiedMine": "Ù…Ù†Ø¬Ù… Ù…Ø±Ø®Ù‘Øµ (Ù…ÙˆØ«Ù‘Ù‚)",
    "investments.snapshot.title": "Ù…Ù„Ø®Ù‘Øµ Ø§Ù„Ù…Ù†Ø¬Ù…",
    "investments.field.licenseActiveSince": "Ø§Ù„Ø±Ø®ØµØ© Ø³Ø§Ø±ÙŠØ© Ù…Ù†Ø°",
    "investments.field.currentCapacity": "Ø§Ù„Ù‚Ø¯Ø±Ø© Ø§Ù„Ø­Ø§Ù„ÙŠØ©",
    "investments.field.historicalProduction": "Ø§Ù„Ø¥Ù†ØªØ§Ø¬ Ø§Ù„ØªØ§Ø±ÙŠØ®ÙŠ",
    "investments.field.remainingPotential": "Ø§Ù„Ø¥Ù…ÙƒØ§Ù†Ø§Øª Ø§Ù„Ù…ØªØ¨Ù‚ÙŠØ©",
    "investments.field.capitalRequired": "Ø±Ø£Ø³ Ø§Ù„Ù…Ø§Ù„ Ø§Ù„Ù…Ø·Ù„ÙˆØ¨",
    "investments.field.duration": "Ø§Ù„Ù…Ø¯Ø©",
    "investments.historical.totalSuffix": "Ø¥Ø¬Ù…Ø§Ù„ÙŠ",
    "investments.historical.last12m": "Ø¢Ø®Ø± 12 Ø´Ù‡Ø±Ù‹Ø§",
    "investments.atCurrentRate": "Ø¨Ø§Ù„ÙˆØªÙŠØ±Ø© Ø§Ù„Ø­Ø§Ù„ÙŠØ©",
    "investments.potential.low": "Ù…Ù†Ø®ÙØ¶",
    "investments.potential.medium": "Ù…ØªÙˆØ³Ø·",
    "investments.potential.high": "Ù…Ø±ØªÙØ¹",
    "investments.returnModel.rotationIndicative": "Ø§Ù„Ø¹Ø§Ø¦Ø¯ Ù„ÙƒÙ„ Ø¯ÙˆØ±Ø© (ØªÙ‚Ø¯ÙŠØ±ÙŠ)",
    "investments.actions.viewOpportunity": "Ø¹Ø±Ø¶ Ø§Ù„ÙØ±ØµØ©",
    "investments.actions.viewMachinery": "Ø¹Ø±Ø¶ Ø§Ù„Ù…Ø¹Ø¯Ù‘Ø©",

    "cadastre.badgeVerified": "ØªØ­Ù‚Ù‚ Ø§Ù„ÙƒØ§Ø¯Ø³ØªØ±",
    "cadastre.permit": "ØªØ±Ø®ÙŠØµ Ø§Ù„ÙƒØ§Ø¯Ø³ØªØ±",
    "cadastre.permitId": "Ø±Ù‚Ù… Ø§Ù„ØªØ±Ø®ÙŠØµ",
    "cadastre.permitType": "Ù†ÙˆØ¹ Ø§Ù„ØªØ±Ø®ÙŠØµ",
    "cadastre.permitStatus": "Ø­Ø§Ù„Ø© Ø§Ù„ØªØ±Ø®ÙŠØµ",
    "cadastre.commodity": "Ø§Ù„Ù…Ø¹Ø¯Ù†",
    "cadastre.region": "Ø§Ù„Ù…ÙˆÙ‚Ø¹",
    "cadastre.sourceLink": "Ù…ØµØ¯Ø± Ø§Ù„ÙƒØ§Ø¯Ø³ØªØ± Ø§Ù„Ø±Ø³Ù…ÙŠ",
    "cadastre.sectionTitle": "Ù…Ø±Ø¬Ø¹ Ø§Ù„ÙƒØ§Ø¯Ø³ØªØ±",
    "cadastre.missing": "Ù…Ø±Ø¬Ø¹ Ø§Ù„ÙƒØ§Ø¯Ø³ØªØ± Ù…ÙÙ‚ÙˆØ¯ â€” Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø¹Ø±Ø¶ Ø§Ù„ÙØ±ØµØ©.",
    "cadastre.unavailable": "Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„ÙƒØ§Ø¯Ø³ØªØ± ØºÙŠØ± Ù…ØªØ§Ø­Ø© Ù„Ù‡Ø°Ø§ Ø§Ù„Ø¨Ù„Ø¯. ØªÙ… ØªØ¹Ø·ÙŠÙ„ Ø§Ù„Ø§Ø³ØªØ«Ù…Ø§Ø±.",
    "cadastre.claimCta": "Ø§Ø·Ù„Ø¨ ØªØ±Ø®ÙŠØµ ÙƒØ§Ø¯Ø³ØªØ±",
    "cadastre.claimTitle": "Ø§Ø·Ù„Ø¨ ØªØ±Ø®ÙŠØµ ÙƒØ§Ø¯Ø³ØªØ±",
    "cadastre.claimDescription": "Ø§Ø®ØªØ± ØªØ±Ø®ÙŠØµØ§Ù‹ Ù…Ù† Ø§Ù„ÙƒØ§Ø¯Ø³ØªØ± Ø§Ù„Ø±Ø³Ù…ÙŠ. Ù„Ø§ Ø¥Ø¯Ø®Ø§Ù„ ÙŠØ¯ÙˆÙŠ Ù„Ù„Ù…Ù†Ø§Ø¬Ù….",
    "cadastre.claimRule": "ÙŠØ¬Ø¨ Ø£Ù† ØªÙƒÙˆÙ† Ø§Ù„ØªØ±Ø§Ø®ÙŠØµ Ù…ÙˆØ¬ÙˆØ¯Ø© ÙÙŠ Ø§Ù„ÙƒØ§Ø¯Ø³ØªØ± Ø§Ù„Ø±Ø³Ù…ÙŠ. Ø¨Ø¯ÙˆÙ† Ù…Ø±Ø¬Ø¹ = Ù„Ø§ Ø¹Ø±Ø¶ ÙˆÙ„Ø§ Ø¯Ø±Ø¯Ø´Ø© ÙˆÙ„Ø§ Ø§Ø³ØªØ«Ù…Ø§Ø±.",
    "cadastre.searchPlaceholder": "Ø§Ø¨Ø­Ø« Ø¨Ø±Ù‚Ù… Ø§Ù„ØªØ±Ø®ÙŠØµ Ø£Ùˆ Ø§Ø³Ù… Ø§Ù„Ù…Ø§Ù„Ùƒ Ø£Ùˆ Ø§Ù„Ù…Ù†Ø·Ù‚Ø©",
    "cadastre.allCountries": "Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø¯ÙˆÙ„ (Ø§Ù„ÙƒØ§Ø¯Ø³ØªØ±)",
    "cadastre.noResults": "Ù„Ø§ ØªÙˆØ¬Ø¯ ØªØ±Ø§Ø®ÙŠØµ Ù…Ø·Ø§Ø¨Ù‚Ø© Ù„Ù„Ø¨Ø­Ø«.",
    "cadastre.selectedPermit": "Ø§Ù„ØªØ±Ø®ÙŠØµ Ø§Ù„Ù…Ø®ØªØ§Ø±",
    "cadastre.proofLabel": "Ø¥Ø«Ø¨Ø§Øª Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ©",
    "cadastre.proofSelected": "ØªÙ… Ø§Ù„Ø§Ø®ØªÙŠØ§Ø±: {file}",
    "cadastre.claimNote": "Ù…Ù„Ø§Ø­Ø¸Ø© Ø§Ù„Ø·Ù„Ø¨ (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)",
    "cadastre.claimNotePlaceholder": "Ø£Ø¶Ù Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø§Ù„ØªØ­Ù‚Ù‚â€¦",
    "cadastre.selectPrompt": "Ø§Ø®ØªØ± ØªØ±Ø®ÙŠØµ ÙƒØ§Ø¯Ø³ØªØ± Ø£ÙˆÙ„Ø§Ù‹.",
    "cadastre.proofRequired": "Ø¥Ø«Ø¨Ø§Øª Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ© Ù…Ø·Ù„ÙˆØ¨.",
    "cadastre.claimSubmit": "Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø·Ù„Ø¨",
    "cadastre.claimSubmitted": "ØªÙ… Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø·Ù„Ø¨",
    "cadastre.claimSubmittedDesc": "Ø³ØªØªÙ… Ù…Ø±Ø§Ø¬Ø¹Ø© Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª Ù‚Ø¨Ù„ Ø§Ù„ØªÙØ¹ÙŠÙ„.",
    "cadastre.claimRequired": "Ù…Ø·Ù„ÙˆØ¨ Ù…Ø·Ø§Ù„Ø¨Ø© Ø§Ù„ÙƒØ§Ø¯Ø³ØªØ±",

    "machinery.category.extraction": "Ø§Ø³ØªØ®Ø±Ø§Ø¬",
    "machinery.category.processing": "Ù…Ø¹Ø§Ù„Ø¬Ø©",
    "machinery.category.support": "Ø¯Ø¹Ù…",
    "machinery.category.mobility": "ØªÙ†Ù‚Ù‘Ù„",
    "machinery.category.spare_parts": "Ù‚Ø·Ø¹ ØºÙŠØ§Ø±",
    "machinery.condition.new": "Ø¬Ø¯ÙŠØ¯",
    "machinery.condition.refurbished": "Ù…Ø¬Ø¯Ù‘Ø¯",
    "machinery.condition.used": "Ù…Ø³ØªØ¹Ù…Ù„",
    "machinery.status.in_stock": "Ù…ØªÙˆÙØ±",
    "machinery.status.built_to_order": "Ø­Ø³Ø¨ Ø§Ù„Ø·Ù„Ø¨",
    "machinery.status.used": "Ù…Ø³ØªØ¹Ù…Ù„",
    "machinery.status.reserved": "Ù…Ø­Ø¬ÙˆØ²",
    "machinery.status.unavailable": "ØºÙŠØ± Ù…ØªÙˆÙØ±",
    "seller.type.manufacturer": "Ù…ØµÙ†Ù‘Ø¹",
    "seller.type.authorized_representative": "Ù…Ù…Ø«Ù„ Ù…Ø¹ØªÙ…Ø¯",
    "seller.type.owner_resale": "Ø¥Ø¹Ø§Ø¯Ø© Ø¨ÙŠØ¹ Ø§Ù„Ù…Ø§Ù„Ùƒ (Ù…Ø³ØªØ¹Ù…Ù„)",
    "machinery.soldBy": "ÙŠØ¨Ø§Ø¹ Ø¨ÙˆØ§Ø³Ø·Ø©:",
    "machinery.financingAvailable": "ØªÙ…ÙˆÙŠÙ„ Ù…ØªØ§Ø­",
    "machinery.requestFinancing": "Ø·Ù„Ø¨ ØªÙ…ÙˆÙŠÙ„",
    "machinery.toast.buyRequestTitle": "Ø·Ù„Ø¨ Ø´Ø±Ø§Ø¡",
    "machinery.toast.buyRequestDescription": "ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø·Ù„Ø¨ Ø´Ø±Ø§Ø¡.",
    "machinery.toast.financingRequestTitle": "Ø·Ù„Ø¨ ØªÙ…ÙˆÙŠÙ„",
    "machinery.toast.financingRequestDescription": "Ø³Ù†ØªÙˆØ§ØµÙ„ Ù…Ø¹Ùƒ Ù‚Ø±ÙŠØ¨Ù‹Ø§.",
    "machinery.toast.deployTitle": "Ù†Ø´Ø±",
    "machinery.toast.deployDescription": "Ù…ÙŠØ²Ø© Ø§Ù„Ù†Ø´Ø± Ù‚Ø§Ø¯Ù…Ø© Ù‚Ø±ÙŠØ¨Ù‹Ø§.",

    "product.sellerType.wholesaleSupplier": "Ù…ÙˆØ±Ù‘Ø¯ Ø¯ÙˆØ±ÙŠÙ‡ (Ø¬Ù…Ù„Ø©)",
    "product.sellerType.jewelryManufacturer": "Ù…ØµÙ†Ù‘Ø¹ Ù…Ø¬ÙˆÙ‡Ø±Ø§Øª",
    "product.sellerType.retailSeller": "Ø¨Ø§Ø¦Ø¹ Ø°Ù‡Ø¨ (ØªØ¬Ø²Ø¦Ø©)",
    "product.pricing.lbma": "ØªØ³Ø¹ÙŠØ± Ù…Ø±Ø¬Ø¹ÙŠ LBMA",
    "product.pricing.curated": "ØªØ³Ø¹ÙŠØ± Ù…Ø´ØºÙ„ Ù…Ø®ØªØ§Ø±",
    "product.certificationsCompliance": "Ø§Ù„Ø´Ù‡Ø§Ø¯Ø§Øª ÙˆØ§Ù„Ø§Ù…ØªØ«Ø§Ù„",
    "product.favorites.savedTitle": "ØªÙ…Øª Ø§Ù„Ø¥Ø¶Ø§ÙØ© Ø¥Ù„Ù‰ Ø§Ù„Ù…ÙØ¶Ù„Ø©",
    "product.favorites.savedDescription": "ØªÙ…Øª Ø§Ù„Ø¥Ø¶Ø§ÙØ© Ø¥Ù„Ù‰ Ù…ÙØ¶Ù‘Ù„ØªÙƒ",
    "product.addedToOrder": "ØªÙ…Øª Ø§Ù„Ø¥Ø¶Ø§ÙØ© Ø¥Ù„Ù‰ Ø§Ù„Ø·Ù„Ø¨",
    "header.title": "Bourse de lâ€™Or",
    "header.subtitle": "\u0645\u0646\u0635\u0629 \u0633\u0648\u0642 \u0627\u0644\u0630\u0647\u0628",
    "header.suppliers": "\u0645\u0648\u0631\u0651\u062f\u0648 \u0627\u0644\u0630\u0647\u0628",
    "header.certified": "\u0645\u0643\u062a\u0628 \u0634\u0631\u0627\u0621 \u0645\u0639\u062a\u0645\u062f",
    "header.availableGold": "\u0627\u0644\u0630\u0647\u0628 \u0627\u0644\u0645\u062a\u0627\u062d",

    "mode.retail": "Marketplace",
    "mode.wholesale": "\u062c\u0645\u0644\u0629",

    "wholesale.preview.title": "\u0645\u0639\u0627\u064a\u0646\u0629 \u0627\u0644\u062c\u0645\u0644\u0629 (\u0648\u0635\u0648\u0644 \u0645\u064f\u062a\u062d\u0643\u0651\u0645)",
    "wholesale.preview.subtitle": "\u0642\u062f\u0651\u0645 \u0637\u0644\u0628\u064b\u0627 \u0644\u0641\u062a\u062d \u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0627\u0644\u062c\u0647\u0627\u062a \u0627\u0644\u0645\u0631\u062e\u0651\u0635\u0629",
    "wholesale.apply.cta": "\u062a\u0642\u062f\u064a\u0645 \u0637\u0644\u0628 \u0644\u062a\u0635\u0628\u062d \u0634\u0631\u064a\u0643\u064b\u0627 \u0645\u0639\u062a\u0645\u062f\u064b\u0627",
    "wholesale.apply.continueRetail": "\u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0629 \u0641\u064a \u0648\u0636\u0639 \u0627\u0644\u0633\u0648\u0642",

    "product.dore": "\u062f\u0648\u0631\u064a\u0647",
    "product.refined": "\u0645\u0643\u0631\u0651\u0631",
    "product.22k": "22K",
    "product.18k": "18K",
    "product.available": "\u0645\u062a\u0627\u062d",
    "product.sold": "\u0645\u0628\u0627\u0639",
    "product.soldOut": "\u0646\u0641\u062f\u062a \u0627\u0644\u0643\u0645\u064a\u0629",
    "product.purity.dore": "\u062f\u0648\u0631\u064a\u0647 (\u0630\u0647\u0628 \u062e\u0627\u0645) | \u062d\u0633\u0628 \u0627\u0644\u062a\u062d\u0644\u064a\u0644",
    "product.purity.22k": "\u0630\u0647\u0628 \u0645\u062e\u062a\u0648\u0645 | \u0648\u062d\u062f\u0627\u062a 22K \u0645\u062d\u0643\u0645\u0629",
    "product.purity.18k": "\u0630\u0647\u0628 \u0645\u062e\u062a\u0648\u0645 | \u0648\u062d\u062f\u0627\u062a 18K \u0645\u062d\u0643\u0645\u0629",
    "product.lbmaRef": "\u0645\u0631\u062c\u0639:",
    "product.vsLbma": "\u0645\u0642\u0627\u0631\u0646\u0629 \u0628\u0627\u0644\u0645\u0631\u062c\u0639",

    "productDetails.section.descriptionTitle": "\u0627\u0644\u0648\u0635\u0641",
    "productDetails.section.complianceTitle": "\u0627\u0644\u0627\u0645\u062a\u062b\u0627\u0644",
    "productDetails.section.deliveryTitle": "\u0627\u0644\u062a\u0648\u0635\u064a\u0644",
    "productDetails.descriptionFallback": "{product} \u0628\u062c\u0648\u062f\u0629 \u0645\u0645\u062a\u0627\u0632\u0629\u060c \u0645\u0635\u062f\u0631\u0647 \u0645\u0628\u0627\u0634\u0631\u0629 \u0645\u0646 {shop}.",
    "productDetails.complianceBody": "\u0633\u062c\u0644\u0627\u062a \u0645\u0648\u062b\u0651\u0642\u0629 \u0644\u0644\u0645\u0635\u062f\u0631 \u0648\u0627\u0644\u062d\u064a\u0627\u0632\u0629 \u0648\u0627\u0644\u0634\u0647\u0627\u062f\u0627\u062a \u0645\u062a\u0627\u062d\u0629 \u0639\u0646\u062f \u0627\u0644\u0637\u0644\u0628.",
    "productDetails.deliveryBody": "\u064a\u062a\u0645 \u062a\u0623\u0643\u064a\u062f \u062c\u062f\u0648\u0644 \u0627\u0644\u062a\u0648\u0635\u064a\u0644 \u0648\u062a\u0633\u0644\u064a\u0645 \u0627\u0644\u062d\u064a\u0627\u0632\u0629 \u0639\u0646\u062f \u0625\u062a\u0645\u0627\u0645 \u0627\u0644\u0634\u0631\u0627\u0621.",

    "button.add": "\u0625\u0636\u0627\u0641\u0629",
    "button.addToOrder": "\u0625\u0636\u0627\u0641\u0629 \u0644\u0644\u0637\u0644\u0628",
    "button.viewProducts": "\u0639\u0631\u0636 \u0643\u0644 \u0627\u0644\u0645\u0646\u062a\u062c\u0627\u062a",
    "button.viewProducer": "\u0639\u0631\u0636 \u0627\u0644\u0645\u064f\u0646\u062a\u062c",

    "cart.title": "\u0637\u0644\u0628\u0643",
    "cart.empty": "\u0627\u0644\u0633\u0644\u0629 \u0641\u0627\u0631\u063a\u0629",
    "cart.total": "\u0627\u0644\u0645\u062c\u0645\u0648\u0639",
    "cart.checkout": "\u0625\u062a\u0645\u0627\u0645 \u0627\u0644\u0634\u0631\u0627\u0621",
    "cart.toast.updatedTitle": "\u062a\u0645 \u062a\u062d\u062f\u064a\u062b \u0627\u0644\u0633\u0644\u0629",
    "cart.toast.quantityIncreased": "\u062a\u0645 \u0632\u064a\u0627\u062f\u0629 \u0627\u0644\u0643\u0645\u064a\u0629 \u0644\u0640 {product}",
    "cart.toast.couldNotAddTitle": "\u062a\u0639\u0630\u0631 \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0639\u0646\u0635\u0631",
    "cart.toast.couldNotAddDescription": "\u0647\u0630\u0627 \u0627\u0644\u0645\u0646\u062a\u062c \u063a\u064a\u0631 \u0645\u062a\u0627\u062d \u062d\u0627\u0644\u064a\u064b\u0627. \u062d\u0627\u0648\u0644 \u0627\u062e\u062a\u064a\u0627\u0631\u0647 \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629.",
    "cart.toast.addedTitle": "\u062a\u0645\u062a \u0627\u0644\u0625\u0636\u0627\u0641\u0629 \u0625\u0644\u0649 \u0627\u0644\u0633\u0644\u0629",
    "cart.toast.addedDescription": "\u062a\u0645\u062a \u0625\u0636\u0627\u0641\u0629 {product} \u0625\u0644\u0649 \u0633\u0644\u062a\u0643",
    "cart.toast.couldNotOpenTitle": "\u062a\u0639\u0630\u0631 \u0641\u062a\u062d \u0627\u0644\u0645\u0646\u062a\u062c",
    "cart.toast.couldNotOpenDescription": "\u064a\u0631\u062c\u0649 \u0627\u062e\u062a\u064a\u0627\u0631 \u0645\u0646\u062a\u062c \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0644\u0639\u0631\u0636 \u0627\u0644\u062a\u0641\u0627\u0635\u064a\u0644.",

    "chat.welcome": "Ù…Ø§Ø°Ø§ ØªØ¨Ø­Ø« Ø¹Ù†Ù‡ØŸ",
    "chat.continueToConcierge": "\u0645\u062a\u0627\u0628\u0639\u0629 \u0625\u0644\u0649 \u0627\u0644\u0645\u0633\u0627\u0639\u062f",
    "chat.openConcierge": "\u0641\u062a\u062d \u0627\u0644\u0645\u0633\u0627\u0639\u062f",
    "chat.goldOnlyLabel": "\u0630\u0647\u0628 \u0641\u0642\u0637",
    "chat.placeholder": "Ø§Ø³Ø£Ù„ Ø£ÙŠ Ø´ÙŠØ¡ Ø¹Ù† Ø§Ù„Ø°Ù‡Ø¨...",
    "chat.placeholderFull": "Ø§Ø³Ø£Ù„ Ø£ÙŠ Ø´ÙŠØ¡ Ø¹Ù† Ø§Ù„Ø°Ù‡Ø¨...",

    "settings.language": "\u0627\u0644\u0644\u063a\u0629",
    "settings.currency": "\u0627\u0644\u0639\u0645\u0644\u0629",

    "nav.marketplace": "\u0627\u0644\u0633\u0648\u0642",
    "nav.dore": "\u062f\u0648\u0631\u064a\u0647",
    "nav.machinery": "\u0645\u0639\u062f\u0627\u062a \u0627\u0644\u062a\u0639\u062f\u064a\u0646",
    "nav.investments": "\u0641\u0631\u0635 \u0627\u0644\u0627\u0633\u062a\u062b\u0645\u0627\u0631",
    "nav.account": "\u0627\u0644\u062d\u0633\u0627\u0628",
    "nav.orders": "\u0627\u0644\u0637\u0644\u0628\u0627\u062a",
    "nav.contracts": "\u0627\u0644\u0639\u0642\u0648\u062f",
    "nav.map": "\u0627\u0644\u062e\u0631\u064a\u0637\u0629",
    "nav.wallet": "\u0627\u0644\u0645\u062d\u0641\u0638\u0629",
    "nav.vault": "\u0627\u0644\u062e\u0632\u0646\u0629",
    "account.deliveryDashboard": "\u0644\u0648\u062d\u0629 \u0627\u0644\u062a\u062d\u0643\u0645 \u0628\u0627\u0644\u062a\u0633\u0644\u064a\u0645",
    "account.adminConsole": "\u0644\u0648\u062d\u0629 \u0627\u0644\u0625\u062f\u0627\u0631\u0629",
    "account.signInToAccessOrdersAndWallet": "\u0633\u062c\u0651\u0644 \u0627\u0644\u062f\u062e\u0648\u0644 \u0644\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0637\u0644\u0628\u0627\u062a\u0643 \u0648\u0645\u062d\u0641\u0638\u062a\u0643.",

    "chat.placeholderWholesalePreviewMobile": "Ø§Ø³Ø£Ù„ Ø£ÙŠ Ø´ÙŠØ¡ Ø¹Ù† Ø§Ù„Ø°Ù‡Ø¨...",
    "chat.placeholderWholesalePreview": "Ø§Ø³Ø£Ù„ Ø£ÙŠ Ø´ÙŠØ¡ Ø¹Ù† Ø§Ù„Ø°Ù‡Ø¨...",
    "chat.placeholderWholesaleMobile": "Ø§Ø³Ø£Ù„ Ø£ÙŠ Ø´ÙŠØ¡ Ø¹Ù† Ø§Ù„Ø°Ù‡Ø¨...",
    "chat.placeholderWholesale": "Ø§Ø³Ø£Ù„ Ø£ÙŠ Ø´ÙŠØ¡ Ø¹Ù† Ø§Ù„Ø°Ù‡Ø¨...",
    "chat.failedToGetResponse": "ØªØ¹Ø°Ø± Ø§Ù„Ø­ØµÙˆÙ„ Ø¹Ù„Ù‰ Ø±Ø¯",

    "assistantDock.title": "Ù…Ø³Ø§Ø¹Ø¯ Ø§Ù„Ø±Ø¦ÙŠØ³",
    "assistantDock.allCompanies": "ÙƒÙ„ Ø§Ù„Ø´Ø±ÙƒØ§Øª",
    "assistantDock.thinking": "ØªÙÙƒÙŠØ±",
    "assistantDock.voiceResponseReady.title": "Ø§Ù„Ø±Ø¯ Ø§Ù„ØµÙˆØªÙŠ Ø¬Ø§Ù‡Ø²",
    "assistantDock.voiceResponseReady.description": "Ø§Ù†Ù‚Ø± Ø¹Ù„Ù‰ Ø£ÙŠÙ‚ÙˆÙ†Ø© Ø§Ù„ØµÙˆØª Ù„ØªÙØ¹ÙŠÙ„ Ø§Ù„ØªØ´ØºÙŠÙ„ Ø§Ù„ØµÙˆØªÙŠ",
    "assistantDock.conversationSummary": "Ù…Ù„Ø®Øµ Ø§Ù„Ù…Ø­Ø§Ø¯Ø«Ø©",
    "assistantDock.keyDecisions": "Ø§Ù„Ù‚Ø±Ø§Ø±Ø§Øª Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠØ©:",
    "assistantDock.actionItems": "Ø¹Ù†Ø§ØµØ± Ø§Ù„Ø¹Ù…Ù„:",
    "assistantDock.loadOlder": "ØªØ­Ù…ÙŠÙ„ Ø±Ø³Ø§Ø¦Ù„ Ø£Ù‚Ø¯Ù…",
    "assistantDock.emptyTitle": "Ù…Ø³Ø§Ø¹Ø¯Ùƒ Ø§Ù„Ø§Ø³ØªØ±Ø§ØªÙŠØ¬ÙŠ",
    "assistantDock.emptyDescription": "Ø£ØªØ°ÙƒØ± Ù…Ø­Ø§Ø¯Ø«Ø§ØªÙ†Ø§ ÙˆØ£ØªØ¹Ù„Ù… Ù…Ù† Ø§Ù„Ù‚Ø±Ø§Ø±Ø§Øª Ø§Ù„Ø³Ø§Ø¨Ù‚Ø©. Ø§Ø³Ø£Ù„Ù†ÙŠ Ø£ÙŠ Ø´ÙŠØ¡!",
    "assistantDock.viewThinkingProcess": "Ø¹Ø±Ø¶ Ø·Ø±ÙŠÙ‚Ø© Ø§Ù„ØªÙÙƒÙŠØ±",
    "assistantDock.internalReasoning": "Ø§Ù„Ù…Ù†Ø·Ù‚ Ø§Ù„Ø¯Ø§Ø®Ù„ÙŠ",
    "assistantDock.jumpToLatest": "Ø§Ù„Ø§Ù†ØªÙ‚Ø§Ù„ Ø¥Ù„Ù‰ Ø§Ù„Ø£Ø­Ø¯Ø«",
    "assistantDock.placeholder": "Ø§Ø³Ø£Ù„ Ù…Ø³Ø§Ø¹Ø¯Ùƒ...",
    "assistantDock.historicalNote": "Ù…Ø­Ø§Ø¯Ø«Ø© Ø³Ø§Ø¨Ù‚Ø©. Ø¹Ø¯ Ø¥Ù„Ù‰ Ø¬Ù„Ø³Ø© Ø§Ù„ÙŠÙˆÙ… Ù„Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø±Ø³Ø§Ø¦Ù„.",
    "assistantDock.failedToSend": "ØªØ¹Ø°Ø± Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø±Ø³Ø§Ù„Ø©",

    "common.close": "\u0625\u063a\u0644\u0627\u0642",
    "common.cancel": "\u0625\u0644\u063a\u0627\u0621",
    "common.signIn": "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644",
    "common.createAccount": "\u0625\u0646\u0634\u0627\u0621 \u062d\u0633\u0627\u0628",
    "common.signOut": "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062e\u0631\u0648\u062c",
    "common.notNow": "\u0644\u064a\u0633 \u0627\u0644\u0622\u0646",
    "common.select": "\u0627\u062e\u062a\u0631...",
    "common.error": "\u062e\u0637\u0623",
    "common.loading": "\u062c\u0627\u0631 \u0627\u0644\u062a\u062d\u0645\u064a\u0644...",
    "common.guest": "\u0636\u064a\u0641",
    "common.menu": "\u0627\u0644\u0642\u0627\u0626\u0645\u0629",
    "common.settings": "\u0627\u0644\u0625\u0639\u062f\u0627\u062f\u0627\u062a",
    "common.all": "\u0627\u0644\u0643\u0644",
    "common.allCategories": "\u0643\u0644 \u0627\u0644\u0641\u0626\u0627\u062a",
    "common.browse": "\u062a\u0635\u0641\u062d",
    "common.continueBrowsing": "\u0645\u062a\u0627\u0628\u0639\u0629 \u0627\u0644\u062a\u0635\u0641\u062d",
    "common.clear": "\u0645\u0633\u062d",
    "common.clearFilter": "\u0645\u0633\u062d \u0627\u0644\u062a\u0635\u0641\u064a\u0629",
    "common.terms": "\u0627\u0644\u0634\u0631\u0648\u0637",
    "common.privacy": "\u0627\u0644\u062e\u0635\u0648\u0635\u064a\u0629",
    "common.compliance": "\u0627\u0644\u0627\u0645\u062a\u062b\u0627\u0644",
    "common.item": "\u0639\u0646\u0635\u0631",
    "common.items": "\u0639\u0646\u0627\u0635\u0631",
    "common.product": "\u0645\u0646\u062a\u062c",
    "common.products": "\u0645\u0646\u062a\u062c\u0627\u062a",
    "common.seller": "\u0628\u0627\u0626\u0639",
    "common.sellers": "\u0628\u0627\u0626\u0639\u0648\u0646",
    "common.categories": "\u0627\u0644\u0641\u0626\u0627\u062a",
    "common.back": "\u0631\u062c\u0648\u0639",
    "common.continue": "\u0645\u062a\u0627\u0628\u0639\u0629",
    "common.skip": "\u062a\u062e\u0637\u064a",
    "common.submit": "\u0625\u0631\u0633\u0627\u0644",
    "common.submitting": "\u062c\u0627\u0631\u064d \u0627\u0644\u0625\u0631\u0633\u0627\u0644\u2026",
    "common.selectLabel": "\u0627\u062e\u062a\u0631",
    "common.remove": "\u0625\u0632\u0627\u0644\u0629",
    "common.noFileSelected": "\u0644\u0645 \u064a\u062a\u0645 \u0627\u062e\u062a\u064a\u0627\u0631 \u0645\u0644\u0641",
    "common.required": "\u0645\u0637\u0644\u0648\u0628",
    "common.optional": "\u0627\u062e\u062a\u064a\u0627\u0631\u064a",
    "common.updated": "\u062a\u0645 \u0627\u0644\u062a\u062d\u062f\u064a\u062b",
    "common.view": "\u0639\u0631\u0636",
    "common.viewDetails": "\u0639\u0631\u0636 \u0627\u0644\u062a\u0641\u0627\u0635\u064a\u0644",
    "common.viewCatalog": "\u0639\u0631\u0636 \u0627\u0644\u0643\u062a\u0627\u0644\u0648\u062c",
    "common.contactWhatsapp": "\u062a\u0648\u0627\u0635\u0644 (\u0648\u0627\u062a\u0633\u0627\u0628)",
    "common.deploy": "\u0646\u0634\u0631",

    "wizard.toast.checkStepTitle": "\u062a\u062d\u0642\u0642 \u0645\u0646 \u0647\u0630\u0647 \u0627\u0644\u062e\u0637\u0648\u0629",
    "wizard.toast.submittedTitle": "\u062a\u0645 \u0627\u0644\u0625\u0631\u0633\u0627\u0644",
    "wizard.toast.submittedDescription": "\u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0637\u0644\u0628\u0643 \u0628\u0646\u062c\u0627\u062d.",
    "wizard.toast.submitFailedTitle": "\u0641\u0634\u0644 \u0627\u0644\u0625\u0631\u0633\u0627\u0644",
    "wizard.error.uploadRequired": "\u064a\u0631\u062c\u0649 \u0631\u0641\u0639 \u0627\u0644\u0645\u0633\u062a\u0646\u062f \u0627\u0644\u0645\u0637\u0644\u0648\u0628.",
    "wizard.error.completeStep": "\u064a\u0631\u062c\u0649 \u0625\u0643\u0645\u0627\u0644 \u0647\u0630\u0647 \u0627\u0644\u062e\u0637\u0648\u0629 \u0642\u0628\u0644 \u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0629.",
    "wizard.error.answerToContinue": "\u064a\u0631\u062c\u0649 \u0627\u0644\u0625\u062c\u0627\u0628\u0629 \u0644\u0644\u0645\u062a\u0627\u0628\u0639\u0629.",
    "wizard.error.selectOptionToContinue": "\u0627\u062e\u062a\u0631 \u062e\u064a\u0627\u0631\u064b\u0627 \u0644\u0644\u0645\u062a\u0627\u0628\u0639\u0629.",
    "wizard.label.uploadedPrefix": "\u062a\u0645 \u0627\u0644\u0631\u0641\u0639:",
    "wizard.label.done": "\u062a\u0645",
    "wizard.file.reuploadWarning": "\u0644\u0642\u062f \u0627\u062e\u062a\u0631\u062a \u0645\u0644\u0641\u064b\u0627 \u0633\u0627\u0628\u0642\u064b\u0627\u060c \u0644\u0643\u0646 \u064a\u062c\u0628 \u0631\u0641\u0639\u0647 \u0645\u062c\u062f\u062f\u064b\u0627 \u0628\u0639\u062f \u0627\u0644\u062a\u062d\u062f\u064a\u062b \u0642\u0628\u0644 \u0627\u0644\u0625\u0631\u0633\u0627\u0644.",

    "auth.verificationRequired": "\u0645\u0637\u0644\u0648\u0628 \u0627\u0644\u062a\u062d\u0642\u0642",
    "auth.signInToAccessExportunity": "\u0633\u062c\u0651\u0644 \u0627\u0644\u062f\u062e\u0648\u0644 \u0644\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 Exportunity",
    "auth.completeVerificationToUnlockExportunity": "\u0623\u0643\u0645\u0644 \u0627\u0644\u062a\u062d\u0642\u0642 \u0627\u0644\u0623\u0633\u0627\u0633\u064a \u0644\u0641\u062a\u062d Exportunity (Marketplace + \u0627\u0644\u0628\u064a\u0639 \u0628\u0627\u0644\u062c\u0645\u0644\u0629).",
    "auth.exportunityRequiresVerifiedAccount": "\u064a\u062a\u0637\u0644\u0628 Exportunity \u062d\u0633\u0627\u0628\u064b\u0627 \u0645\u062a\u062d\u0642\u0642\u064b\u0627 \u0644\u062a\u0635\u0641\u062d \u0627\u0644\u0645\u0646\u0635\u0629 \u0648\u0625\u062c\u0631\u0627\u0621 \u0627\u0644\u0645\u0639\u0627\u0645\u0644\u0627\u062a.",
    "auth.startVerification": "\u0628\u062f\u0621 \u0627\u0644\u062a\u062d\u0642\u0642",
    "auth.signedOutTitle": "\u062a\u0645 \u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062e\u0631\u0648\u062c",
    "auth.signedOutDescription": "\u062a\u0645 \u062a\u0633\u062c\u064a\u0644 \u062e\u0631\u0648\u062c\u0643.",

    "units.km": "\u0643\u0645",

    "pro.space": "\u0645\u0633\u0627\u062d\u0629 \u0627\u0644\u0645\u062d\u062a\u0631\u0641\u064a\u0646",
    "pro.app.title": "\u062a\u0637\u0628\u064a\u0642 \u0627\u0644\u0645\u062d\u062a\u0631\u0641\u064a\u0646",
    "pro.app.scanToOpen": "\u0627\u0645\u0633\u062d \u0644\u0644\u0641\u062a\u062d:",
    "pro.app.qrAlt": "\u0631\u0645\u0632 QR \u0644\u062a\u0637\u0628\u064a\u0642 \u0627\u0644\u0645\u062d\u062a\u0631\u0641\u064a\u0646",

    "buyer.expandTo": "\u0648\u0633\u0651\u0639 \u0625\u0644\u0649",
    "buyer.expandRadius": "\u062a\u0648\u0633\u064a\u0639 \u0627\u0644\u0646\u0637\u0627\u0642",
    "buyer.exploreAll": "\u0639\u0631\u0636 \u0627\u0644\u0643\u0644",
    "buyer.noProducts.titleGold": "\u0644\u0627 \u062a\u0648\u062c\u062f \u0645\u0646\u062a\u062c\u0627\u062a",
    "buyer.noProducts.titleGeneral": "\u0644\u0627 \u062a\u0648\u062c\u062f \u0645\u0646\u062a\u062c\u0627\u062a \u0642\u0631\u064a\u0628\u0629",
    "buyer.noProducts.titleGlobal": "\u0644\u0627 \u062a\u0648\u062c\u062f \u0645\u0646\u062a\u062c\u0627\u062a \u0645\u062a\u0627\u062d\u0629",
    "buyer.noProducts.desc.loadError": "\u062a\u0639\u0630\u0651\u0631 \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0645\u0646\u062a\u062c\u0627\u062a \u062d\u0627\u0644\u064a\u064b\u0627. \u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.",
    "buyer.noProducts.desc.category": "\u0644\u0627 \u062a\u0648\u062c\u062f \u0645\u0646\u062a\u062c\u0627\u062a \u0641\u064a \u0647\u0630\u0647 \u0627\u0644\u0641\u0626\u0629. \u0627\u0645\u0633\u062d \u0627\u0644\u062a\u0635\u0641\u064a\u0629 \u0623\u0648 \u0648\u0633\u0651\u0639 \u0627\u0644\u0646\u0637\u0627\u0642.",
    "buyer.noProducts.desc.noSellers": "\u0644\u0627 \u062a\u0648\u062c\u062f \u0645\u062a\u0627\u062c\u0631 \u0641\u064a \u0647\u0630\u0647 \u0627\u0644\u0645\u0646\u0637\u0642\u0629. \u062d\u062f\u062f \u0645\u0648\u0642\u0639\u0643 \u0623\u0648 \u0648\u0633\u0651\u0639 \u0627\u0644\u0646\u0637\u0627\u0642.",
    "buyer.noProducts.desc.sellersNoProducts": "\u062a\u0648\u062c\u062f \u0645\u062a\u0627\u062c\u0631 \u0642\u0631\u064a\u0628\u0629\u060c \u0644\u0643\u0646 \u0644\u0627 \u062a\u0648\u062c\u062f \u0645\u0646\u062a\u062c\u0627\u062a \u0645\u0646\u0634\u0648\u0631\u0629. \u062d\u0627\u0648\u0644 \u0644\u0627\u062d\u0642\u064b\u0627 \u0623\u0648 \u063a\u064a\u0651\u0631 \u0627\u0644\u0641\u0626\u0629.",
    "buyer.noProducts.desc.generic": "\u062d\u0627\u0648\u0644 \u062a\u0648\u0633\u064a\u0639 \u0627\u0644\u0646\u0637\u0627\u0642 \u0623\u0648 \u062a\u062d\u062f\u064a\u062f \u0645\u0648\u0642\u0639\u0643 \u0644\u0646\u062a\u0627\u0626\u062c \u0623\u0641\u0636\u0644.",
    "buyer.categories.scrollLeft": "\u0645\u0631\u0651\u0631 \u0627\u0644\u0641\u0626\u0627\u062a \u0644\u0644\u064a\u0633\u0627\u0631",
    "buyer.categories.scrollRight": "\u0645\u0631\u0651\u0631 \u0627\u0644\u0641\u0626\u0627\u062a \u0644\u0644\u064a\u0645\u064a\u0646",
    "buyer.categories.showingClosestItems": "\u0639\u0631\u0636 \u0627\u0644\u0639\u0646\u0627\u0635\u0631 \u0627\u0644\u0623\u0642\u0631\u0628 (\u0644\u0627 \u064a\u0648\u062c\u062f \u0628\u0627\u0626\u0639\u0648\u0646 \u0636\u0645\u0646 {radiusKm} {unit}).",
    "buyer.categories.scrollForMore": "\u0645\u0631\u0651\u0631 \u0644\u0639\u0631\u0636 \u0627\u0644\u0645\u0632\u064a\u062f \u0645\u0646 \u0627\u0644\u0641\u0626\u0627\u062a.",
    "buyer.categories.noItemsFallback": "\u0644\u0627 \u062a\u0648\u062c\u062f \u0639\u0646\u0627\u0635\u0631 \u0641\u064a \u0647\u0630\u0647 \u0627\u0644\u0641\u0626\u0629 \u0628\u0639\u062f. \u0639\u0631\u0636 \u062c\u0645\u064a\u0639 \u0627\u0644\u0645\u0646\u062a\u062c\u0627\u062a.",
    "buyer.feed.expandingGold": "\u062a\u0648\u0633\u064a\u0639 \u0646\u0637\u0627\u0642 \u0627\u0644\u0628\u062d\u062b \u0639\u0646 \u0627\u0644\u0630\u0647\u0628 \u0645\u0646 \u062d\u0648\u0644\u0643.",
    "buyer.feed.expandingGeneral": "\u062a\u0648\u0633\u064a\u0639 \u0646\u0637\u0627\u0642 \u0627\u0644\u0628\u062d\u062b \u0639\u0646 \u0627\u0644\u0639\u0646\u0627\u0635\u0631 \u0645\u0646 \u062d\u0648\u0644\u0643.",

    "buyer.panel.wholesaleDore.title": "\u062a\u062c\u0627\u0631\u0629 \u062f\u0648\u0631\u064a\u0647 \u0628\u0627\u0644\u062c\u0645\u0644\u0629",
    "buyer.panel.wholesaleMarketplace.title": "\u0633\u0648\u0642 \u0627\u0644\u062c\u0645\u0644\u0629",
    "buyer.panel.wholesaleMarketplace.subtitle": "\u0634\u0631\u0627\u0621 \u0628\u0627\u0644\u062c\u0645\u0644\u0629\u060c \u0637\u0644\u0628\u0627\u062a \u062a\u0633\u0639\u064a\u0631\u060c \u0648\u062a\u0646\u0633\u064a\u0642 \u0645\u0639 \u0627\u0644\u0645\u0648\u0631\u062f\u064a\u0646.",
    "buyer.panel.retailGold.title": "ذهب مختوم",
    "buyer.panel.retailGold.subtitle": "\u0648\u062d\u062f\u0627\u062a \u0630\u0647\u0628 \u0627\u0633\u062a\u062b\u0645\u0627\u0631\u064a \u0645\u062e\u062a\u0648\u0645\u0629 \u2022 \u0633\u0628\u0627\u0626\u0643 \u0645\u0639\u062a\u0645\u062f\u0629 \u0648\u0645\u062e\u062a\u0648\u0645\u0629",
    "buyer.panel.retailNearby.title": "\u0627\u0644\u0633\u0648\u0642 \u0627\u0644\u0645\u062d\u0644\u064a\u0629",
    "buyer.panel.retailNearby.subtitle": "\u062a\u0633\u0648\u0642 \u0645\u062d\u0644\u064a\u060c \u062f\u0641\u0639 \u0633\u0631\u064a\u0639\u060c \u0648\u062a\u0648\u0635\u064a\u0644 \u0645\u062d\u0644\u064a.",

    "location.set": "\u062a\u062d\u062f\u064a\u062f \u0627\u0644\u0645\u0648\u0642\u0639",
    "location.setToSeeDistance": "\u062d\u062f\u062f \u0627\u0644\u0645\u0648\u0642\u0639 \u0644\u0631\u0624\u064a\u0629 \u0627\u0644\u0645\u0633\u0627\u0641\u0629",

    "admin.addProduct": "\u0625\u0636\u0627\u0641\u0629 \u0645\u0646\u062a\u062c",
    "admin.noProducts.desc.addProduct": "\u0623\u0636\u0641 \u0645\u0646\u062a\u062c\u064b\u0627 \u0644\u0645\u0644\u0621 \u0647\u0630\u0627 \u0627\u0644\u0642\u0633\u0645.",
    "admin.seedInventory": "\u062a\u0648\u0644\u064a\u062f \u0645\u062e\u0632\u0648\u0646",
    "admin.seedFailed": "\u0641\u0634\u0644 \u0627\u0644\u062a\u0648\u0644\u064a\u062f",
    "admin.seededInventory.title": "\u062a\u0645 \u062a\u0648\u0644\u064a\u062f \u0627\u0644\u0645\u062e\u0632\u0648\u0646",

    "cart.emptyHelp": "\u062a\u0635\u0641\u062d \u0627\u0644\u0645\u0646\u0634\u0648\u0631\u0627\u062a \u0644\u0625\u0636\u0627\u0641\u0629 \u0645\u0646\u062a\u062c\u0627\u062a \u0648\u0644\u0642\u0637\u0639 \u0630\u0647\u0628.",
    "cart.multipleShops.title": "\u062a\u0645 \u0627\u0643\u062a\u0634\u0627\u0641 \u0623\u0643\u062b\u0631 \u0645\u0646 \u0645\u062a\u062c\u0631",
    "cart.multipleShops.description": "\u064a\u0631\u062c\u0649 \u0627\u0644\u0637\u0644\u0628 \u0645\u0646 \u0645\u062a\u062c\u0631 \u0648\u0627\u062d\u062f \u0641\u0642\u0637 \u0641\u064a \u0643\u0644 \u0645\u0631\u0629. \u0627\u062d\u0630\u0641 \u0639\u0646\u0627\u0635\u0631 \u0627\u0644\u0645\u062a\u062c\u0631 \u0627\u0644\u0622\u062e\u0631.",

    "location.locating": "\u062c\u0627\u0631\u064d \u062a\u062d\u062f\u064a\u062f \u0627\u0644\u0645\u0648\u0642\u0639...",
    "location.enable": "\u0641\u0639\u0651\u0644 \u0627\u0644\u0645\u0648\u0642\u0639",
    "location.unavailable": "\u0627\u0644\u0645\u0648\u0642\u0639 \u063a\u064a\u0631 \u0645\u062a\u0627\u062d",
    "location.approx.title": "Ø§Ø³ØªØ®Ø¯Ø§Ù… Ù…ÙˆÙ‚Ø¹ ØªÙ‚Ø±ÙŠØ¨ÙŠ",
    "location.approx.description": "ØªØ¹Ø°Ù‘Ø± Ø§Ù„Ø­ØµÙˆÙ„ Ø¹Ù„Ù‰ Ù…ÙˆÙ‚Ø¹ GPS Ø¯Ù‚ÙŠÙ‚. Ø³Ù†Ø¹Ø±Ø¶ Ù†ØªØ§Ø¦Ø¬ Ù‚Ø±ÙŠØ¨Ø© Ø¨Ø§Ø³ØªØ®Ø¯Ø§Ù… Ù…ÙˆÙ‚Ø¹ ØªÙ‚Ø±ÙŠØ¨ÙŠ.",
    "location.approx.label": "ØªÙ‚Ø±ÙŠØ¨ÙŠ",
    "location.toast.title": "\u0627\u0644\u0645\u0648\u0642\u0639 \u0645\u0637\u0644\u0648\u0628",
    "location.toast.description": "\u0627\u0633\u0645\u062d \u0628\u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0627\u0644\u0645\u0648\u0642\u0639 \u0644\u0631\u0624\u064a\u0629 \u0627\u0644\u0628\u0627\u0626\u0639\u064a\u0646 \u0628\u0627\u0644\u0642\u0631\u0628 \u0645\u0646\u0643.",
    "location.title": "\u0627\u0644\u0645\u0648\u0642\u0639",
    "location.subtitle": "\u064a\u0645\u0643\u0646 \u0644\u0644\u0645\u0646\u0635\u0629 \u0627\u0633\u062a\u062e\u062f\u0627\u0645 \u0645\u0648\u0642\u0639 \u062c\u0647\u0627\u0632\u0643 \u0648\u062a\u062d\u062f\u064a\u062b\u0647 \u0623\u062b\u0646\u0627\u0621 \u0627\u0644\u062a\u0635\u0641\u062d.",
    "location.status.updating": "\u062c\u0627\u0631\u064d \u062a\u062d\u062f\u064a\u062b \u0627\u0644\u0645\u0648\u0642\u0639...",
    "location.status.off": "Ø§Ù„Ù…ÙˆÙ‚Ø¹ Ù…ØªÙˆÙ‚Ù",
    "location.status.active": "\u0627\u0644\u0645\u0648\u0642\u0639 \u0646\u0634\u0637",
    "location.status.nearbyGps": "Ù‚Ø±ÙŠØ¨ Ù…Ù†Ùƒ (GPS)",
    "location.status.nearbyApprox": "Ù‚Ø±ÙŠØ¨ Ù…Ù†Ùƒ (ØªÙ‚Ø±ÙŠØ¨ÙŠ)",
    "location.status.denied": "\u062a\u0645 \u062d\u0638\u0631 \u0625\u0630\u0646 \u0627\u0644\u0645\u0648\u0642\u0639",
    "location.status.unavailable": "\u062e\u062f\u0645\u0627\u062a \u0627\u0644\u0645\u0648\u0642\u0639 \u063a\u064a\u0631 \u0645\u062a\u0627\u062d\u0629",
    "location.status.error": "\u062e\u0637\u0623 \u0641\u064a \u0627\u0644\u0645\u0648\u0642\u0639",
    "location.help.secureContext": "ÙŠØªØ·Ù„Ø¨ ØªØ­Ø¯ÙŠØ¯ Ø§Ù„Ù…ÙˆÙ‚Ø¹ Ø§Ø³ØªØ®Ø¯Ø§Ù… HTTPS. Ø§ÙØªØ­ Ø§Ù„Ù…ÙˆÙ‚Ø¹ Ø¹Ø¨Ø± https Ø«Ù… Ø£Ø¹Ø¯ Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø©.",
    "location.help.denied": "\u0641\u0639\u0651\u0644 \u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0627\u0644\u0645\u0648\u0642\u0639 \u0645\u0646 \u0625\u0639\u062f\u0627\u062f\u0627\u062a \u0627\u0644\u0645\u062a\u0635\u0641\u062d \u062b\u0645 \u0627\u0636\u063a\u0637 \u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629.",
    "location.help.iosPwa": "Ø¹Ù„Ù‰ iOS Ù‚Ø¯ ÙŠÙØ­Ø¸Ø± Ø§Ù„Ù…ÙˆÙ‚Ø¹ Ø¯Ø§Ø®Ù„ Ø§Ù„ØªØ·Ø¨ÙŠÙ‚ Ø§Ù„Ù…Ø«Ø¨Ù‘Øª. Ø§ÙØªØ­ ÙÙŠ Safari ÙˆØ§Ø³Ù…Ø­ Ø¨Ø§Ù„Ù…ÙˆÙ‚Ø¹ØŒ Ø«Ù… Ø§Ø¶ØºØ· Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø©.",
    "location.help.unavailable": "\u0645\u062a\u0635\u0641\u062d\u0643/\u062c\u0647\u0627\u0632\u0643 \u0644\u0627 \u064a\u062f\u0639\u0645 \u062e\u062f\u0645\u0627\u062a \u0627\u0644\u0645\u0648\u0642\u0639.",
    "location.help.requesting": "\u0628\u0627\u0646\u062a\u0638\u0627\u0631 \u0627\u0633\u062a\u062c\u0627\u0628\u0629 GPS \u0645\u0646 \u0627\u0644\u0645\u062a\u0635\u0641\u062d.",
    "location.help.active": "\u064a\u062a\u0645 \u062a\u062d\u062f\u064a\u062b \u0645\u0648\u0642\u0639\u0643 \u062a\u0644\u0642\u0627\u0626\u064a\u064b\u0627 \u0623\u062b\u0646\u0627\u0621 \u0628\u0642\u0627\u0621 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062d\u0629 \u0645\u0641\u062a\u0648\u062d\u0629.",
    "location.help.timeout": "ÙŠØ³ØªØºØ±Ù‚ GPS ÙˆÙ‚ØªÙ‹Ø§ Ø·ÙˆÙŠÙ„Ø§Ù‹. Ø£Ø¹Ø¯ Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø© Ø£Ùˆ Ø§Ø³ØªØ®Ø¯Ù… Ù…ÙˆÙ‚Ø¹Ù‹Ø§ ÙŠØ¯ÙˆÙŠÙ‹Ø§/ØªÙ‚Ø±ÙŠØ¨ÙŠÙ‹Ø§.",
    "location.help.positionUnavailable": "Ù„Ø§ ÙŠÙ…ÙƒÙ† Ù„Ù€ GPS ØªØ­Ø¯ÙŠØ¯ Ù…ÙˆÙ‚Ø¹Ùƒ. Ø£Ø¹Ø¯ Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø© Ø£Ùˆ Ø§Ø³ØªØ®Ø¯Ù… Ù…ÙˆÙ‚Ø¹Ù‹Ø§ ÙŠØ¯ÙˆÙŠÙ‹Ø§/ØªÙ‚Ø±ÙŠØ¨ÙŠÙ‹Ø§.",
    "location.help.errorGeneric": "ØªØ¹Ø°Ù‘Ø± ØªØ­Ø¯ÙŠØ¯ Ù…ÙˆÙ‚Ø¹Ùƒ. Ø£Ø¹Ø¯ Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø© Ø£Ùˆ Ø§Ø³ØªØ®Ø¯Ù… Ù…ÙˆÙ‚Ø¹Ù‹Ø§ ÙŠØ¯ÙˆÙŠÙ‹Ø§/ØªÙ‚Ø±ÙŠØ¨ÙŠÙ‹Ø§.",
    "location.lastUpdate": "\u0622\u062e\u0631 \u062a\u062d\u062f\u064a\u062b:",
    "location.radius.title": "Ù†Ø·Ø§Ù‚ Ø§Ù„Ù‚Ø±Ø¨",
    "location.radius.subtitle": "ÙŠØ­Ø¯Ø¯ Ù…Ø¯Ù‰ Ø§Ù„Ø¨Ø­Ø« Ø¹Ù† Ø§Ù„Ø¨Ø§Ø¦Ø¹ÙŠÙ† Ø§Ù„Ù‚Ø±ÙŠØ¨ÙŠÙ†.",
    "location.manual.title": "\u062a\u062d\u062f\u064a\u062f \u0627\u0644\u0645\u0648\u0642\u0639 \u064a\u062f\u0648\u064a\u064b\u0627",
    "location.manual.subtitle": "\u0625\u0630\u0627 \u0641\u0634\u0644 \u0645\u0648\u0642\u0639 \u0627\u0644\u062c\u0647\u0627\u0632\u060c \u0627\u062e\u062a\u0631 \u0628\u0644\u062f\u0643/\u0645\u062f\u064a\u0646\u062a\u0643 \u0648\u0633\u0646\u0633\u062a\u062e\u062f\u0645\u0647 \u0644\u0644\u0646\u062a\u0627\u0626\u062c \u0627\u0644\u0642\u0631\u064a\u0628\u0629.",
    "location.manual.country": "\u0627\u0644\u0628\u0644\u062f",
    "location.manual.region": "\u0627\u0644\u0645\u0646\u0637\u0642\u0629",
    "location.manual.city": "\u0627\u0644\u0645\u062f\u064a\u0646\u0629",
    "location.manual.use": "\u0627\u0633\u062a\u062e\u062f\u0645 \u0627\u0644\u0645\u0648\u0642\u0639 \u0627\u0644\u0645\u062d\u062f\u062f",
    "location.manual.toast.title": "\u0627\u062e\u062a\u0631 \u0645\u062f\u064a\u0646\u0629",
    "location.manual.toast.description": "\u0627\u062e\u062a\u0631 \u0628\u0644\u062f\u064b\u0627 \u0648\u0645\u0646\u0637\u0642\u0629 \u0648\u0645\u062f\u064a\u0646\u0629 \u0644\u062a\u062d\u062f\u064a\u062f \u0645\u0648\u0642\u0639\u0643 \u064a\u062f\u0648\u064a\u064b\u0627.",
    "location.manual.noGps.title": "\u0644\u0627 \u062a\u0648\u062c\u062f \u0625\u062d\u062f\u0627\u062b\u064a\u0627\u062a GPS \u0644\u0644\u0645\u062f\u064a\u0646\u0629",
    "location.manual.noGps.description": "\u064a\u0631\u062c\u0649 \u0627\u062e\u062a\u064a\u0627\u0631 \u0645\u062f\u064a\u0646\u0629 \u0623\u062e\u0631\u0649 \u0623\u0648 \u062a\u0641\u0639\u064a\u0644 \u0645\u0648\u0642\u0639 \u0627\u0644\u062c\u0647\u0627\u0632.",
    "location.retry": "\u0625\u0639\u0627\u062f\u0629 \u062a\u062d\u062f\u064a\u062f \u0627\u0644\u0645\u0648\u0642\u0639",

    "wallet.title": "\u0645\u062d\u0641\u0638\u062a\u064a",
    "wallet.availableBalance": "\u0627\u0644\u0631\u0635\u064a\u062f \u0627\u0644\u0645\u062a\u0627\u062d",
    "wallet.deposited": "\u0627\u0644\u0645\u064f\u0648\u062f\u064e\u0639",
    "wallet.spent": "\u0627\u0644\u0645\u064f\u0646\u0641\u064e\u0642",
    "wallet.sendHint": "\u0623\u0631\u0633\u0644 \u0627\u0644\u0631\u0635\u064a\u062f \u0641\u0648\u0631\u064b\u0627 \u0639\u0628\u0631 \u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645 \u0623\u0648 \u0627\u0644\u0647\u0627\u062a\u0641 \u0623\u0648 \u0631\u0645\u0632 QR \u2014 \u0645\u062c\u0627\u0646\u064b\u0627!",
    "wallet.saveWalletSuffix": "\u0644\u062d\u0641\u0638 \u0645\u062d\u0641\u0638\u062a\u0643",
    "wallet.deposit": "\u0625\u064a\u062f\u0627\u0639",
    "wallet.depositAmount": "\u0627\u0644\u0645\u0628\u0644\u063a",
    "wallet.depositSuccess": "\u062a\u0645 \u0627\u0644\u0625\u064a\u062f\u0627\u0639",
    "wallet.depositSuccessDetail": "\u062a\u0645\u062a \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0631\u0635\u064a\u062f \u0625\u0644\u0649 \u0645\u062d\u0641\u0638\u062a\u0643.",
    "wallet.depositFailed": "\u0641\u0634\u0644 \u0627\u0644\u0625\u064a\u062f\u0627\u0639",

    "vault.title": "\u062e\u0632\u0627\u0646\u062a\u064a",
    "vault.totalGold": "\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0630\u0647\u0628",
    "vault.units": "\u0648\u062d\u062f\u0627\u062a \u0627\u0644\u0630\u0647\u0628",
    "vault.signInToAccess": "\u0633\u062c\u0651\u0644 \u0627\u0644\u062f\u062e\u0648\u0644 \u0644\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u062e\u0632\u0627\u0646\u062a\u0643 \u0627\u0644\u0630\u0647\u0628\u064a\u0629 \u0627\u0644\u0627\u0641\u062a\u0631\u0627\u0636\u064a\u0629.",
    "vault.description": "\u0645\u062e\u0632\u0651\u0646 \u0641\u064a \u062e\u0632\u0627\u0646\u062a\u0643 \u0627\u0644\u0630\u0647\u0628\u064a\u0629 \u0627\u0644\u0627\u0641\u062a\u0631\u0627\u0636\u064a\u0629 (\u062a\u0633\u0644\u064a\u0645 \u0627\u0644\u0622\u0646 \u0623\u0648 \u0644\u0627\u062d\u0642\u064b\u0627).",
    "vault.noUnits": "\u0644\u0627 \u062a\u0648\u062c\u062f \u0648\u062d\u062f\u0627\u062a \u0630\u0647\u0628 \u0628\u0639\u062f.",
    "vault.status": "\u0627\u0644\u062d\u0627\u0644\u0629",
    "vault.locked": "\u0645\u0642\u0641\u0644\u0629",
    "vault.available": "\u0645\u062a\u0627\u062d\u0629",
    "vault.lockupEnds": "\u064a\u0646\u062a\u0647\u064a \u0627\u0644\u0642\u0641\u0644 \u0641\u064a",
    "vault.buyUnits": "\u0634\u0631\u0627\u0621 \u0648\u062d\u062f\u0627\u062a \u0630\u0647\u0628",
    "vault.buyUnitsDescription": "\u0627\u062e\u062a\u0631 \u0648\u062d\u062f\u0629 \u0642\u064a\u0627\u0633\u064a\u0629 (\u0628\u0627\u0644\u063a\u0631\u0627\u0645) \u062b\u0645 \u0623\u0643\u0651\u062f \u0627\u0644\u0634\u0631\u0627\u0621.",
    "vault.unitSize": "\u062d\u062c\u0645 \u0627\u0644\u0648\u062d\u062f\u0629",
    "vault.deliveryChoice": "\u0627\u0644\u062a\u0633\u0644\u064a\u0645",
    "vault.storeInVault": "\u062a\u062e\u0632\u064a\u0646 \u0641\u064a \u0627\u0644\u062e\u0632\u0627\u0646\u0629",
    "vault.deliveryNow": "\u062a\u0633\u0644\u064a\u0645 \u0627\u0644\u0622\u0646",
    "vault.lockupLabel": "\u0639\u062f\u0645 \u0627\u0644\u062a\u0633\u0644\u064a\u0645 \u0642\u0628\u0644",
    "vault.lockupHelp": "\u0627\u062e\u062a\u064a\u0627\u0631\u064a: \u064a\u0645\u0646\u0639 \u0637\u0644\u0628\u0627\u062a \u0627\u0644\u062a\u0633\u0644\u064a\u0645 \u062d\u062a\u0649 \u0647\u0630\u0627 \u0627\u0644\u062a\u0627\u0631\u064a\u062e.",
    "vault.confirmPurchase": "\u062a\u0623\u0643\u064a\u062f \u0627\u0644\u0634\u0631\u0627\u0621",
    "vault.pricingAtPurchase": "\u064a\u062a\u0645 \u062a\u062b\u0628\u064a\u062a \u0627\u0644\u0633\u0639\u0631 \u0644\u062d\u0638\u0629 \u0627\u0644\u0634\u0631\u0627\u0621 (\u0644\u0642\u0637\u0629).",
    "vault.purchaseSuccess": "\u062a\u0645 \u062a\u0623\u0643\u064a\u062f \u0627\u0644\u0634\u0631\u0627\u0621",
    "vault.purchaseSuccessDetail": "\u062a\u0645\u062a \u0625\u0636\u0627\u0641\u0629 \u0648\u062d\u062f\u0629 \u0627\u0644\u0630\u0647\u0628 \u0625\u0644\u0649 \u062e\u0632\u0627\u0646\u062a\u0643.",
    "vault.purchaseFailed": "\u0641\u0634\u0644 \u0627\u0644\u0634\u0631\u0627\u0621",
    "vault.requestDelivery": "\u0637\u0644\u0628 \u0627\u0644\u062a\u0633\u0644\u064a\u0645",
    "vault.deliveryRequested": "\u062a\u0645 \u0637\u0644\u0628 \u0627\u0644\u062a\u0633\u0644\u064a\u0645",
    "vault.deliveryRequestedDetail": "\u062a\u0645 \u062a\u0633\u062c\u064a\u0644 \u0637\u0644\u0628 \u0627\u0644\u062a\u0633\u0644\u064a\u0645.",
    "vault.deliveryRequestFailed": "\u0641\u0634\u0644 \u0637\u0644\u0628 \u0627\u0644\u062a\u0633\u0644\u064a\u0645",
    "vault.authorizeResale": "\u062a\u0641\u0648\u064a\u0636 \u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0628\u064a\u0639",
    "vault.resaleAuthorized": "\u062a\u0645 \u062a\u0641\u0648\u064a\u0636 \u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0628\u064a\u0639",
    "vault.resaleAuthorizedDetail": "\u064a\u0645\u0643\u0646\u0643 \u0627\u0644\u0622\u0646 \u0625\u0646\u0634\u0627\u0621 \u0625\u062f\u0631\u0627\u062c \u0641\u064a \u0627\u0644\u0633\u0648\u0642 \u0627\u0644\u062b\u0627\u0646\u0648\u064a\u0629.",
    "vault.resaleAuthorizeFailed": "\u0641\u0634\u0644 \u062a\u0641\u0648\u064a\u0636 \u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0628\u064a\u0639",
    "vault.listForResale": "\u0625\u062f\u0631\u0627\u062c \u0644\u0644\u0628\u064a\u0639",
    "vault.listingCreated": "\u062a\u0645 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0625\u062f\u0631\u0627\u062c",
    "vault.listingCreatedDetail": "\u062a\u0645 \u0625\u062f\u0631\u0627\u062c \u0648\u062d\u062f\u062a\u0643 \u0644\u0644\u0639\u0645\u0644\u0627\u0621 \u0627\u0644\u0645\u0624\u0643\u062f\u064a\u0646.",
    "vault.listingCreateFailed": "\u0641\u0634\u0644 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0625\u062f\u0631\u0627\u062c",

    "secondaryMarket.title": "\u0627\u0644\u0633\u0648\u0642 \u0627\u0644\u062b\u0627\u0646\u0648\u064a\u0629",
    "secondaryMarket.description": "\u0645\u0642\u064a\u062f\u0629 \u0644\u0644\u0639\u0645\u0644\u0627\u0621 \u0627\u0644\u0645\u0624\u0643\u062f\u064a\u0646. \u062a\u062a\u0645 \u0627\u0644\u062a\u0633\u0648\u064a\u0629 \u0639\u0628\u0631 \u0627\u0644\u0645\u062d\u0641\u0638\u0629.",
    "secondaryMarket.restricted": "\u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0627\u0644\u0633\u0648\u0642 \u0627\u0644\u062b\u0627\u0646\u0648\u064a\u0629 \u0645\u0642\u064a\u062f \u0644\u0644\u0639\u0645\u0644\u0627\u0621 \u0627\u0644\u0645\u0624\u0643\u062f\u064a\u0646.",
    "secondaryMarket.empty": "\u0644\u0627 \u062a\u0648\u062c\u062f \u0625\u062f\u0631\u0627\u062c\u0627\u062a \u0627\u0644\u0622\u0646.",
    "secondaryMarket.listing": "\u0625\u062f\u0631\u0627\u062c",
    "secondaryMarket.visibleToConfirmed": "\u0645\u0631\u0626\u064a \u0641\u0642\u0637 \u0644\u0644\u0639\u0645\u0644\u0627\u0621 \u0627\u0644\u0645\u0624\u0643\u062f\u064a\u0646",
    "secondaryMarket.buy": "\u0634\u0631\u0627\u0621",
    "secondaryMarket.purchaseSuccess": "\u062a\u0645 \u0627\u0644\u0634\u0631\u0627\u0621 \u0628\u0646\u062c\u0627\u062d",
    "secondaryMarket.purchaseSuccessDetail": "\u062a\u0645 \u0646\u0642\u0644 \u0627\u0644\u0648\u062d\u062f\u0629 \u0625\u0644\u0649 \u062e\u0632\u0627\u0646\u062a\u0643.",
    "secondaryMarket.purchaseFailed": "\u0641\u0634\u0644 \u0627\u0644\u0634\u0631\u0627\u0621",

    "badge.bureauAchat": "\u0645\u0643\u062a\u0628 \u0634\u0631\u0627\u0621",
    "badge.govLicensed": "\u0645\u0631\u062e\u0651\u0635 \u062d\u0643\u0648\u0645\u064a\u064b\u0627",
    "badge.assayerVerified": "\u0645\u064f\u062a\u062d\u0642\u0651\u0642 \u0645\u0646 \u0642\u0628\u0644 \u0645\u0641\u062d\u0635",
    "badge.lbmaCustody": "\u0633\u0644\u0633\u0644\u0629 \u0627\u0644\u062d\u064a\u0627\u0632\u0629",

    "certifications.title": "\u0627\u0644\u0627\u0639\u062a\u0645\u0627\u062f\u0627\u062a",
    "trading.title": "\u062a\u062f\u0627\u0648\u0644 \u0627\u0644\u0630\u0647\u0628",
    "trading.subtitle": "\u062f\u0648\u0631\u064a\u0647 \u0648\u0630\u0647\u0628 \u0645\u062e\u062a\u0648\u0645",

    "price.perGram": "/\u063a",
    "price.perOz": "/\u0623\u0648\u0646\u0635\u0629",

    "ticker.lbmaGold": "\u0633\u0639\u0631 \u0627\u0644\u0630\u0647\u0628 \u0627\u0644\u0641\u0648\u0631\u064a",
    "ticker.localPremium": "\u0639\u0644\u0627\u0648\u0629 \u0645\u062d\u0644\u064a\u0629",
    "ticker.coteIvoire": "\u0643\u0648\u062a \u062f\u064a\u0641\u0648\u0627\u0631",
    "wholesale.preview.accessRequired": "Ù…Ø·Ù„ÙˆØ¨ ÙˆØµÙˆÙ„ Ù…Ø¹ØªÙ…Ø¯",
    "wholesale.preview.hiddenUntilApproval": "ÙŠØªÙ… Ø¥Ø®ÙØ§Ø¡ Ø§Ù„Ø¬Ù‡Ø§Øª Ø§Ù„Ù…Ù‚Ø§Ø¨Ù„Ø© ÙˆØ§Ù„Ù…ÙˆØ§Ù‚Ø¹ Ø§Ù„Ø¯Ù‚ÙŠÙ‚Ø© ÙˆØªØ¯ÙÙ‚Ø§Øª Ø§Ù„ØªØ¯Ø§ÙˆÙ„ Ø­ØªÙ‰ Ø§Ù„Ù…ÙˆØ§ÙÙ‚Ø©.",
    "wholesale.preview.requestPending": "Ø§Ù„Ø·Ù„Ø¨ Ù‚ÙŠØ¯ Ø§Ù„Ø§Ù†ØªØ¸Ø§Ø±",
    "wholesale.apply.accessButton": "Ø·Ù„Ø¨ Ø§Ù„ÙˆØµÙˆÙ„ Ù„Ù„Ø¬Ù…Ù„Ø©",
    "wholesale.apply.dialogTitle": "Ø·Ù„Ø¨ Ø´Ø±ÙŠÙƒ Ø¨Ø§Ù„Ø¬Ù…Ù„Ø©",
    "wholesale.apply.dialogDescription": "Ø§Ø±ÙØ¹ Ø±Ø®ØµØ© Ø§Ù„ØªØ¯Ø§ÙˆÙ„ Ù„Ø·Ù„Ø¨ ÙˆØµÙˆÙ„ Ù…Ø¹ØªÙ…Ø¯. ØªØ¸Ù„ Ø§Ù„Ø¬Ù‡Ø§Øª Ø§Ù„Ù…Ù‚Ø§Ø¨Ù„Ø© ÙˆØ§Ù„Ù…ÙˆØ§Ù‚Ø¹ Ø§Ù„Ø¯Ù‚ÙŠÙ‚Ø© Ù…Ø®ÙÙŠØ© Ø­ØªÙ‰ Ø§Ù„Ù…ÙˆØ§ÙÙ‚Ø©.",
    "wholesale.apply.step1.title": "Ø§Ù„Ø®Ø·ÙˆØ© 1 â€” ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„",
    "wholesale.apply.step1.description": "Ø§Ù„ÙˆØµÙˆÙ„ Ù„Ù„Ø¬Ù…Ù„Ø© Ù…ØªØ§Ø­ ÙÙ‚Ø· Ù„Ù„Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ù…ÙˆØ«Ù‘Ù‚Ø©.",
    "wholesale.apply.step2.title": "Ø§Ù„Ø®Ø·ÙˆØ© 2 â€” Ø±ÙØ¹ Ø§Ù„Ø±Ø®ØµØ©",
    "wholesale.apply.step2.description": "Ù…Ù‚Ø¨ÙˆÙ„: PDF / ØµÙˆØ±Ø©. Ø§Ù„Ø¬Ù‡Ø© Ø§Ù„Ù…ÙØµØ¯ÙØ±Ø© ÙˆØ§Ù„Ù†ÙˆØ¹ ÙˆØªØ§Ø±ÙŠØ® Ø§Ù„Ø§Ù†ØªÙ‡Ø§Ø¡ Ù…Ø·Ù„ÙˆØ¨Ø©.",
    "wholesale.apply.selectedFile": "ØªÙ… Ø§Ø®ØªÙŠØ§Ø±: {file}",
    "wholesale.apply.step3.title": "Ø§Ù„Ø®Ø·ÙˆØ© 3 â€” Ø¥Ø±Ø³Ø§Ù„ Ù„Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©",
    "wholesale.apply.step3.description": "ÙŠØªÙ… Ù…Ù†Ø­ Ø§Ù„ÙˆØµÙˆÙ„ ÙÙ‚Ø· Ø¨Ø¹Ø¯ Ø§Ù„ØªØ­Ù‚Ù‚ ÙˆÙØ­ÙˆØµØ§Øª Ø§Ù„Ø§Ù…ØªØ«Ø§Ù„.",
    "wholesale.apply.status.approved": "ØªÙ…Øª Ø§Ù„Ù…ÙˆØ§ÙÙ‚Ø© Ø¨Ø§Ù„ÙØ¹Ù„",
    "wholesale.apply.submitApplication": "Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø·Ù„Ø¨",
  },
};

const currencySymbols: Record<Currency, string> = {
  USD: "$",
  EUR: "\u20ac",
  GBP: "\u00a3",
  XOF: "XOF",
  GHS: "GHS",
  NGN: "\u20a6",
  KES: "KES",
  AED: "AED",
};

const defaultRates: LBMARates = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  XOF: 615,
  GHS: 12.5,
  NGN: 1500,
  KES: 128,
  AED: 3.67,
};

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

export type LocaleResolutionSource = "url" | "manual" | "geo" | "browser";

const LOCALE_MANUAL_KEY = "ece_locale_manual_v1";
const LOCALE_AUTO_KEY = "ece_locale_auto_v1";
const LOCALE_COUNTRY_KEY = "ece_locale_country_v1";
const LEGACY_LANGUAGE_KEY = "ece_language";
const LEGACY_CURRENCY_KEY = "ece_currency";

const COUNTRY_LOCALE_MAP: Record<string, { language: Language; currency: Currency }> = {
  CI: { language: "fr", currency: "XOF" },
  SN: { language: "fr", currency: "XOF" },
  ML: { language: "fr", currency: "XOF" },
  BF: { language: "fr", currency: "XOF" },
  NE: { language: "fr", currency: "XOF" },
  TG: { language: "fr", currency: "XOF" },
  BJ: { language: "fr", currency: "XOF" },
  GW: { language: "fr", currency: "XOF" },
  GH: { language: "en", currency: "GHS" },
  NG: { language: "en", currency: "NGN" },
  KE: { language: "en", currency: "KES" },
  AE: { language: "ar", currency: "AED" },
  FR: { language: "fr", currency: "EUR" },
  GB: { language: "en", currency: "GBP" },
  UK: { language: "en", currency: "GBP" },
  US: { language: "en", currency: "USD" },
};

export function resolveLocalePolicy(input: {
  browserLanguage: Language;
  browserCurrency: Currency;
  detectedCountry: string | null;
  manualLanguage: Language | null;
  manualCurrency: Currency | null;
  urlLanguage: Language | null;
  urlCurrency: Currency | null;
}): {
  language: Language;
  currency: Currency;
  source: LocaleResolutionSource;
  manualOverride: boolean;
} {
  let language: Language = input.browserLanguage;
  let currency: Currency = input.browserCurrency;
  let source: LocaleResolutionSource = "browser";
  let manualOverride = false;

  const geoMapping = input.detectedCountry ? COUNTRY_LOCALE_MAP[input.detectedCountry] : null;
  if (geoMapping) {
    language = geoMapping.language;
    currency = geoMapping.currency;
    source = "geo";
  }

  if (input.manualLanguage || input.manualCurrency) {
    language = input.manualLanguage || language;
    currency = input.manualCurrency || currency;
    source = "manual";
    manualOverride = true;
  }

  if (input.urlLanguage || input.urlCurrency) {
    language = input.urlLanguage || language;
    currency = input.urlCurrency || currency;
    source = "url";
  }

  return { language, currency, source, manualOverride };
}

function normalizeLanguage(value: unknown): Language | null {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "en" || normalized === "fr" || normalized === "ar") return normalized;
  const base = normalized.split("-")[0];
  if (base === "en" || base === "fr" || base === "ar") return base;
  return null;
}

function normalizeCurrency(value: unknown): Currency | null {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  if (normalized === "USD") return "USD";
  if (normalized === "EUR") return "EUR";
  if (normalized === "GBP") return "GBP";
  if (normalized === "XOF") return "XOF";
  if (normalized === "GHS") return "GHS";
  if (normalized === "NGN") return "NGN";
  if (normalized === "KES") return "KES";
  if (normalized === "AED") return "AED";
  return null;
}

function parseStoredJson<T extends Record<string, any>>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as T;
  } catch {
    return null;
  }
}

function detectBrowserLanguage(): Language {
  const browserLang = String(navigator.language || "").toLowerCase();
  if (browserLang.startsWith("fr")) return "fr";
  if (browserLang.startsWith("ar")) return "ar";
  return "en";
}

function detectBrowserCurrency(): Currency {
  const browserLang = String(navigator.language || "").toLowerCase();
  const region = browserLang.split("-")[1]?.toUpperCase() || "";
  const mapped = COUNTRY_LOCALE_MAP[region];
  if (mapped) return mapped.currency;
  return "USD";
}

function inferCountryCodeFromStoredLocation(): string | null {
  const explicit = parseStoredJson<{ countryCode?: string; code?: string }>(LOCALE_AUTO_KEY);
  const fromAuto = String(explicit?.countryCode || explicit?.code || "").trim().toUpperCase();
  if (fromAuto && fromAuto.length <= 3) return fromAuto;

  const fromKey = String(localStorage.getItem(LOCALE_COUNTRY_KEY) || "")
    .trim()
    .toUpperCase();
  if (fromKey && fromKey.length <= 3) return fromKey;

  const marketplaceLocation = parseStoredJson<{ country?: { code?: string } }>("marketplace_location_v1");
  const code = String(marketplaceLocation?.country?.code || "")
    .trim()
    .toUpperCase();
  if (code && code.length <= 3) return code;
  return null;
}

function detectTenantFromHost(): TenantKey | null {
  if (typeof window === "undefined") return null;
  try {
    return resolveTenantKey({ host: window.location.hostname });
  } catch {
    return null;
  }
}

function resolveTenantMarketplaceLocale(tenantKey: TenantKey | null) {
  const config = getTenantConfigByKey(tenantKey);
  const language = normalizeLanguage(String(config?.defaultLocale || "").split(/[-_]/)[0]);
  const currency = normalizeCurrency(config?.marketplaceDefaults?.defaultCurrency);
  return {
    language: language || null,
    currency: currency || null,
  };
}

function resolveInitialLocaleState(): {
  language: Language;
  currency: Currency;
  source: LocaleResolutionSource;
  manualOverride: boolean;
  detectedCountry: string | null;
} {
  // Required launch precedence:
  // 1) URL session override
  // 2) manual preference
  // 3) geo-detected country
  // 4) browser fallback
  const browserLanguage = detectBrowserLanguage();
  const browserCurrency = detectBrowserCurrency();

  const detectedCountry = inferCountryCodeFromStoredLocation();

  const manualState = parseStoredJson<{ language?: Language; currency?: Currency }>(LOCALE_MANUAL_KEY);
  const legacyLanguage =
    normalizeLanguage(readCookie("exportunity_pref_lang")) ||
    normalizeLanguage(localStorage.getItem(LEGACY_LANGUAGE_KEY));
  const legacyCurrency =
    normalizeCurrency(readCookie("exportunity_pref_currency")) ||
    normalizeCurrency(localStorage.getItem(LEGACY_CURRENCY_KEY));
  const manualLanguage = normalizeLanguage(manualState?.language) || legacyLanguage;
  const manualCurrency = normalizeCurrency(manualState?.currency) || legacyCurrency;

  const urlLanguage = normalizeLanguage(readUrlParam("lang"));
  const urlCurrency = normalizeCurrency(readUrlParam("currency"));
  const tenantKey = detectTenantFromHost();
  const tenantMarketplaceLocale = resolveTenantMarketplaceLocale(tenantKey);
  const isFrenchXofPriorityTenant = tenantKey === "bdo";
  const isTenantLocaleLocked = tenantKey === "met";

  if (isTenantLocaleLocked && !urlLanguage && !urlCurrency) {
    return {
      language: tenantMarketplaceLocale.language || "fr",
      currency: tenantMarketplaceLocale.currency || "XOF",
      source: "browser",
      manualOverride: false,
      detectedCountry,
    };
  }

  // Bourse de l'Or and Maison en Terre are French-first + XOF-first unless the user explicitly selected a preference.
  if (
    isFrenchXofPriorityTenant &&
    !manualLanguage &&
    !manualCurrency &&
    !urlLanguage &&
    !urlCurrency
  ) {
    return {
      language: "fr",
      currency: "XOF",
      source: "browser",
      manualOverride: false,
      detectedCountry,
    };
  }

  const resolved = resolveLocalePolicy({
    browserLanguage,
    browserCurrency,
    detectedCountry,
    manualLanguage,
    manualCurrency,
    urlLanguage,
    urlCurrency,
  });

  return { ...resolved, detectedCountry };
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const needle = `${encodeURIComponent(name)}=`;
  const parts = String(document.cookie || "").split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(needle)) continue;
    return decodeURIComponent(trimmed.slice(needle.length));
  }
  return null;
}

function writeCookie(name: string, value: string, days = 365) {
  if (typeof document === "undefined") return;
  const maxAge = Math.max(1, Math.floor(days * 24 * 60 * 60));
  const host = String(window?.location?.hostname || "").toLowerCase();
  const onExportunity = host.endsWith(".exportunity.net") || host === "exportunity.net";
  const domain = onExportunity ? "; Domain=.exportunity.net" : "";
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${domain}`;
}

function readUrlParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const v = params.get(name);
    return v ? String(v).trim() : null;
  } catch {
    return null;
  }
}

function toLocale(language: Language): string {
  if (language === "fr") return "fr-FR";
  if (language === "ar") return "ar-SA";
  return "en-US";
}

function convertAmount(amount: number, fromCurrency: Currency, targetCurrency: Currency, rates: LBMARates): number {
  if (!Number.isFinite(amount)) return 0;
  if (fromCurrency === targetCurrency) return amount;

  const toUSD = (value: number, from: Currency) => {
    if (from === "USD") return value;
    if (from === "XOF") return value / (rates.XOF || defaultRates.XOF);
    if (from === "EUR") return value / (rates.EUR || defaultRates.EUR);
    if (from === "GBP") return value / (rates.GBP || defaultRates.GBP);
    if (from === "GHS") return value / (rates.GHS || defaultRates.GHS);
    if (from === "NGN") return value / (rates.NGN || defaultRates.NGN);
    if (from === "KES") return value / (rates.KES || defaultRates.KES);
    if (from === "AED") return value / (rates.AED || defaultRates.AED);
    return value;
  };

  const fromUSD = (valueUSD: number, to: Currency) => {
    if (to === "USD") return valueUSD;
    if (to === "XOF") return valueUSD * (rates.XOF || defaultRates.XOF);
    if (to === "EUR") return valueUSD * (rates.EUR || defaultRates.EUR);
    if (to === "GBP") return valueUSD * (rates.GBP || defaultRates.GBP);
    if (to === "GHS") return valueUSD * (rates.GHS || defaultRates.GHS);
    if (to === "NGN") return valueUSD * (rates.NGN || defaultRates.NGN);
    if (to === "KES") return valueUSD * (rates.KES || defaultRates.KES);
    if (to === "AED") return valueUSD * (rates.AED || defaultRates.AED);
    return valueUSD;
  };

  return fromUSD(toUSD(amount, fromCurrency), targetCurrency);
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [initialLocale] = useState(() => resolveInitialLocaleState());
  const [language, setLanguageState] = useState<Language>(initialLocale.language);
  const [currency, setCurrencyState] = useState<Currency>(initialLocale.currency);
  const [source, setSource] = useState<LocaleResolutionSource>(initialLocale.source);
  const [manualOverride, setManualOverride] = useState<boolean>(initialLocale.manualOverride);
  const [detectedCountry, setDetectedCountry] = useState<string | null>(initialLocale.detectedCountry);
  const [fxRates, setFxRates] = useState<LBMARates | null>(null);
  const { tenant, brand } = useTenant();
  const tenantMarketplaceDefaults = useMemo(() => getTenantConfigByKey(tenant.key)?.marketplaceDefaults ?? null, [tenant.key]);
  const lockedTenantLanguage = tenant.key === "met" ? "fr" : null;
  const lockedTenantCurrency = tenant.key === "met" ? normalizeCurrency(tenantMarketplaceDefaults?.defaultCurrency) || "XOF" : null;
  const translationOverrides = useMemo(
    () => getTenantTranslationOverrides(tenant.key, language, brand),
    [tenant.key, language, brand],
  );

  const persistEffectiveLocale = useCallback((lang: Language, curr: Currency) => {
    localStorage.setItem(LEGACY_LANGUAGE_KEY, lang);
    localStorage.setItem(LEGACY_CURRENCY_KEY, curr);
    writeCookie("exportunity_pref_lang", lang);
    writeCookie("exportunity_pref_currency", curr);
  }, []);

  const persistManualLocale = useCallback((lang: Language, curr: Currency) => {
    localStorage.setItem(
      LOCALE_MANUAL_KEY,
      JSON.stringify({
        language: lang,
        currency: curr,
        updatedAt: new Date().toISOString(),
      }),
    );
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    const nextLanguage = lockedTenantLanguage || lang;
    setLanguageState(nextLanguage);
    setManualOverride(true);
    setSource("manual");
    persistEffectiveLocale(nextLanguage, currency);
    persistManualLocale(nextLanguage, currency);
    document.documentElement.dir = nextLanguage === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = nextLanguage;
    queryClient.invalidateQueries();
  }, [currency, lockedTenantLanguage, persistEffectiveLocale, persistManualLocale]);

  const setCurrency = useCallback((curr: Currency) => {
    const nextCurrency = lockedTenantCurrency || curr;
    setCurrencyState(nextCurrency);
    setManualOverride(true);
    setSource("manual");
    persistEffectiveLocale(language, nextCurrency);
    persistManualLocale(language, nextCurrency);
  }, [language, lockedTenantCurrency, persistEffectiveLocale, persistManualLocale]);

  useEffect(() => {
    if (!lockedTenantLanguage || !lockedTenantCurrency) return;
    if (language === lockedTenantLanguage && currency === lockedTenantCurrency && !manualOverride) return;
    setLanguageState(lockedTenantLanguage);
    setCurrencyState(lockedTenantCurrency);
    setManualOverride(false);
    setSource("browser");
    persistEffectiveLocale(lockedTenantLanguage, lockedTenantCurrency);
    document.documentElement.dir = "ltr";
    document.documentElement.lang = lockedTenantLanguage;
    queryClient.invalidateQueries();
  }, [currency, language, lockedTenantCurrency, lockedTenantLanguage, manualOverride, persistEffectiveLocale]);

  const applyAutoLocaleFromCountry = useCallback((countryCode: string | null | undefined) => {
    if ((tenant.key === "bdo" || tenant.key === "met") && !manualOverride) {
      setLanguageState("fr");
      setCurrencyState("XOF");
      setSource("geo");
      persistEffectiveLocale("fr", "XOF");
      return;
    }

    const normalizedCountry = String(countryCode || "")
      .trim()
      .toUpperCase();
    if (!normalizedCountry) return;

    setDetectedCountry(normalizedCountry);
    localStorage.setItem(LOCALE_COUNTRY_KEY, normalizedCountry);

    const mapped = COUNTRY_LOCALE_MAP[normalizedCountry];
    localStorage.setItem(
      LOCALE_AUTO_KEY,
      JSON.stringify({
        countryCode: normalizedCountry,
        language: mapped?.language ?? null,
        currency: mapped?.currency ?? null,
        updatedAt: new Date().toISOString(),
      }),
    );
    if (!mapped || manualOverride) return;

    setLanguageState(mapped.language);
    setCurrencyState(mapped.currency);
    setSource("geo");
    persistEffectiveLocale(mapped.language, mapped.currency);
    queryClient.invalidateQueries();
  }, [manualOverride, persistEffectiveLocale, tenant.key]);

  const t = (key: string): string => {
    if (key === "header.title") {
      return brand.name;
    }
    if (key === "header.subtitle") {
      if (brand.subtitle) return brand.subtitle;
      if (brand.tagline) return brand.tagline;
    }
    const override = translationOverrides[key];
    if (override) {
      return override;
    }
    return translations[language][key] || translations.en[key] || key;
  };

  useEffect(() => {
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    persistEffectiveLocale(language, currency);
  }, [language, currency]);

  useEffect(() => {
    let mounted = true;

    const loadRates = async () => {
      try {
        const res = await fetch(resolveApiUrl(`/api/marketplace/fx-rates?ts=${Date.now()}`), { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const rates = data?.rates;
        if (!mounted || !rates) return;

        const next: LBMARates = {
          USD: 1,
          EUR: Number(rates.EUR) || defaultRates.EUR,
          GBP: Number(rates.GBP) || defaultRates.GBP,
          XOF: Number(rates.XOF) || defaultRates.XOF,
          GHS: Number(rates.GHS) || defaultRates.GHS,
          NGN: Number(rates.NGN) || defaultRates.NGN,
          KES: Number(rates.KES) || defaultRates.KES,
          AED: Number(rates.AED) || defaultRates.AED,
        };
        setFxRates(next);
      } catch {
        // keep defaults
      }
    };

    loadRates();
    const interval = window.setInterval(loadRates, 30 * 60 * 1000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const value = useMemo<LocaleContextType>(() => {
    const locale = toLocale(language);
    const digits = currency === "XOF" ? 0 : 2;
    const rates = fxRates || defaultRates;

    const formatNumber = (amount: number, curr: Currency, suffix?: string) => {
      const suffixStr = suffix || "";
      try {
        return `${new Intl.NumberFormat(locale, {
          style: "currency",
          currency: curr,
          maximumFractionDigits: digits,
          minimumFractionDigits: digits,
        }).format(amount)}${suffixStr}`;
      } catch {
        const symbol = currencySymbols[curr];
        const base = curr === "XOF" ? `${Math.round(amount).toLocaleString()} ${symbol}` : `${symbol}${amount.toFixed(2)}`;
        return `${base}${suffixStr}`;
      }
    };

    const formatPriceValue = (priceXOF: number, overrideRates?: LBMARates): number => {
      return convertAmount(priceXOF, "XOF", currency, overrideRates || rates);
    };

    const formatPrice = (priceXOF: number, overrideRates?: LBMARates): string => {
      const converted = convertAmount(priceXOF, "XOF", currency, overrideRates || rates);
      return formatNumber(converted, currency);
    };

    const formatCurrency = (priceXOF: number, suffix?: string, overrideRates?: LBMARates): string => {
      const converted = convertAmount(priceXOF, "XOF", currency, overrideRates || rates);
      return formatNumber(converted, currency, suffix);
    };

    const formatAmountValue = (amount: number, fromCurrency: Currency, overrideRates?: LBMARates): number => {
      return convertAmount(amount, fromCurrency, currency, overrideRates || rates);
    };

    const formatAmount = (amount: number, fromCurrency: Currency, suffix?: string, overrideRates?: LBMARates): string => {
      const converted = convertAmount(amount, fromCurrency, currency, overrideRates || rates);
      return formatNumber(converted, currency, suffix);
    };

    const getCurrencySymbol = (): string => {
      return currencySymbols[currency];
    };

    return {
      language,
      currency,
      source,
      manualOverride,
      detectedCountry,
      setLanguage,
      setCurrency,
      applyAutoLocaleFromCountry,
      t,
      formatPrice,
      formatCurrency,
      formatPriceValue,
      formatAmount,
      formatAmountValue,
      getCurrencySymbol,
    };
  }, [applyAutoLocaleFromCountry, currency, detectedCountry, fxRates, language, manualOverride, setCurrency, setLanguage, source]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used within a LocaleProvider");
  return context;
}

export const languageNames: Record<Language, string> = {
  en: "English",
  fr: "Fran\u00e7ais",
  ar: "\u0627\u0644\u0639\u0631\u0628\u064a\u0629",
};

export const currencyNames: Record<Currency, string> = {
  USD: "US Dollar ($)",
  EUR: "Euro (\u20ac)",
  GBP: "British Pound (\u00a3)",
  XOF: "CFA Franc (XOF)",
  GHS: "Ghana Cedi (GHS)",
  NGN: "Nigerian Naira (\u20a6)",
  KES: "Kenyan Shilling (KES)",
  AED: "UAE Dirham (AED)",
};

export const LOCALE_TRANSLATIONS = translations;



