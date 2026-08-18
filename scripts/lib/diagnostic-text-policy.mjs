const UNSAFE_METADATA_CHARACTER = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const UNSAFE_METADATA_CHARACTERS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

export function singleLineDisplay(value) {
  return String(value).replace(
    UNSAFE_METADATA_CHARACTERS,
    character => `\\u{${character.codePointAt(0).toString(16).toUpperCase()}}`,
  );
}

export function singleLineErrorMessage(error) {
  return singleLineDisplay(error instanceof Error ? error.message : String(error));
}

export function isSafeMetadataText(value) {
  return typeof value === 'string'
    && value.trim().length > 0
    && !UNSAFE_METADATA_CHARACTER.test(value);
}
