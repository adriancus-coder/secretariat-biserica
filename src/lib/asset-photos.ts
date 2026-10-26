/*
 * PATRIMONY-PHOTOS: the limits and texts shared by the server and the page. Pure.
 */

/** What the file field accepts; on an iPhone Safari converts a HEIC photo to JPEG for this list. */
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
export const PHOTO_MAX_FILE_BYTES = 15 * 1024 * 1024;
/** A small file can declare a huge image (a decompression bomb): refused from its header, before decoding. */
export const PHOTO_MAX_PIXELS = 120_000_000;
export const PHOTO_FULL_EDGE = 1600;
export const PHOTO_THUMB_EDGE = 400;
export const PHOTO_JPEG_QUALITY = 78;
export const PHOTOS_PER_ASSET = 4;
export const PHOTOS_CHURCH_QUOTA = 100 * 1024 * 1024;

export const mb = (bytes: number) => Math.round(bytes / (1024 * 1024));

/** „Pozele patrimoniului: 34 MB din 100 MB” (administrators, with the inventory reminder). */
export const photoQuotaText = (used: number) => `Pozele patrimoniului: ${mb(used)} MB din ${mb(PHOTOS_CHURCH_QUOTA)} MB`;

/** The backup's size grows by about 4/3 of the photos (base64). */
export const backupPhotosEstimate = (bytes: number) => Math.ceil((bytes * 4) / 3 / (1024 * 1024));
