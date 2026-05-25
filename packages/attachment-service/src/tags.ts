export interface MobileCaptureMetadata {
  source?: 'mobile' | 'web';
  device?: string;
  capturedAt?: string;
  latitude?: number;
  longitude?: number;
  locationId?: string;
  assetId?: string;
}

export interface AutoTagInput {
  entityType: string;
  entityId: string;
  uploadedBy: string;
  uploadedAt?: Date;
  capture?: MobileCaptureMetadata;
  manualTags?: string[];
}

/** PRD auto-tags: entity, uploader, datetime, GPS (mobile), device. */
export function buildAutoTags(input: AutoTagInput): string[] {
  const uploadedAt = (input.uploadedAt ?? new Date()).toISOString();
  const tags = new Set<string>([
    `entity_type:${input.entityType}`,
    `entity_id:${input.entityId}`,
    `uploader:${input.uploadedBy}`,
    `uploaded_at:${uploadedAt}`,
  ]);

  const capture = input.capture;
  if (capture?.source) tags.add(`source:${capture.source}`);
  if (capture?.device) tags.add(`device:${capture.device}`);
  if (capture?.capturedAt) tags.add(`captured_at:${capture.capturedAt}`);
  if (capture?.locationId) tags.add(`location_id:${capture.locationId}`);
  if (capture?.assetId) tags.add(`asset_id:${capture.assetId}`);

  if (
    capture?.latitude != null &&
    capture?.longitude != null &&
    Number.isFinite(capture.latitude) &&
    Number.isFinite(capture.longitude)
  ) {
    tags.add(`gps:${capture.latitude},${capture.longitude}`);
  }

  for (const tag of input.manualTags ?? []) {
    const trimmed = tag.trim();
    if (trimmed) tags.add(trimmed);
  }

  return [...tags];
}
