#!/usr/bin/env python3
"""Build a source-attributed Exportunity lead research batch from OpenStreetMap.

This temporary script performs research only. It never sends outreach, creates
accounts, purchases data, or marks a company as commercially verified.
"""

from __future__ import annotations

import csv
import hashlib
import json
import random
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

OUTPUT_DIR = Path("out")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter",
]

COUNTRIES: dict[str, dict[str, Any]] = {
    "Benin": {
        "code": "BJ",
        "quota": 700,
        "language": "French",
        "markets": [
            ("Greater Cotonou / Abomey-Calavi", (6.30, 2.10, 6.58, 2.58)),
            ("Porto-Novo", (6.38, 2.48, 6.60, 2.72)),
            ("Parakou", (9.25, 2.50, 9.48, 2.82)),
            ("Abomey-Bohicon", (7.10, 1.88, 7.36, 2.25)),
            ("Natitingou", (10.23, 1.28, 10.46, 1.57)),
            ("Djougou", (9.55, 1.52, 9.88, 1.92)),
            ("Lokossa", (6.55, 1.58, 6.75, 1.83)),
        ],
    },
    "Côte d'Ivoire": {
        "code": "CI",
        "quota": 700,
        "language": "French",
        "markets": [
            ("Greater Abidjan", (5.15, -4.25, 5.58, -3.68)),
            ("Bouaké", (7.52, -5.22, 7.92, -4.82)),
            ("Yamoussoukro", (6.68, -5.48, 7.02, -5.08)),
            ("San-Pédro", (4.52, -6.90, 4.98, -6.38)),
            ("Korhogo", (9.28, -5.82, 9.68, -5.32)),
            ("Daloa", (6.72, -6.68, 7.08, -6.22)),
            ("Man", (7.22, -7.78, 7.58, -7.35)),
            ("Abengourou", (6.55, -3.75, 6.92, -3.28)),
        ],
    },
    "United Arab Emirates": {
        "code": "AE",
        "quota": 800,
        "language": "English",
        "markets": [
            ("Dubai", (24.75, 54.85, 25.46, 55.72)),
            ("Abu Dhabi", (24.12, 54.10, 24.70, 54.95)),
            ("Sharjah / Ajman", (25.18, 55.22, 25.65, 55.90)),
            ("Al Ain", (23.92, 55.30, 24.48, 56.08)),
            ("Ras Al Khaimah", (25.52, 55.68, 26.24, 56.25)),
            ("Fujairah", (24.90, 56.10, 25.50, 56.55)),
            ("Umm Al Quwain", (25.42, 55.40, 25.82, 55.88)),
        ],
    },
}

AMENITIES = (
    "bank|bureau_de_change|restaurant|cafe|fast_food|fuel|clinic|hospital|"
    "pharmacy|marketplace|car_rental|car_wash|school|college|university|"
    "kindergarten|events_venue|conference_centre|cinema|theatre|coworking_space"
)
TOURISM = "hotel|guest_house|hostel|motel|resort"
SKIP_OFFICES = {
    "government", "diplomatic", "political_party", "religion", "administrative"
}
GENERIC_NAMES = {
    "shop", "store", "market", "restaurant", "pharmacy", "hotel", "garage",
    "cafe", "café", "supermarket", "boutique", "bank", "school", "clinic",
}

HEADERS = [
    "Lead ID", "Company / Establishment", "Country", "Market / City",
    "State / Emirate / Region", "Primary Sector", "Detailed Activity",
    "Likely Exportunity Role", "Qualification Score", "Priority Tier",
    "Fit Rationale", "Target Decision-Maker", "Named Decision-Maker",
    "Public Phone", "Public Email", "Website", "Other Public Contact",
    "Address", "Latitude", "Longitude", "OSM Type", "OSM ID",
    "Source Dataset", "Source URL", "Source Retrieved UTC",
    "Contact Completeness", "Contact Verification", "Commercial Verification",
    "Review Status", "Outreach Status", "Recommended Next Action",
    "Suggested Give-First Asset", "Language", "Notes",
]


