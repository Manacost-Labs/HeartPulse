/** Builds canonical links only for server-issued numeric public IDs. */
export function publicProfilePath(publicProfileId: string): string {
  return /^[1-9]\d{0,9}$/.test(publicProfileId) && Number(publicProfileId) <= 2_147_483_647
    ? `/id/${publicProfileId}`
    : '/';
}
