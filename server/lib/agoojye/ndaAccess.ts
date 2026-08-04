export type EngineeringNdaProfileState = {
  ndaStatus?: string | null;
  ndaAccessState?: string | null;
};

export type EngineeringNdaDecision =
  | { allowed: true; code: null; state: "submitted" | "approved" }
  | {
      allowed: false;
      code: "NDA_NOT_REGISTERED" | "NDA_UPLOAD_REQUIRED" | "NDA_REJECTED";
      state: "blocked" | "required" | "rejected";
    };

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function isEngineeringNdaRegistered(
  profile: EngineeringNdaProfileState,
) {
  return ["signed", "registered", "required"].includes(
    normalize(profile.ndaStatus),
  );
}

export function engineeringNdaDecision(
  profile: EngineeringNdaProfileState,
): EngineeringNdaDecision {
  const state = normalize(profile.ndaAccessState);

  if (!isEngineeringNdaRegistered(profile)) {
    return { allowed: false, code: "NDA_NOT_REGISTERED", state: "blocked" };
  }
  if (state === "rejected") {
    return { allowed: false, code: "NDA_REJECTED", state: "rejected" };
  }
  if (state === "submitted" || state === "approved") {
    return { allowed: true, code: null, state };
  }
  return { allowed: false, code: "NDA_UPLOAD_REQUIRED", state: "required" };
}

export function canInviteEngineeringProfile(
  profile: EngineeringNdaProfileState & {
    personalEmail?: string | null;
    invitationState?: string | null;
  },
) {
  const invitationState = normalize(profile.invitationState);
  return (
    isEngineeringNdaRegistered(profile) &&
    Boolean(normalize(profile.personalEmail)) &&
    ![
      "sending",
      "sent",
      "delivery_unconfirmed",
      "accepted",
      "cancelled",
    ].includes(invitationState)
  );
}
