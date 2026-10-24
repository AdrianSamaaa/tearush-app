export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message, details) => new ApiError(400, message, details);
export const unauthorized = (message = 'Please log in to continue.') => new ApiError(401, message);
export const forbidden = (message = 'You do not have access to this.') => new ApiError(403, message);
export const notFound = (message = 'Not found.') => new ApiError(404, message);
export const conflict = (message) => new ApiError(409, message);

/** Small helpers for validating request bodies. */
export function requireString(value, field, { min = 1, max = 200 } = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < min) throw badRequest(`${field} is required.`);
  if (text.length > max) throw badRequest(`${field} must be at most ${max} characters.`);
  return text;
}

export function optionalString(value, field, max = 500) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw badRequest(`${field} must be text.`);
  const text = value.trim();
  if (text.length > max) throw badRequest(`${field} must be at most ${max} characters.`);
  return text;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function requireEmail(value) {
  const email = requireString(value, 'Email', { max: 254 }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw badRequest('Please enter a valid email address.');
  return email;
}

/** Like requirePhone, but an empty value is allowed (returns ''). */
export function optionalPhone(value, field = 'Phone number') {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return '';
  return requirePhone(value, field);
}

/** Philippine mobile numbers: 09XXXXXXXXX or +639XXXXXXXXX (spaces/dashes allowed). */
export function requirePhone(value, field = 'Phone number') {
  const raw = requireString(value, field, { max: 20 });
  const digits = raw.replace(/[\s-]/g, '');
  if (!/^(\+639|09)\d{9}$/.test(digits)) {
    throw badRequest(`${field} must be a valid PH mobile number (e.g. 0917 123 4567).`);
  }
  return digits.startsWith('+63') ? `0${digits.slice(3)}` : digits;
}
