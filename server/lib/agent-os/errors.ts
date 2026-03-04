export class AgentOsError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AgentOsError";
    this.status = status;
  }
}

export class PermissionDeniedError extends AgentOsError {
  constructor(message = "Permission denied") {
    super(message, 403);
    this.name = "PermissionDeniedError";
  }
}

export class TemplateRenderError extends AgentOsError {
  readonly missingVars: string[];

  constructor(message: string, missingVars: string[]) {
    super(message, 400);
    this.name = "TemplateRenderError";
    this.missingVars = missingVars;
  }
}

export class OpenAiPolicyError extends AgentOsError {
  constructor(message: string) {
    super(message, 400);
    this.name = "OpenAiPolicyError";
  }
}

export class LlmPolicyError extends AgentOsError {
  constructor(message: string) {
    super(message, 400);
    this.name = "LlmPolicyError";
  }
}
