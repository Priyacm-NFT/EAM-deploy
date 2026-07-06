/** First auto-generated numeric record code (10000, 10001, …). */
export const AUTO_RECORD_CODE_START = 10000;

/** Next numeric code for a module that already has `existingCount` records. */
export function nextAutoRecordCode(existingCount: number): string {
  return String(AUTO_RECORD_CODE_START + existingCount);
}
