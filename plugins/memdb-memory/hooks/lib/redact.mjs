/**
 * Sensitive-data redaction for MemDB capture hooks.
 *
 * Applied BEFORE any text is written to MemDB or the rolling context buffer,
 * so PCI/credential/API-key data never reaches long-term memory.
 *
 * Idempotent: running twice is a no-op (placeholders are not re-matched).
 */

// Private keys — match first because they're multi-line blocks
const PRIVATE_KEY_RE = /-----BEGIN [A-Z ]*PRIVATE KEY[A-Z ]*-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY[A-Z ]*-----/g;

// API / token patterns (high-confidence prefixes)
const API_KEY_RE = new RegExp([
  "sk-[A-Za-z0-9_\\-]{20,}",                            // OpenAI-style
  "sk-ant-[A-Za-z0-9_\\-]{20,}",                        // Anthropic
  "ghp_[A-Za-z0-9]{36}",                                // GitHub PAT
  "gho_[A-Za-z0-9]{36}",                                // GitHub OAuth
  "ghu_[A-Za-z0-9]{36}",                                // GitHub user-to-server
  "ghs_[A-Za-z0-9]{36}",                                // GitHub server-to-server
  "ghr_[A-Za-z0-9]{36}",                                // GitHub refresh
  "xox[baprs]-[A-Za-z0-9\\-]{10,}",                     // Slack
  "AKIA[0-9A-Z]{16}",                                   // AWS access key
  "AIza[0-9A-Za-z_\\-]{35}",                            // Google API key
  "eyJ[A-Za-z0-9_=\\-]+\\.eyJ[A-Za-z0-9_=\\-]+\\.[A-Za-z0-9_=\\-]+",  // JWT
].join("|"), "g");

// Credentials with explicit label
const PASSWORD_RE = /\b(password|passwd|pwd|pass)\s*[:=]\s*(\S+)/gi;
const BEARER_RE = /\b(Bearer|Authorization)\s*[:=]?\s*([A-Za-z0-9_\-.=]{20,})/g;

// CVV / card security code
const CVV_RE = /\b(cvv2?|cvc2?|csc)\s*[:=]?\s*(\d{3,4})\b/gi;

// Card expiry (only when preceded by an expiry keyword, to avoid redacting
// random MM/YY strings like version numbers or dates)
const EXPIRY_RE = /\b(expir(?:es|y|ation)?|exp|valid\s+thru)\s*[:=]?\s*(\d{1,2}[/\-]\d{2,4})/gi;

// PAN candidate: 13-19 digits, optional spaces or dashes between groups.
// Validated with Luhn before replacement to cut false positives.
const PAN_RE = /\b(?:\d[ \-]?){12,18}\d\b/g;

function luhn(s) {
  const digits = s.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i], 10);
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function redactSensitive(text) {
  if (!text || typeof text !== "string") return text;
  let out = text;

  out = out.replace(PRIVATE_KEY_RE, "[REDACTED-PRIVATE-KEY]");
  out = out.replace(API_KEY_RE, "[REDACTED-KEY]");
  out = out.replace(PASSWORD_RE, "$1: [REDACTED-PASSWORD]");
  out = out.replace(BEARER_RE, "$1 [REDACTED-TOKEN]");
  out = out.replace(CVV_RE, "$1: [REDACTED-CVV]");
  out = out.replace(EXPIRY_RE, "$1: [REDACTED-EXPIRY]");
  out = out.replace(PAN_RE, (m) => (luhn(m) ? "[REDACTED-PAN]" : m));

  return out;
}
