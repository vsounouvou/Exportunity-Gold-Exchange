export type ActionSpecCategory = "DB_MUTATION" | "WORKSTATION" | "SYSTEM" | "READ";

export type ActionSpec = {
  key: string;
  entity: string;
  category: ActionSpecCategory;
  requiredParams: string[];
  optionalParams?: string[];
  allowedRoles: string[];
  description: string;
  sideEffects?: {
    tablesTouched?: string[];
    externalCalls?: string[];
  };
  validationRules?: {
    paramSchemas?: Record<string, unknown>;
  };
  receipts?: {
    required: Array<"DB_MUTATION" | "WORKSTATION_EVENT" | "HTTP_CALL" | "FILE_ARTIFACT">;
    notes?: string;
  };
};

