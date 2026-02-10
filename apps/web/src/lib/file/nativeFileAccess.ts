export interface NativeFileAccessSettings {
  enabled: boolean;
}

export const NATIVE_FILE_ACCESS_SETTINGS_KEY = "motionforge_native_file_access_settings_v1";
export const NATIVE_FILE_ACCESS_META_KEY = "motionforge_native_file_access_meta_v1";

const DEFAULT_SETTINGS: NativeFileAccessSettings = {
  enabled: false,
};

export function isNativeFileAccessSupported(target: unknown = window): boolean {
  return (
    typeof target === "object" &&
    target !== null &&
    typeof (target as { showOpenFilePicker?: unknown }).showOpenFilePicker === "function" &&
    typeof (target as { showSaveFilePicker?: unknown }).showSaveFilePicker === "function"
  );
}

export function readNativeFileAccessSettings(): NativeFileAccessSettings {
  const raw = localStorage.getItem(NATIVE_FILE_ACCESS_SETTINGS_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { enabled?: unknown }).enabled === "boolean"
    ) {
      return { enabled: (parsed as { enabled: boolean }).enabled };
    }
    return DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeNativeFileAccessSettings(next: NativeFileAccessSettings): void {
  localStorage.setItem(NATIVE_FILE_ACCESS_SETTINGS_KEY, JSON.stringify(next));
}

export function writeNativeFileAccessMeta(name: string): void {
  localStorage.setItem(
    NATIVE_FILE_ACCESS_META_KEY,
    JSON.stringify({
      name,
      timestamp: new Date().toISOString(),
    }),
  );
}

