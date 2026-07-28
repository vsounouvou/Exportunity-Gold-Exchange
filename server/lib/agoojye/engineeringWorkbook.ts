import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import * as XLSX from "xlsx";

import {
  ENGINEERING_ROSTER,
  ENGINEERING_SOURCE,
  type EngineeringRosterMember,
} from "./engineeringTeam";

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cellValue(sheet: XLSX.WorkSheet, sourceRow: number, column: number) {
  const cell = sheet[XLSX.utils.encode_cell({ r: sourceRow - 1, c: column })];
  return clean(cell?.w ?? cell?.v ?? "");
}

function firstValue(
  sheet: XLSX.WorkSheet,
  sourceRows: number[],
  column: number,
) {
  for (const sourceRow of sourceRows) {
    const value = cellValue(sheet, sourceRow, column);
    if (value) return value;
  }
  return "";
}

export async function loadPrivateEngineeringRoster(
  workbookPath: string,
  roster: ReadonlyArray<EngineeringRosterMember> = ENGINEERING_ROSTER,
  expectedSha256 = ENGINEERING_SOURCE.workbookSha256,
) {
  const buffer = await readFile(workbookPath);
  const digest = createHash("sha256").update(buffer).digest("hex");
  if (digest !== expectedSha256) {
    throw new Error(
      `Engineering workbook digest mismatch. Expected ${expectedSha256}, received ${digest}.`,
    );
  }

  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: false,
    raw: false,
  });
  const sheet = workbook.Sheets["Technical Team"];
  if (!sheet) {
    throw new Error('Engineering workbook sheet "Technical Team" is missing.');
  }

  const resolved = roster.map((entry) => {
    for (const sourceRow of entry.sourceRows) {
      if (!cellValue(sheet, sourceRow, 0)) {
        throw new Error(`Engineering workbook source row ${sourceRow} is empty.`);
      }
    }
    const personalEmail =
      firstValue(sheet, [...entry.sourceRows].reverse(), 1).toLowerCase() || null;
    const phone = firstValue(sheet, [...entry.sourceRows].reverse(), 2) || null;
    const studyProgram =
      firstValue(sheet, [...entry.sourceRows].reverse(), 3) ||
      entry.studyProgram ||
      null;
    const sourceSquad =
      firstValue(sheet, [...entry.sourceRows].reverse(), 4) ||
      entry.sourceSquad ||
      null;
    const ndaMarker = firstValue(sheet, entry.sourceRows, 5).toLowerCase();
    const ndaUrl = firstValue(sheet, entry.sourceRows, 6) || null;
    const ndaStatus = ndaMarker === "yes" ? "signed" : "not_recorded";

    if (entry.personalEmailRecorded && !personalEmail) {
      throw new Error(
        `Expected a personal delivery address for ${entry.corporateEmail}, but the verified workbook has none.`,
      );
    }
    if (!entry.personalEmailRecorded && personalEmail) {
      throw new Error(
        `Unexpected personal delivery address for ${entry.corporateEmail}; reconcile the source before provisioning.`,
      );
    }

    return {
      ...entry,
      personalEmail,
      phone,
      studyProgram,
      sourceSquad,
      ndaStatus,
      ndaUrl,
    } satisfies EngineeringRosterMember;
  });

  return {
    roster: resolved,
    workbookSha256: digest,
    privateFieldsLoaded: true as const,
  };
}
