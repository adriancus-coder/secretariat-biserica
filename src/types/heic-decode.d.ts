// heic-decode ships no types: decodes the first image of a HEIC/HEIF file to RGBA pixels.
declare module "heic-decode" {
  export default function decode(input: { buffer: ArrayBufferLike | Uint8Array }): Promise<{ width: number; height: number; data: Uint8ClampedArray }>;
}
