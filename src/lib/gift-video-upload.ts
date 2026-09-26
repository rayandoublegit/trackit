import * as tus from "tus-js-client";

export function giftResumableEndpoint(supabaseUrl: string) {
  const url = new URL(supabaseUrl);
  const match = url.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
  if (match) url.hostname = `${match[1]}.storage.supabase.co`;
  url.pathname = "/storage/v1/upload/resumable";
  url.search = "";
  return url.toString();
}

export async function uploadGiftVideoResumable(
  file: File,
  path: string,
  signedToken: string,
  onProgress: (percent: number) => void,
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) throw new Error("Supabase storage is not configured.");

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: giftResumableEndpoint(supabaseUrl),
      retryDelays: [0, 3000, 5000, 10000, 20000],
      chunkSize: 6 * 1024 * 1024,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      headers: {
        authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
        "x-signature": signedToken,
        "x-upsert": "false",
      },
      metadata: {
        bucketName: "gift-videos",
        objectName: path,
        contentType: file.type,
        cacheControl: "3600",
      },
      onProgress(bytesUploaded, bytesTotal) {
        onProgress(Math.round((bytesUploaded / bytesTotal) * 100));
      },
      onError: reject,
      onSuccess: () => resolve(),
    });
    upload.start();
  });
}
