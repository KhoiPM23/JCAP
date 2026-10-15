/**
 * Shadowing Speaker Role Normalization & Management Utilities
 */

/**
 * Normalizes any raw speaker role representation (e.g., 'A', 'Vai B', 'Role C', 'Nhân viên', '1')
 * into a single canonical role identifier ('A', 'B', 'C', ...).
 */
export function normalizeSpeakerRole(
  rawRole: string | undefined | null,
  availableRoles: string[] = []
): string {
  if (!rawRole || typeof rawRole !== 'string') return 'A';
  const trimmed = rawRole.trim();
  if (!trimmed) return 'A';

  // 1. Single character A-Z
  if (trimmed.length === 1 && /^[a-zA-Z]$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  // 2. Pattern: "Vai A", "Role B", "Speaker C", "Nhân vật C"
  const prefixLetterMatch = trimmed.match(/^(?:vai|role|speaker|nhân\s*vật)\s*([a-zA-Z])\b/i);
  if (prefixLetterMatch) {
    return prefixLetterMatch[1].toUpperCase();
  }

  // 3. Numeric: "Vai 1", "Role 2", "1", "2"
  const numMatch = trimmed.match(/^(?:(?:vai|role|speaker|nhân\s*vật)\s*)?(\d+)\b/i);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    if (!isNaN(num) && num >= 1 && num <= 26) {
      return String.fromCharCode(64 + num);
    }
  }

  // 4. Exact match against role names in availableRoles
  const exactIdx = availableRoles.findIndex(
    (r) => r && r.trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (exactIdx !== -1) {
    return String.fromCharCode(65 + exactIdx);
  }

  // 5. Substring / partial match against role names in availableRoles
  const partialIdx = availableRoles.findIndex(
    (r) =>
      r &&
      r.trim() &&
      (trimmed.toLowerCase().includes(r.trim().toLowerCase()) ||
        r.trim().toLowerCase().includes(trimmed.toLowerCase()))
  );
  if (partialIdx !== -1) {
    return String.fromCharCode(65 + partialIdx);
  }

  // 6. Fallback: If starts with an alphabetic character
  if (/^[a-zA-Z]/.test(trimmed)) {
    return trimmed[0].toUpperCase();
  }

  return 'A';
}

/**
 * Ensures that the roles array has enough elements to cover all role letters used in sentences.
 * E.g., if a sentence has role 'C' (index 2) but roles only has 2 items, it expands to 3 items.
 */
export function ensureRolesCoverSentences(
  roles: string[] = [],
  sentences: { speakerRole?: string }[] = []
): string[] {
  const result = roles && roles.length > 0 ? [...roles] : ['Vai A', 'Vai B'];
  while (result.length < 2) {
    result.push(`Vai ${String.fromCharCode(65 + result.length)}`);
  }

  for (const s of sentences) {
    const raw = (s.speakerRole || '').trim();
    const normalized = normalizeSpeakerRole(raw, result);
    const charCode = normalized.charCodeAt(0);
    if (charCode >= 65 && charCode <= 90) {
      const neededIdx = charCode - 65;
      while (result.length <= neededIdx && result.length < 26) {
        result.push(`Nhân vật ${String.fromCharCode(65 + result.length)}`);
      }
    }
  }

  return result;
}

/**
 * Resolves a role's display name from dialogue or roles array given the role character ('A', 'B', 'C', ...)
 */
export function getDialogueRoleName(
  dialogue: {
    speakerRoles?: string[];
    speakerRoleA_Name?: string;
    speakerRoleB_Name?: string;
  },
  roleChar: string
): string {
  const char = (roleChar || 'A').trim().toUpperCase();
  const roles =
    dialogue.speakerRoles && dialogue.speakerRoles.length > 0
      ? dialogue.speakerRoles
      : [dialogue.speakerRoleA_Name || 'Vai A', dialogue.speakerRoleB_Name || 'Vai B'];

  const idx = char.charCodeAt(0) - 65;
  if (idx >= 0 && idx < roles.length) {
    return roles[idx];
  }

  if (char === 'A') return dialogue.speakerRoleA_Name || 'Vai A';
  if (char === 'B') return dialogue.speakerRoleB_Name || 'Vai B';
  return `Vai ${char}`;
}
