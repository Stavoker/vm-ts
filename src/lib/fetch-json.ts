export async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const trimmed = text.trimStart();

  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    throw new Error(
      response.status >= 500
        ? `Server temporarily unavailable (HTTP ${response.status})`
        : `Server returned HTML instead of JSON (HTTP ${response.status})`,
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Invalid server response");
  }
}