def canon(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def clean(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def first_tag(tags: dict[str, Any], keys: list[str]) -> str:
    for key in keys:
        value = clean(tags.get(key))
        if value:
            return value
    return ""


def make_query(bbox: tuple[float, float, float, float]) -> str:
    south, west, north, east = bbox
    b = f"({south},{west},{north},{east})"
    return f'''[out:json][timeout:120][maxsize:536870912];
(
  nwr["name"]["shop"]{b};
  nwr["name"]["office"]{b};
  nwr["name"]["craft"]{b};
  nwr["name"]["industrial"]{b};
  nwr["name"]["amenity"~"{AMENITIES}"]{b};
  nwr["name"]["tourism"~"{TOURISM}"]{b};
  nwr["name"]["healthcare"]{b};
  nwr["name"]["man_made"="works"]{b};
);
out center 1800;'''


def fetch_overpass(query: str, label: str) -> list[dict[str, Any]]:
    payload = urllib.parse.urlencode({"data": query}).encode("utf-8")
    errors: list[str] = []
    for attempt in range(8):
        endpoint = OVERPASS_ENDPOINTS[attempt % len(OVERPASS_ENDPOINTS)]
        req = urllib.request.Request(
            endpoint,
            data=payload,
            headers={
                "User-Agent": "Exportunity-public-research/1.0",
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=180) as response:
                raw = response.read()
            if not raw.lstrip().startswith(b"{"):
                raise RuntimeError(f"non-JSON response ({raw[:80]!r})")
            data = json.loads(raw.decode("utf-8"))
            elements = data.get("elements") or []
            print(f"{label}: {len(elements)} OSM elements from {endpoint}", flush=True)
            return elements
        except Exception as exc:  # network services can be temporarily busy
            errors.append(f"{endpoint}: {type(exc).__name__}: {exc}")
            delay = min(40, 4 + attempt * 5) + random.random()
            print(f"{label}: retry {attempt + 1}/8 after {errors[-1]}; sleep {delay:.1f}s", flush=True)
            time.sleep(delay)
    raise RuntimeError(f"Overpass failed for {label}: {' | '.join(errors)}")


def infer_sector(tags: dict[str, Any]) -> tuple[str, str]:
    industrial = clean(tags.get("industrial"))
    craft = clean(tags.get("craft"))
    shop = clean(tags.get("shop"))
    office = clean(tags.get("office"))
    amenity = clean(tags.get("amenity"))
    tourism = clean(tags.get("tourism"))
    healthcare = clean(tags.get("healthcare"))
    man_made = clean(tags.get("man_made"))

    detail = industrial or craft or shop or office or amenity or tourism or healthcare or man_made or "commercial establishment"
    detail = detail.replace("_", " ").title()

    joined = " ".join([industrial, craft, shop, office, amenity, tourism, healthcare, man_made]).lower()
    if industrial or man_made == "works" or any(k in joined for k in ["factory", "manufacturer", "manufacturing"]):
        return "Manufacturing & Industry", detail
    if any(k in joined for k in ["wholesale", "trade", "trading", "distributor"]):
        return "Wholesale, Distribution & Trade", detail
    if any(k in joined for k in ["logistics", "transport", "shipping", "freight", "warehouse", "courier"]):
        return "Logistics & Transport", detail
    if any(k in joined for k in ["construction", "hardware", "building", "carpenter", "electrician", "plumber", "metal", "welding"]):
        return "Construction & Industrial Services", detail
    if any(k in joined for k in ["farm", "agric", "garden", "dairy", "butcher", "seafood", "fish", "beverages", "food"]):
        return "Agriculture, Food & Beverage", detail
    if tourism or amenity in {"restaurant", "cafe", "fast_food", "events_venue", "conference_centre"}:
        return "Hospitality, Tourism & Food Service", detail
    if healthcare or amenity in {"clinic", "hospital", "pharmacy"}:
        return "Healthcare & Pharmaceuticals", detail
    if amenity in {"school", "college", "university", "kindergarten"}:
        return "Education & Training", detail
    if amenity in {"bank", "bureau_de_change"} or any(k in joined for k in ["financial", "insurance", "accountant"]):
        return "Finance & Professional Services", detail
    if any(k in joined for k in ["it", "software", "telecommunication", "computer", "electronics", "advertising"]):
        return "Technology, Media & Telecom", detail
    if shop:
        return "Retail & Consumer Commerce", detail
    if office:
        return "Business & Professional Services", detail
    return "Other Commercial Operations", detail


def infer_role(sector: str, detail: str) -> str:
    text = f"{sector} {detail}".lower()
    if "manufacturing" in text or "industry" in text:
        return "Manufacturer / industrial buyer / potential exporter"
    if "wholesale" in text or "distribution" in text or "trade" in text:
        return "Importer / distributor / wholesaler"
    if "logistics" in text or "transport" in text:
        return "Logistics and market-access partner"
    if "finance" in text:
        return "Trade-finance, payment or SME-channel partner"
    if "hospitality" in text or "healthcare" in text or "education" in text:
        return "Institutional buyer / operator"
    if "technology" in text or "professional" in text:
        return "Enterprise buyer / implementation or channel partner"
    return "Buyer / retailer / local distribution lead"


def target_role(sector: str) -> str:
    mapping = {
        "Manufacturing & Industry": "Managing Director; Procurement Director; Plant or Operations Manager",
        "Wholesale, Distribution & Trade": "Owner or Managing Director; Purchasing Manager; Commercial Director",
        "Logistics & Transport": "Managing Director; Operations Manager; Fleet or Procurement Manager",
        "Construction & Industrial Services": "Managing Director; Project Director; Procurement Manager",
        "Agriculture, Food & Beverage": "Managing Director; Production Manager; Procurement or Export Manager",
        "Hospitality, Tourism & Food Service": "General Manager; Procurement Manager; F&B Director",
        "Healthcare & Pharmaceuticals": "Administrator or General Manager; Procurement Manager",
        "Education & Training": "Director; Bursar; Procurement or Partnerships Manager",
        "Finance & Professional Services": "Head of SME or Trade Finance; Partnerships Director; Managing Director",
        "Technology, Media & Telecom": "Founder or Managing Director; Partnerships or Procurement Lead",
        "Retail & Consumer Commerce": "Owner or General Manager; Purchasing or Category Manager",
        "Business & Professional Services": "Managing Director; Operations or Partnerships Lead",
    }
    return mapping.get(sector, "Owner; Managing Director; Procurement or Operations Lead")


def value_asset(country: str, sector: str, company: str) -> tuple[str, str, str]:
    if country in {"Benin", "Côte d'Ivoire"}:
        rationale = (
            f"{company} operates in {sector.lower()}, a segment that may need verified suppliers, "
            "machinery, raw materials, payments, logistics or regional market access through Exportunity."
        )
        next_action = "Verify activity and decision-maker; enrich one public business contact; prepare a draft for owner review."
        asset = "Free French-language AI sourcing preview with relevant suppliers, indicative logistics route and market opportunity."
    else:
        rationale = (
            f"{company} operates in {sector.lower()} and may buy from, supply to, finance or distribute into African markets."
        )
        next_action = "Confirm active status and Africa-trade relevance; identify the correct public decision-maker; prepare a draft for owner review."
        asset = "Free English-language Africa sourcing or market-entry preview, personalized to the company and its activity."
    return rationale, next_action, asset


def score_lead(tags: dict[str, Any], sector: str, phone: str, email: str, website: str, social: str, address: str) -> int:
    detail = " ".join(clean(tags.get(k)) for k in ["industrial", "craft", "shop", "office", "amenity", "tourism", "healthcare", "man_made"]).lower()
    score = 28
    if sector in {"Manufacturing & Industry", "Wholesale, Distribution & Trade", "Logistics & Transport", "Construction & Industrial Services"}:
        score += 26
    elif sector in {"Agriculture, Food & Beverage", "Finance & Professional Services", "Technology, Media & Telecom"}:
        score += 21
    elif sector in {"Hospitality, Tourism & Food Service", "Healthcare & Pharmaceuticals", "Education & Training"}:
        score += 17
    else:
        score += 12
    if any(k in detail for k in ["manufacturer", "factory", "industrial", "wholesale", "logistics", "warehouse", "machinery", "hardware", "agricultural"]):
        score += 8
    if phone:
        score += 11
    if email:
        score += 11
    if website:
        score += 8
    if social:
        score += 4
    if address:
        score += 4
    return min(100, score)


def priority(score: int) -> str:
    if score >= 75:
        return "A"
    if score >= 60:
        return "B"
    if score >= 48:
        return "C"
    return "D"


def make_address(tags: dict[str, Any]) -> str:
    full = first_tag(tags, ["addr:full", "contact:address"])
    if full:
        return full
    parts = [
        first_tag(tags, ["addr:housenumber"]),
        first_tag(tags, ["addr:street", "addr:place"]),
        first_tag(tags, ["addr:suburb", "addr:district", "addr:quarter"]),
        first_tag(tags, ["addr:city", "addr:town", "addr:village"]),
        first_tag(tags, ["addr:state"]),
        first_tag(tags, ["addr:postcode"]),
    ]
    return ", ".join(part for part in parts if part)


def contact_completeness(phone: str, email: str, website: str, social: str, address: str) -> str:
    count = sum(bool(v) for v in [phone, email, website, social, address])
    return {0: "none", 1: "low", 2: "partial", 3: "good", 4: "strong", 5: "strong"}[count]


def parse_element(country: str, fallback_market: str, element: dict[str, Any], retrieved: str) -> dict[str, Any] | None:
    tags = element.get("tags") or {}
    name = first_tag(tags, ["name", "brand", "operator"])
    if not name or len(canon(name)) < 3 or canon(name) in GENERIC_NAMES:
        return None
    if clean(tags.get("office")).lower() in SKIP_OFFICES:
        return None

    element_type = clean(element.get("type"))
    element_id = clean(element.get("id"))
    lat = element.get("lat")
    lon = element.get("lon")
    if lat is None or lon is None:
        center = element.get("center") or {}
        lat = center.get("lat", "")
        lon = center.get("lon", "")

    market = first_tag(tags, ["addr:city", "addr:town", "addr:village", "is_in:city"]) or fallback_market
    region = first_tag(tags, ["addr:state", "addr:province", "addr:region"])
    phone = first_tag(tags, ["contact:phone", "phone", "contact:mobile", "mobile", "contact:whatsapp"])
    email = first_tag(tags, ["contact:email", "email"])
    website = first_tag(tags, ["contact:website", "website", "url"])
    social_parts = []
    for label, key in [
        ("WhatsApp", "contact:whatsapp"), ("LinkedIn", "contact:linkedin"),
        ("Facebook", "contact:facebook"), ("Instagram", "contact:instagram"),
    ]:
        value = clean(tags.get(key))
        if value and value != phone:
            social_parts.append(f"{label}: {value}")
    social = " | ".join(social_parts)
    address = make_address(tags)
    sector, detail = infer_sector(tags)
    role = infer_role(sector, detail)
    score = score_lead(tags, sector, phone, email, website, social, address)
    rationale, next_action, asset = value_asset(country, sector, name)
    source_url = f"https://www.openstreetmap.org/{element_type}/{element_id}"
    digest = hashlib.sha256(f"{country}|{element_type}|{element_id}".encode()).hexdigest()[:12].upper()

    return {
        "Lead ID": f"EXP-{COUNTRIES[country]['code']}-{digest}",
        "Company / Establishment": name,
        "Country": country,
        "Market / City": market,
        "State / Emirate / Region": region,
        "Primary Sector": sector,
        "Detailed Activity": detail,
        "Likely Exportunity Role": role,
        "Qualification Score": score,
        "Priority Tier": priority(score),
        "Fit Rationale": rationale,
        "Target Decision-Maker": target_role(sector),
        "Named Decision-Maker": "",
        "Public Phone": phone,
        "Public Email": email,
        "Website": website,
        "Other Public Contact": social,
        "Address": address,
        "Latitude": lat,
        "Longitude": lon,
        "OSM Type": element_type,
        "OSM ID": element_id,
        "Source Dataset": "OpenStreetMap via Overpass API (ODbL)",
        "Source URL": source_url,
        "Source Retrieved UTC": retrieved,
        "Contact Completeness": contact_completeness(phone, email, website, social, address),
        "Contact Verification": "public_source_only_not_independently_verified",
        "Commercial Verification": "unverified_research_record",
        "Review Status": "review_required",
        "Outreach Status": "not_contacted",
        "Recommended Next Action": next_action,
        "Suggested Give-First Asset": asset,
        "Language": COUNTRIES[country]["language"],
        "Notes": "Public map record. Confirm active business, legal identity and contact ownership before use.",
    }


def dedupe_key(row: dict[str, Any]) -> tuple[str, str, str]:
    identity = canon(row["Company / Establishment"])
    contact = canon(row["Public Phone"] or row["Website"] or row["Public Email"])
    market = canon(row["Market / City"])
    return identity, contact, market


def balanced_select(rows: list[dict[str, Any]], quota: int) -> list[dict[str, Any]]:
    by_market: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_market[row["Market / City"]].append(row)
    for market_rows in by_market.values():
        market_rows.sort(
            key=lambda r: (
                int(r["Qualification Score"]),
                r["Contact Completeness"] in {"good", "strong"},
                bool(r["Public Phone"]), bool(r["Public Email"]), bool(r["Website"]),
                r["Company / Establishment"],
            ),
            reverse=True,
        )
    queues = deque((market, deque(items)) for market, items in sorted(by_market.items(), key=lambda item: len(item[1]), reverse=True))
    selected: list[dict[str, Any]] = []
    while queues and len(selected) < quota:
        market, queue = queues.popleft()
        if queue:
            selected.append(queue.popleft())
        if queue:
            queues.append((market, queue))
    return selected


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=HEADERS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    retrieved = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    all_candidates: list[dict[str, Any]] = []
    fetch_log: list[dict[str, Any]] = []

    for country, spec in COUNTRIES.items():
        country_rows: list[dict[str, Any]] = []
        for market, bbox in spec["markets"]:
            label = f"{country} / {market}"
            try:
                elements = fetch_overpass(make_query(bbox), label)
                accepted = 0
                for element in elements:
                    row = parse_element(country, market, element, retrieved)
                    if row:
                        country_rows.append(row)
                        accepted += 1
                fetch_log.append({"country": country, "market": market, "elements": len(elements), "accepted": accepted, "status": "ok"})
            except Exception as exc:
                print(f"WARNING: {label} failed: {exc}", flush=True)
                fetch_log.append({"country": country, "market": market, "elements": 0, "accepted": 0, "status": f"failed: {exc}"})
            time.sleep(1.5)

        deduped: dict[tuple[str, str, str], dict[str, Any]] = {}
        for row in country_rows:
            key = dedupe_key(row)
            current = deduped.get(key)
            if current is None or int(row["Qualification Score"]) > int(current["Qualification Score"]):
                deduped[key] = row
        candidates = list(deduped.values())
        selected = balanced_select(candidates, int(spec["quota"]))
        print(f"{country}: {len(country_rows)} parsed, {len(candidates)} unique, {len(selected)} selected", flush=True)
        all_candidates.extend(selected)

    all_candidates.sort(key=lambda r: (r["Country"], r["Priority Tier"], -int(r["Qualification Score"]), r["Company / Establishment"]))
    if len(all_candidates) < 2000:
        raise SystemExit(f"Insufficient public-source records: {len(all_candidates)}; required at least 2000")

    write_csv(OUTPUT_DIR / "Exportunity_Qualified_Leads_All_2200.csv", all_candidates)
    for country in COUNTRIES:
        safe = country.replace(" ", "_").replace("'", "").replace("ô", "o").replace("é", "e").replace("É", "E")
        write_csv(OUTPUT_DIR / f"Exportunity_Qualified_Leads_{safe}.csv", [r for r in all_candidates if r["Country"] == country])

    tier_counts = Counter(r["Priority Tier"] for r in all_candidates)
    country_counts = Counter(r["Country"] for r in all_candidates)
    sector_counts = Counter(r["Primary Sector"] for r in all_candidates)
    summary = {
        "generated_at_utc": retrieved,
        "total_records": len(all_candidates),
        "country_counts": dict(country_counts),
        "priority_counts": dict(tier_counts),
        "sector_counts": dict(sector_counts),
        "records_with_phone": sum(bool(r["Public Phone"]) for r in all_candidates),
        "records_with_email": sum(bool(r["Public Email"]) for r in all_candidates),
        "records_with_website": sum(bool(r["Website"]) for r in all_candidates),
        "safeguards": {
            "commercial_verification": "unverified_research_record",
            "review_status": "review_required",
            "outreach_status": "not_contacted",
            "sending_performed": False,
        },
        "fetch_log": fetch_log,
    }
    (OUTPUT_DIR / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUTPUT_DIR / "README.txt").write_text(
        "Exportunity public-source lead research batch\n"
        "==============================================\n\n"
        f"Records: {len(all_candidates)}\n"
        "Markets: Benin, Côte d'Ivoire, United Arab Emirates\n"
        "Source: OpenStreetMap via Overpass API; ODbL attribution applies.\n\n"
        "These rows are research leads, not a claim that every entity is active, incorporated,\n"
        "commercially verified, export-ready, or already an Exportunity client. Missing contact\n"
        "details were left blank. No outreach was sent. Every record requires human review.\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
