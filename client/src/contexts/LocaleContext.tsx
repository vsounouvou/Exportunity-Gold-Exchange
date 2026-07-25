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
    return `مورّدة من جهات مرخّصة، وتباع عبر ${brand.name}`;
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
        ? "Unités d'or physique documentées • Lingots certifiés et scellés"
        : language === "ar"
          ? "وحدات ذهب مادي موثقة • سبائك معتمدة ومختومة"
          : "Certified physical gold units • Certified and sealed bullion";
    const proLabel =
      language === "ar"
        ? "مساحة المحترفين"
        : language === "fr"
          ? "Espace Pro"
          : "Professional Space";
    const retailTitle =
      language === "ar"
        ? "ذهب موثق"
        : language === "fr"
          ? "Or Estampillé"
          : "Certified Gold";
    return {
      "nav.dore": proLabel,
      "mode.wholesale": proLabel,
      "sections.doreLots.title": proLabel,
      "sections.doreLots.subtitle":
        language === "fr"
          ? "L'espace dédié aux professionnels de l'or : mines, négociants, maisons, fournisseurs et acheteurs qualifiés."
          : language === "ar"
            ? "مساحة مهنية للمناجم والتجار والموردين والمشترين المؤهلين."
            : "Professional gold counterparties, suppliers, and qualified buyer sourcing flows.",
      "buyer.panel.wholesaleDore.title": proLabel,
      "buyer.panel.wholesaleMarketplace.title": proLabel,
      "buyer.panel.wholesaleMarketplace.subtitle":
        language === "fr"
          ? "Mines, négociants, maisons, fournisseurs et acheteurs qualifiés."
          : language === "ar"
            ? "مناجم وتجار ومشترون مؤسسيون في مسار مهني منفصل."
          : "Mines, traders, maisons, suppliers, and qualified buyers.",
      "wholesale.preview.title":
        language === "fr"
          ? "Aperçu Espace Pro (accès contrôlé)"
          : language === "ar"
            ? "معاينة مساحة المحترفين (وصول مقيد)"
            : "Professional Space preview (restricted)",
      "wholesale.apply.accessButton":
        language === "fr"
          ? "Demander l'accès Espace Pro"
          : language === "ar"
            ? "طلب الوصول إلى مساحة المحترفين"
            : "Request Professional Space access",
      "nav.wallet":
        language === "fr"
          ? "Crédits d'achat"
          : language === "ar"
            ? "اعتمادات الشراء"
            : "Purchase Credits",
      "nav.investments":
        language === "fr"
          ? "Opportunités de sourcing"
          : language === "ar"
            ? "فرص التوريد"
            : "Sourcing opportunities",
      "sections.stamped.title": retailTitle,
      "buyer.panel.retailGold.title": retailTitle,
      "buyer.panel.retailGold.subtitle": bdoSubtitle,
      "investments.subtitle":
        language === "fr"
          ? "Permis cadastre vérifiés - signaux de sourcing et besoins opérationnels"
          : language === "ar"
            ? "تصاريح موثقة - إشارات توريد واحتياجات تشغيلية"
            : "Cadastre-verified permits - sourcing signals and operational needs",
      "investments.field.capitalRequired":
        language === "fr"
          ? "Besoin opérationnel estimé"
          : language === "ar"
            ? "الاحتياج التشغيلي التقديري"
            : "Estimated operational need",
      "investments.returnModel.rotationIndicative":
        language === "fr"
          ? "Modèle opérationnel indicatif"
          : language === "ar"
            ? "نموذج تشغيلي تقديري"
            : "Indicative operating model",
      "investments.actions.viewOpportunity":
        language === "fr"
          ? "Voir le signal"
          : language === "ar"
            ? "عرض الإشارة"
            : "View signal",
      "cadastre.claimRule":
        language === "fr"
          ? "Les permis doivent exister dans le cadastre officiel. Sans référence cadastre : pas de publication, pas de discussion, pas de demande professionnelle."
          : language === "ar"
            ? "يجب أن تكون التصاريح موجودة في السجل الرسمي. بدون مرجع سجل: لا نشر ولا محادثة ولا طلب مهني."
            : "Permits must exist in the official cadastre. No cadastre reference = no listing, no chat, no professional request.",
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
    "header.title": "Bourse de l’Or",
    "header.subtitle": "By Exportunity",
    "header.suppliers": "gold suppliers",
    "header.certified": "Certified Bureau d'Achat",
    "header.availableGold": "Available Gold",

    "nav.marketplace": "Marketplace",
    "nav.dore": "Doré",
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
    "wholesale.apply.step1.title": "Step 1 — Sign in",
    "wholesale.apply.step1.description": "Wholesale access is only available to verified accounts.",
    "wholesale.apply.step2.title": "Step 2 — Upload license",
    "wholesale.apply.step2.description": "Accepted: PDF / image. Issuing authority, type, and expiration are required.",
    "wholesale.apply.selectedFile": "Selected: {file}",
    "wholesale.apply.step3.title": "Step 3 — Submit for review",
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
    "common.submitting": "Submitting…",
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

    "buyer.panel.wholesaleDore.title": "Wholesale Doré Trading",
    "buyer.panel.wholesaleMarketplace.title": "Wholesale Marketplace",
    "buyer.panel.wholesaleMarketplace.subtitle": "Bulk purchasing, RFQs, and supplier coordination.",
    "buyer.panel.retailGold.title": "Stamped Gold",
    "buyer.panel.retailGold.subtitle": "Stamped investment gold units • Certified and sealed bullion pieces",
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
    "location.manual.subtitle": "If device location fails, choose your country/city and we’ll use it for nearby results.",
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
    "vault.signInToAccess": "Sign in to access your Purchase Credits and confirmed physical gold records.",
    "vault.description": "Purchase Credits and confirmed physical gold records, with delivery or storage confirmed separately.",
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
    "header.title": "Bourse de l’Or",
    "header.subtitle": "Par Exportunity",
    "header.suppliers": "fournisseurs d'or",
    "header.certified": "Bureau d'Achat certifi\u00e9",
    "header.availableGold": "Or disponible",

    "nav.marketplace": "Marché",
    "nav.dore": "Doré",
    "nav.machinery": "Machines minières",
    "nav.investments": "Opportunités d’investissement",

    "nav.account": "Compte",
    "nav.orders": "Commandes",
    "nav.contracts": "Contrats",
    "nav.map": "Carte",
    "nav.wallet": "Portefeuille",
    "nav.vault": "Coffre",
    "account.deliveryDashboard": "Tableau de livraison",
    "account.adminConsole": "Console admin",
    "account.signInToAccessOrdersAndWallet": "Connectez-vous pour accéder à vos commandes et à votre portefeuille.",

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
    "machinery.toast.buyRequestTitle": "Demande d’achat",
    "machinery.toast.buyRequestDescription": "Une demande d’achat a été créée.",
    "machinery.toast.financingRequestTitle": "Demande de financement",
    "machinery.toast.financingRequestDescription": "Nous vous contacterons sous peu.",
    "machinery.toast.deployTitle": "Déployer",
    "machinery.toast.deployDescription": "Le flux de déploiement arrive bientôt.",

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
    "wholesale.apply.dialogDescription": "Téléversez votre licence de trading pour demander un accès autorisé. Les contreparties et emplacements précis restent masqués jusqu’à approbation.",
    "wholesale.apply.step1.title": "Étape 1 — Se connecter",
    "wholesale.apply.step1.description": "L’accès au gros n’est disponible que pour les comptes vérifiés.",
    "wholesale.apply.step2.title": "Étape 2 — Téléverser la licence",
    "wholesale.apply.step2.description": "Accepté : PDF / image. L’autorité émettrice, le type et la date d’expiration sont requis.",
    "wholesale.apply.selectedFile": "Sélectionné : {file}",
    "wholesale.apply.step3.title": "Étape 3 — Soumettre pour examen",
    "wholesale.apply.step3.description": "L’accès est accordé uniquement après vérification et contrôles de conformité.",
    "wholesale.apply.status.approved": "Déjà approuvé",
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
    "cart.toast.updatedTitle": "Panier mis à jour",
    "cart.toast.quantityIncreased": "Quantité augmentée pour {product}",
    "cart.toast.couldNotAddTitle": "Impossible d’ajouter l’article",
    "cart.toast.couldNotAddDescription": "Ce produit n’est pas disponible pour le moment. Essayez de le sélectionner dans la liste.",
    "cart.toast.addedTitle": "Ajouté au panier",
    "cart.toast.addedDescription": "{product} a été ajouté à votre panier",
    "cart.toast.couldNotOpenTitle": "Impossible d’ouvrir le produit",
    "cart.toast.couldNotOpenDescription": "Veuillez sélectionner un produit dans la liste pour voir les détails.",

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
    "chat.failedToGetResponse": "Impossible d'obtenir une réponse",

    "assistantDock.title": "Assistant du Chairman",
    "assistantDock.allCompanies": "Toutes les entreprises",
    "assistantDock.thinking": "Réflexion",
    "assistantDock.voiceResponseReady.title": "Réponse vocale prête",
    "assistantDock.voiceResponseReady.description": "Cliquez sur l’icône de volume pour activer la lecture audio",
    "assistantDock.conversationSummary": "Résumé de la conversation",
    "assistantDock.keyDecisions": "Décisions clés :",
    "assistantDock.actionItems": "Actions :",
    "assistantDock.loadOlder": "Charger les messages plus anciens",
    "assistantDock.emptyTitle": "Votre assistant stratégique",
    "assistantDock.emptyDescription": "Je me souviens de nos conversations et j’apprends des décisions passées. Demandez-moi n’importe quoi !",
    "assistantDock.viewThinkingProcess": "Voir le raisonnement",
    "assistantDock.internalReasoning": "Raisonnement interne",
    "assistantDock.jumpToLatest": "Aller au plus récent",
    "assistantDock.placeholder": "Demandez à votre assistant...",
    "assistantDock.historicalNote": "Conversation historique. Revenez à la session du jour pour envoyer des messages.",
    "assistantDock.failedToSend": "Échec de l’envoi du message",

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
    "common.updated": "mis à jour",
    "common.view": "Voir",
    "common.viewDetails": "Voir les détails",
    "common.viewCatalog": "Voir le catalogue",
    "common.contactWhatsapp": "Contacter (WhatsApp)",
    "common.deploy": "Déployer",

    "wizard.toast.checkStepTitle": "Vérifiez cette étape",
    "wizard.toast.submittedTitle": "Envoyé",
    "wizard.toast.submittedDescription": "Votre demande a été envoyée avec succès.",
    "wizard.toast.submitFailedTitle": "Échec de l’envoi",
    "wizard.error.uploadRequired": "Veuillez téléverser le document requis.",
    "wizard.error.completeStep": "Veuillez compléter cette étape avant de continuer.",
    "wizard.error.answerToContinue": "Veuillez répondre pour continuer.",
    "wizard.error.selectOptionToContinue": "Sélectionnez une option pour continuer.",
    "wizard.label.uploadedPrefix": "Téléversé:",
    "wizard.label.done": "Terminé",
    "wizard.file.reuploadWarning": "Vous aviez sélectionné un fichier, mais il doit être téléversé à nouveau après un rafraîchissement avant l’envoi.",

    "auth.verificationRequired": "Vérification requise",
    "auth.signInToAccessExportunity": "Connectez-vous pour accéder à Exportunity",
    "auth.completeVerificationToUnlockExportunity": "Complétez la vérification de base pour débloquer Exportunity (Marketplace + Gros).",
    "auth.exportunityRequiresVerifiedAccount": "Exportunity nécessite un compte vérifié pour parcourir et effectuer des transactions.",
    "auth.startVerification": "Démarrer la vérification",
    "auth.signedOutTitle": "Déconnecté",
    "auth.signedOutDescription": "Vous avez été déconnecté.",

    "units.km": "km",

    "pro.space": "Espace Pro",
    "pro.app.title": "App Pro",
    "pro.app.scanToOpen": "Scannez pour ouvrir :",
    "pro.app.qrAlt": "QR App Pro",

    "buyer.expandTo": "Étendre à",
    "buyer.expandRadius": "Étendre le rayon",
    "buyer.exploreAll": "Explorer tout",
    "buyer.noProducts.titleGold": "Aucun produit trouvé",
    "buyer.noProducts.titleGeneral": "Aucun produit à proximité",
    "buyer.noProducts.titleGlobal": "Aucun produit disponible",
    "buyer.noProducts.desc.loadError": "Impossible de charger les produits pour le moment. Veuillez réessayer.",
    "buyer.noProducts.desc.category": "Aucun produit ne correspond à cette catégorie. Effacez les filtres ou étendez le rayon.",
    "buyer.noProducts.desc.noSellers": "Aucun vendeur disponible dans cette zone. Définissez votre localisation ou étendez le rayon.",
    "buyer.noProducts.desc.sellersNoProducts": "Des vendeurs sont proches, mais aucun produit n’est publié. Réessayez plus tard ou changez de catégorie.",
    "buyer.noProducts.desc.generic": "Essayez d’étendre le rayon ou de définir votre localisation pour de meilleurs résultats.",
    "buyer.categories.scrollLeft": "Defiler les categories vers la gauche",
    "buyer.categories.scrollRight": "Defiler les categories vers la droite",
    "buyer.categories.showingClosestItems": "Affichage des articles les plus proches (aucun vendeur dans un rayon de {radiusKm} {unit}).",
    "buyer.categories.scrollForMore": "Defiler pour plus de categories.",
    "buyer.categories.noItemsFallback": "Aucun article dans cette catégorie pour le moment. Affichage de tous les produits.",
    "buyer.feed.expandingGold": "Élargissement de la recherche d’or autour de vous.",
    "buyer.feed.expandingGeneral": "Élargissement de la recherche d’articles autour de vous.",

    "buyer.panel.wholesaleDore.title": "Doré en gros",
    "buyer.panel.wholesaleMarketplace.title": "Marché de gros",
    "buyer.panel.wholesaleMarketplace.subtitle": "Achats en volume, demandes de devis et coordination fournisseurs.",
    "buyer.panel.retailGold.title": "Or estampé",
    "buyer.panel.retailGold.subtitle": "Unités d'or d'investissement estampées • Lingots certifiés et scellés",
    "buyer.panel.retailNearby.title": "Marketplace à proximité",
    "buyer.panel.retailNearby.subtitle": "Vente locale, paiement rapide et livraison.",

    "location.set": "Définir la localisation",
    "location.setToSeeDistance": "Définissez la localisation pour voir la distance",

    "admin.addProduct": "Ajouter un produit",
    "admin.noProducts.desc.addProduct": "Ajoutez un produit pour remplir cette section.",
    "admin.seedInventory": "Générer un inventaire",
    "admin.seedFailed": "Échec de génération",
    "admin.seededInventory.title": "Inventaire généré",

    "cart.emptyHelp": "Parcourez le flux pour ajouter des produits et des lots d’or.",
    "cart.multipleShops.title": "Plusieurs boutiques détectées",
    "cart.multipleShops.description": "Veuillez commander auprès d’une seule boutique à la fois. Retirez les articles des autres boutiques.",

    "location.locating": "Localisation...",
    "location.enable": "Activer la localisation",
    "location.unavailable": "Localisation indisponible",
    "location.approx.title": "Localisation approximative",
    "location.approx.description": "Impossible d'obtenir une localisation GPS précise. Nous affichons des résultats proches à partir d'une localisation approximative.",
    "location.approx.label": "Approx.",
    "location.toast.title": "Localisation nécessaire",
    "location.toast.description": "Autorisez la localisation pour voir les vendeurs autour de vous.",
    "location.title": "Localisation",
    "location.subtitle": "La plateforme peut utiliser votre localisation et la mettre à jour pendant votre navigation.",
    "location.status.updating": "Mise à jour de la localisation...",
    "location.status.off": "Localisation désactivée",
    "location.status.active": "Localisation active",
    "location.status.nearbyGps": "Près de vous (GPS)",
    "location.status.nearbyApprox": "Près de vous (Approx.)",
    "location.status.denied": "Autorisation de localisation bloquée",
    "location.status.unavailable": "Localisation non disponible",
    "location.status.error": "Erreur de localisation",
    "location.help.secureContext": "La localisation nécessite HTTPS. Ouvrez le site en https puis réessayez.",
    "location.help.denied": "Activez la localisation dans les paramètres du navigateur, puis appuyez sur Réessayer.",
    "location.help.iosPwa": "Sur iOS, la localisation peut être bloquée dans l’app installée. Ouvrez dans Safari, autorisez la localisation, puis appuyez sur Réessayer.",
    "location.help.unavailable": "Votre navigateur/appareil ne prend pas en charge la localisation.",
    "location.help.requesting": "En attente de la réponse GPS de votre navigateur.",
    "location.help.active": "Votre localisation se met à jour automatiquement tant que cette page est ouverte.",
    "location.help.timeout": "Le GPS met trop de temps. Réessayez ou utilisez une localisation manuelle/approximative.",
    "location.help.positionUnavailable": "Le GPS ne parvient pas à déterminer votre position. Réessayez ou utilisez une localisation manuelle/approximative.",
    "location.help.errorGeneric": "Impossible de déterminer votre localisation. Réessayez ou utilisez une localisation manuelle/approximative.",
    "location.lastUpdate": "Dernière mise à jour :",
    "location.radius.title": "Rayon de proximité",
    "location.radius.subtitle": "Définit jusqu’où nous cherchons des vendeurs proches.",
    "location.manual.title": "Définir manuellement la localisation",
    "location.manual.subtitle": "Si la localisation échoue, choisissez votre ville et nous l’utiliserons pour les résultats à proximité.",
    "location.manual.country": "Pays",
    "location.manual.region": "Région",
    "location.manual.city": "Ville",
    "location.manual.use": "Utiliser la localisation sélectionnée",
    "location.manual.toast.title": "Choisissez une ville",
    "location.manual.toast.description": "Choisissez un pays, une région et une ville pour définir votre localisation manuellement.",
    "location.manual.noGps.title": "Ville sans coordonnées GPS",
    "location.manual.noGps.description": "Veuillez choisir une autre ville ou activer la localisation de l’appareil.",
    "location.retry": "Réessayer la localisation",

    "wallet.title": "Mon portefeuille",
    "wallet.availableBalance": "Solde disponible",
    "wallet.deposited": "Déposé",
    "wallet.spent": "Dépensé",
    "wallet.sendHint": "Envoyez des crédits instantanément via nom d’utilisateur, téléphone ou QR code — gratuit !",
    "wallet.saveWalletSuffix": "pour sauvegarder votre portefeuille",
    "wallet.deposit": "Déposer",
    "wallet.depositAmount": "Montant",
    "wallet.depositSuccess": "Dépôt effectué",
    "wallet.depositSuccessDetail": "Votre portefeuille a été crédité.",
    "wallet.depositFailed": "Échec du dépôt",

    "vault.title": "Mon coffre",
    "vault.totalGold": "Or total",
    "vault.units": "Unités d’or",
    "vault.signInToAccess": "Connectez-vous pour accéder à vos crédits d’achat et dossiers d’or physique confirmés.",
    "vault.description": "Crédits d’achat et dossiers d’or physique confirmés, avec livraison ou stockage confirmés séparément.",
    "vault.noUnits": "Aucune unité d’or pour le moment.",
    "vault.status": "Statut",
    "vault.locked": "VERROUILLÉ",
    "vault.available": "DISPONIBLE",
    "vault.lockupEnds": "Fin du verrouillage",
    "vault.buyUnits": "Acheter des unités d’or",
    "vault.buyUnitsDescription": "Choisissez une unité standard (en grammes) puis confirmez l’achat.",
    "vault.unitSize": "Taille de l’unité",
    "vault.deliveryChoice": "Livraison",
    "vault.storeInVault": "Stocker au coffre",
    "vault.deliveryNow": "Livrer maintenant",
    "vault.lockupLabel": "Ne pas livrer avant",
    "vault.lockupHelp": "Optionnel : bloque la livraison jusqu’à cette date.",
    "vault.confirmPurchase": "Confirmer l’achat",
    "vault.pricingAtPurchase": "Le prix est fixé au moment de l’achat (snapshot).",
    "vault.purchaseSuccess": "Achat confirmé",
    "vault.purchaseSuccessDetail": "Votre unité d’or a été ajoutée à votre coffre.",
    "vault.purchaseFailed": "Échec de l’achat",
    "vault.requestDelivery": "Demander la livraison",
    "vault.deliveryRequested": "Livraison demandée",
    "vault.deliveryRequestedDetail": "Votre demande a été enregistrée.",
    "vault.deliveryRequestFailed": "Échec de la demande de livraison",
    "vault.authorizeResale": "Autoriser la revente",
    "vault.resaleAuthorized": "Revente autorisée",
    "vault.resaleAuthorizedDetail": "Vous pouvez maintenant créer une annonce sur le marché secondaire.",
    "vault.resaleAuthorizeFailed": "Échec de l’autorisation de revente",
    "vault.listForResale": "Mettre en vente",
    "vault.listingCreated": "Annonce créée",
    "vault.listingCreatedDetail": "Votre unité est listée pour les clients confirmés.",
    "vault.listingCreateFailed": "Échec de création d’annonce",

    "secondaryMarket.title": "Marché secondaire",
    "secondaryMarket.description": "Réservé aux clients confirmés. Les achats se règlent via le portefeuille.",
    "secondaryMarket.restricted": "Accès réservé aux clients confirmés.",
    "secondaryMarket.empty": "Aucune annonce pour le moment.",
    "secondaryMarket.listing": "Annonce",
    "secondaryMarket.visibleToConfirmed": "Visible uniquement aux clients confirmés",
    "secondaryMarket.buy": "Acheter",
    "secondaryMarket.purchaseSuccess": "Achat réussi",
    "secondaryMarket.purchaseSuccessDetail": "L’unité a été transférée dans votre coffre.",
    "secondaryMarket.purchaseFailed": "Échec de l’achat",

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
    "feed.aroundYou.title": "قريب منك الآن",
    "feed.aroundYou.subtitle": "اكتشافات جديدة بالقرب منك",
    "feed.popular.title": "أفضل الاختيارات من المتاجر القريبة",
    "feed.popular.subtitle": "شائع لدى المحليين",

    "sections.doreLots.title": "دفعات دوريه",
    "sections.doreLots.subtitle": "مورّدة من جهات مرخّصة، ومباعة عبر Bourse de l’Or",
    "sections.stamped.title": "سبائك مختومة (10غ+)",
    "sections.stamped.subtitle": "وحدات ذهب مختومة، معتمدة ومختومة",
    "sections.jewelry.title": "مجوهرات",
    "sections.jewelry.subtitle": "مجوهرات مختارة من صُنّاع موثوقين",
    "sections.goldArt.title": "قطع فنية ذهبية",
    "sections.goldArt.subtitle": "قطع فنية ومقتنيات للجامعين",

    "cart.subtotal": "المجموع الفرعي",
    "cart.delivery": "التوصيل",

    "units.month": "شهر",
    "units.months": "أشهر",
    "units.year": "سنة",
    "units.years": "سنوات",
    "units.kg": "كغ",
    "units.kgPerMonth": "كغ/شهر",

    "investments.subtitle": "مناجم موثّقة — مشاركة في الإنتاج",
    "investments.searchPlaceholder": "ابحث عن فرص…",
    "investments.listMine": "أدرج منجمك",
    "investments.empty": "لا توجد فرص تطابق عوامل التصفية.",
    "investments.badge.verifiedMine": "منجم مرخّص (موثّق)",
    "investments.snapshot.title": "ملخّص المنجم",
    "investments.field.licenseActiveSince": "الرخصة سارية منذ",
    "investments.field.currentCapacity": "القدرة الحالية",
    "investments.field.historicalProduction": "الإنتاج التاريخي",
    "investments.field.remainingPotential": "الإمكانات المتبقية",
    "investments.field.capitalRequired": "رأس المال المطلوب",
    "investments.field.duration": "المدة",
    "investments.historical.totalSuffix": "إجمالي",
    "investments.historical.last12m": "آخر 12 شهرًا",
    "investments.atCurrentRate": "بالوتيرة الحالية",
    "investments.potential.low": "منخفض",
    "investments.potential.medium": "متوسط",
    "investments.potential.high": "مرتفع",
    "investments.returnModel.rotationIndicative": "العائد لكل دورة (تقديري)",
    "investments.actions.viewOpportunity": "عرض الفرصة",
    "investments.actions.viewMachinery": "عرض المعدّة",

    "cadastre.badgeVerified": "تحقق الكادستر",
    "cadastre.permit": "ترخيص الكادستر",
    "cadastre.permitId": "رقم الترخيص",
    "cadastre.permitType": "نوع الترخيص",
    "cadastre.permitStatus": "حالة الترخيص",
    "cadastre.commodity": "المعدن",
    "cadastre.region": "الموقع",
    "cadastre.sourceLink": "مصدر الكادستر الرسمي",
    "cadastre.sectionTitle": "مرجع الكادستر",
    "cadastre.missing": "مرجع الكادستر مفقود — لا يمكن عرض الفرصة.",
    "cadastre.unavailable": "بيانات الكادستر غير متاحة لهذا البلد. تم تعطيل الاستثمار.",
    "cadastre.claimCta": "اطلب ترخيص كادستر",
    "cadastre.claimTitle": "اطلب ترخيص كادستر",
    "cadastre.claimDescription": "اختر ترخيصاً من الكادستر الرسمي. لا إدخال يدوي للمناجم.",
    "cadastre.claimRule": "يجب أن تكون التراخيص موجودة في الكادستر الرسمي. بدون مرجع = لا عرض ولا دردشة ولا استثمار.",
    "cadastre.searchPlaceholder": "ابحث برقم الترخيص أو اسم المالك أو المنطقة",
    "cadastre.allCountries": "جميع الدول (الكادستر)",
    "cadastre.noResults": "لا توجد تراخيص مطابقة للبحث.",
    "cadastre.selectedPermit": "الترخيص المختار",
    "cadastre.proofLabel": "إثبات الصلاحية",
    "cadastre.proofSelected": "تم الاختيار: {file}",
    "cadastre.claimNote": "ملاحظة الطلب (اختياري)",
    "cadastre.claimNotePlaceholder": "أضف ملاحظات التحقق…",
    "cadastre.selectPrompt": "اختر ترخيص كادستر أولاً.",
    "cadastre.proofRequired": "إثبات الصلاحية مطلوب.",
    "cadastre.claimSubmit": "إرسال الطلب",
    "cadastre.claimSubmitted": "تم إرسال الطلب",
    "cadastre.claimSubmittedDesc": "ستتم مراجعة المستندات قبل التفعيل.",
    "cadastre.claimRequired": "مطلوب مطالبة الكادستر",

    "machinery.category.extraction": "استخراج",
    "machinery.category.processing": "معالجة",
    "machinery.category.support": "دعم",
    "machinery.category.mobility": "تنقّل",
    "machinery.category.spare_parts": "قطع غيار",
    "machinery.condition.new": "جديد",
    "machinery.condition.refurbished": "مجدّد",
    "machinery.condition.used": "مستعمل",
    "machinery.status.in_stock": "متوفر",
    "machinery.status.built_to_order": "حسب الطلب",
    "machinery.status.used": "مستعمل",
    "machinery.status.reserved": "محجوز",
    "machinery.status.unavailable": "غير متوفر",
    "seller.type.manufacturer": "مصنّع",
    "seller.type.authorized_representative": "ممثل معتمد",
    "seller.type.owner_resale": "إعادة بيع المالك (مستعمل)",
    "machinery.soldBy": "يباع بواسطة:",
    "machinery.financingAvailable": "تمويل متاح",
    "machinery.requestFinancing": "طلب تمويل",
    "machinery.toast.buyRequestTitle": "طلب شراء",
    "machinery.toast.buyRequestDescription": "تم إنشاء طلب شراء.",
    "machinery.toast.financingRequestTitle": "طلب تمويل",
    "machinery.toast.financingRequestDescription": "سنتواصل معك قريبًا.",
    "machinery.toast.deployTitle": "نشر",
    "machinery.toast.deployDescription": "ميزة النشر قادمة قريبًا.",

    "product.sellerType.wholesaleSupplier": "مورّد دوريه (جملة)",
    "product.sellerType.jewelryManufacturer": "مصنّع مجوهرات",
    "product.sellerType.retailSeller": "بائع ذهب (تجزئة)",
    "product.pricing.lbma": "تسعير مرجعي LBMA",
    "product.pricing.curated": "تسعير مشغل مختار",
    "product.certificationsCompliance": "الشهادات والامتثال",
    "product.favorites.savedTitle": "تمت الإضافة إلى المفضلة",
    "product.favorites.savedDescription": "تمت الإضافة إلى مفضّلتك",
    "product.addedToOrder": "تمت الإضافة إلى الطلب",
    "header.title": "Bourse de l’Or",
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

    "chat.welcome": "ماذا تبحث عنه؟",
    "chat.continueToConcierge": "\u0645\u062a\u0627\u0628\u0639\u0629 \u0625\u0644\u0649 \u0627\u0644\u0645\u0633\u0627\u0639\u062f",
    "chat.openConcierge": "\u0641\u062a\u062d \u0627\u0644\u0645\u0633\u0627\u0639\u062f",
    "chat.goldOnlyLabel": "\u0630\u0647\u0628 \u0641\u0642\u0637",
    "chat.placeholder": "اسأل أي شيء عن الذهب...",
    "chat.placeholderFull": "اسأل أي شيء عن الذهب...",

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

    "chat.placeholderWholesalePreviewMobile": "اسأل أي شيء عن الذهب...",
    "chat.placeholderWholesalePreview": "اسأل أي شيء عن الذهب...",
    "chat.placeholderWholesaleMobile": "اسأل أي شيء عن الذهب...",
    "chat.placeholderWholesale": "اسأل أي شيء عن الذهب...",
    "chat.failedToGetResponse": "تعذر الحصول على رد",

    "assistantDock.title": "مساعد الرئيس",
    "assistantDock.allCompanies": "كل الشركات",
    "assistantDock.thinking": "تفكير",
    "assistantDock.voiceResponseReady.title": "الرد الصوتي جاهز",
    "assistantDock.voiceResponseReady.description": "انقر على أيقونة الصوت لتفعيل التشغيل الصوتي",
    "assistantDock.conversationSummary": "ملخص المحادثة",
    "assistantDock.keyDecisions": "القرارات الرئيسية:",
    "assistantDock.actionItems": "عناصر العمل:",
    "assistantDock.loadOlder": "تحميل رسائل أقدم",
    "assistantDock.emptyTitle": "مساعدك الاستراتيجي",
    "assistantDock.emptyDescription": "أتذكر محادثاتنا وأتعلم من القرارات السابقة. اسألني أي شيء!",
    "assistantDock.viewThinkingProcess": "عرض طريقة التفكير",
    "assistantDock.internalReasoning": "المنطق الداخلي",
    "assistantDock.jumpToLatest": "الانتقال إلى الأحدث",
    "assistantDock.placeholder": "اسأل مساعدك...",
    "assistantDock.historicalNote": "محادثة سابقة. عد إلى جلسة اليوم لإرسال الرسائل.",
    "assistantDock.failedToSend": "تعذر إرسال الرسالة",

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
    "location.approx.title": "استخدام موقع تقريبي",
    "location.approx.description": "تعذّر الحصول على موقع GPS دقيق. سنعرض نتائج قريبة باستخدام موقع تقريبي.",
    "location.approx.label": "تقريبي",
    "location.toast.title": "\u0627\u0644\u0645\u0648\u0642\u0639 \u0645\u0637\u0644\u0648\u0628",
    "location.toast.description": "\u0627\u0633\u0645\u062d \u0628\u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0627\u0644\u0645\u0648\u0642\u0639 \u0644\u0631\u0624\u064a\u0629 \u0627\u0644\u0628\u0627\u0626\u0639\u064a\u0646 \u0628\u0627\u0644\u0642\u0631\u0628 \u0645\u0646\u0643.",
    "location.title": "\u0627\u0644\u0645\u0648\u0642\u0639",
    "location.subtitle": "\u064a\u0645\u0643\u0646 \u0644\u0644\u0645\u0646\u0635\u0629 \u0627\u0633\u062a\u062e\u062f\u0627\u0645 \u0645\u0648\u0642\u0639 \u062c\u0647\u0627\u0632\u0643 \u0648\u062a\u062d\u062f\u064a\u062b\u0647 \u0623\u062b\u0646\u0627\u0621 \u0627\u0644\u062a\u0635\u0641\u062d.",
    "location.status.updating": "\u062c\u0627\u0631\u064d \u062a\u062d\u062f\u064a\u062b \u0627\u0644\u0645\u0648\u0642\u0639...",
    "location.status.off": "الموقع متوقف",
    "location.status.active": "\u0627\u0644\u0645\u0648\u0642\u0639 \u0646\u0634\u0637",
    "location.status.nearbyGps": "قريب منك (GPS)",
    "location.status.nearbyApprox": "قريب منك (تقريبي)",
    "location.status.denied": "\u062a\u0645 \u062d\u0638\u0631 \u0625\u0630\u0646 \u0627\u0644\u0645\u0648\u0642\u0639",
    "location.status.unavailable": "\u062e\u062f\u0645\u0627\u062a \u0627\u0644\u0645\u0648\u0642\u0639 \u063a\u064a\u0631 \u0645\u062a\u0627\u062d\u0629",
    "location.status.error": "\u062e\u0637\u0623 \u0641\u064a \u0627\u0644\u0645\u0648\u0642\u0639",
    "location.help.secureContext": "يتطلب تحديد الموقع استخدام HTTPS. افتح الموقع عبر https ثم أعد المحاولة.",
    "location.help.denied": "\u0641\u0639\u0651\u0644 \u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0627\u0644\u0645\u0648\u0642\u0639 \u0645\u0646 \u0625\u0639\u062f\u0627\u062f\u0627\u062a \u0627\u0644\u0645\u062a\u0635\u0641\u062d \u062b\u0645 \u0627\u0636\u063a\u0637 \u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629.",
    "location.help.iosPwa": "على iOS قد يُحظر الموقع داخل التطبيق المثبّت. افتح في Safari واسمح بالموقع، ثم اضغط إعادة المحاولة.",
    "location.help.unavailable": "\u0645\u062a\u0635\u0641\u062d\u0643/\u062c\u0647\u0627\u0632\u0643 \u0644\u0627 \u064a\u062f\u0639\u0645 \u062e\u062f\u0645\u0627\u062a \u0627\u0644\u0645\u0648\u0642\u0639.",
    "location.help.requesting": "\u0628\u0627\u0646\u062a\u0638\u0627\u0631 \u0627\u0633\u062a\u062c\u0627\u0628\u0629 GPS \u0645\u0646 \u0627\u0644\u0645\u062a\u0635\u0641\u062d.",
    "location.help.active": "\u064a\u062a\u0645 \u062a\u062d\u062f\u064a\u062b \u0645\u0648\u0642\u0639\u0643 \u062a\u0644\u0642\u0627\u0626\u064a\u064b\u0627 \u0623\u062b\u0646\u0627\u0621 \u0628\u0642\u0627\u0621 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062d\u0629 \u0645\u0641\u062a\u0648\u062d\u0629.",
    "location.help.timeout": "يستغرق GPS وقتًا طويلاً. أعد المحاولة أو استخدم موقعًا يدويًا/تقريبيًا.",
    "location.help.positionUnavailable": "لا يمكن لـ GPS تحديد موقعك. أعد المحاولة أو استخدم موقعًا يدويًا/تقريبيًا.",
    "location.help.errorGeneric": "تعذّر تحديد موقعك. أعد المحاولة أو استخدم موقعًا يدويًا/تقريبيًا.",
    "location.lastUpdate": "\u0622\u062e\u0631 \u062a\u062d\u062f\u064a\u062b:",
    "location.radius.title": "نطاق القرب",
    "location.radius.subtitle": "يحدد مدى البحث عن البائعين القريبين.",
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
    "wholesale.preview.accessRequired": "مطلوب وصول معتمد",
    "wholesale.preview.hiddenUntilApproval": "يتم إخفاء الجهات المقابلة والمواقع الدقيقة وتدفقات التداول حتى الموافقة.",
    "wholesale.preview.requestPending": "الطلب قيد الانتظار",
    "wholesale.apply.accessButton": "طلب الوصول للجملة",
    "wholesale.apply.dialogTitle": "طلب شريك بالجملة",
    "wholesale.apply.dialogDescription": "ارفع رخصة التداول لطلب وصول معتمد. تظل الجهات المقابلة والمواقع الدقيقة مخفية حتى الموافقة.",
    "wholesale.apply.step1.title": "الخطوة 1 — تسجيل الدخول",
    "wholesale.apply.step1.description": "الوصول للجملة متاح فقط للحسابات الموثّقة.",
    "wholesale.apply.step2.title": "الخطوة 2 — رفع الرخصة",
    "wholesale.apply.step2.description": "مقبول: PDF / صورة. الجهة المُصدِرة والنوع وتاريخ الانتهاء مطلوبة.",
    "wholesale.apply.selectedFile": "تم اختيار: {file}",
    "wholesale.apply.step3.title": "الخطوة 3 — إرسال للمراجعة",
    "wholesale.apply.step3.description": "يتم منح الوصول فقط بعد التحقق وفحوصات الامتثال.",
    "wholesale.apply.status.approved": "تمت الموافقة بالفعل",
    "wholesale.apply.submitApplication": "إرسال الطلب",
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
  const isFrenchXofPriorityTenant = tenantKey === "bdo" || tenantKey === "agoojye";
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

  // Bourse de l'Or and AGOOJIYE are French-first + XOF-first unless the user explicitly selected a preference.
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



