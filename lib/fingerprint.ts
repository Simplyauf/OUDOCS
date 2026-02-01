export async function getDeviceFingerprint(): Promise<string> {
  // Ensure this code only runs on the client
  if (typeof window === 'undefined') {
    return "server-side-rendering";
  }

  try {
    // Dynamically load to prevent SSR issues
    const FingerprintJS = await import('@fingerprintjs/fingerprintjs');
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    return result.visitorId;
  } catch (error) {
    console.error("Fingerprint generation failed:", error);
    return `fallback-${Math.random().toString(36).substring(2, 15)}`;
  }
}
