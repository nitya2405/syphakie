export class SyphaKieError extends Error {
  constructor(message: string, public status?: number, public code?: string) {
    super(message);
    this.name = "SyphaKieError";
  }
}

export class AuthError extends SyphaKieError {
  constructor(message: string, status?: number, code?: string) {
    super(message, status, code);
    this.name = "AuthError";
  }
}

export class CreditError extends SyphaKieError {
  constructor(message: string, status?: number, code?: string) {
    super(message, status, code);
    this.name = "CreditError";
  }
}

export class ModelNotFoundError extends SyphaKieError {
  constructor(message: string, status?: number, code?: string) {
    super(message, status, code);
    this.name = "ModelNotFoundError";
  }
}
