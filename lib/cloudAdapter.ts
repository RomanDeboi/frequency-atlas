import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "atlas-screenshots";
const SIGNED_URL_TTL_SECONDS = 3600;
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;

export type AtlasImage = {
  id: string;
  name: string;
  kind: "spectrum" | "waterfall" | "other";
  caption?: string;
  dataUrl?: string;
  storagePath?: string;
};
export type AtlasRecord = {
  id: string;
  entityId: string;
  entity: string;
  band: string;
  cat: string;
  a: number;
  b: number;
  images?: AtlasImage[];
  [property: string]: unknown;
};

function fail(error: { message?: string } | null, fallback: string): never {
  throw new Error(error?.message || fallback);
}
function assertOwnPath(path: string, userId: string): void {
  if (!path.startsWith(`${userId}/`) || !/^[\w-]+\/[\w-]+\.(png|jpg|webp)$/.test(path)) {
    throw new Error("Некоректний шлях скриншота в приватному сховищі.");
  }
}
function toMetadata(records: AtlasRecord[], userId: string): AtlasRecord[] {
  return records.map((record) => ({
    ...record,
    images: (record.images || []).map(({ dataUrl: _ignore, ...image }) => {
      if (!image.storagePath) throw new Error("Скриншот не завантажений до приватного сховища.");
      assertOwnPath(image.storagePath, userId);
      return image;
    }),
  }));
}
function imagePaths(records: AtlasRecord[]): Set<string> {
  return new Set(records.flatMap((record) => (record.images || [])
    .map((image) => image.storagePath).filter((path): path is string => Boolean(path))));
}
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  if (!/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(dataUrl)) {
    throw new Error("Дозволено тільки PNG, JPG або WebP.");
  }
  if (dataUrl.length > 14 * 1024 * 1024 + 100) {
    throw new Error("Скриншот завеликий для синхронізації.");
  }
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  if (blob.size > MAX_SCREENSHOT_BYTES) throw new Error("Максимальний розмір скриншота — 10 МБ.");
  return blob;
}
function blobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Не вдалося прочитати зображення."));
    reader.readAsDataURL(blob);
  });
}

/** Per-session cloud adapter. No service-role key and no locally cached cloud records. */
export function createCloudAdapter(client: SupabaseClient, userId: string) {
  let revision = 0;
  let previousRecords: AtlasRecord[] = [];
  let signedUntil = 0;

  async function signRecords(records: AtlasRecord[]): Promise<AtlasRecord[]> {
    const paths = [...imagePaths(records)];
    if (!paths.length) return records.map((record) => ({ ...record }));
    for (const path of paths) assertOwnPath(path, userId);
    const signed = new Map<string, string>();
    // Supabase returns signed URLs in the same order as the supplied paths.
    for (let offset = 0; offset < paths.length; offset += 100) {
      const group = paths.slice(offset, offset + 100);
      const { data, error } = await client.storage.from(BUCKET)
        .createSignedUrls(group, SIGNED_URL_TTL_SECONDS);
      if (error) fail(error, "Не вдалося відкрити приватні скриншоти.");
      for (let i = 0; i < group.length; i++) {
        if (!data?.[i]?.signedUrl || data[i].error) {
          throw new Error("Один зі скриншотів недоступний у приватному сховищі.");
        }
        signed.set(group[i], data[i].signedUrl);
      }
    }
    signedUntil = Date.now() + SIGNED_URL_TTL_SECONDS * 1000;
    return records.map((record) => ({
      ...record,
      images: (record.images || []).map((image) => ({
        ...image,
        dataUrl: image.storagePath ? signed.get(image.storagePath) : image.dataUrl,
      })),
    }));
  }

  async function load(): Promise<AtlasRecord[]> {
    const { data, error } = await client.from("atlas_vaults")
      .select("revision,records").eq("user_id", userId).maybeSingle();
    if (error) fail(error, "Не вдалося завантажити хмарну базу.");
    if (data && !Array.isArray(data.records)) throw new Error("Некоректний формат хмарної бази.");
    const metadata = (data?.records ?? []) as AtlasRecord[];
    const visible = await signRecords(metadata);
    revision = Number(data?.revision ?? 0);
    previousRecords = metadata;
    return visible;
  }

  async function save(records: AtlasRecord[]): Promise<{ records: AtlasRecord[]; warning?: string }> {
    const working: AtlasRecord[] = structuredClone(records);
    const uploaded: string[] = [];
    let committed = false;
    try {
      for (const record of working) {
        for (const image of record.images || []) {
          if (image.storagePath) {
            assertOwnPath(image.storagePath, userId);
            continue;
          }
          if (!image.dataUrl) throw new Error("Відсутній вміст нового скриншота.");
          const blob = await dataUrlToBlob(image.dataUrl);
          const extension = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png";
          const path = `${userId}/${crypto.randomUUID()}.${extension}`;
          const { error } = await client.storage.from(BUCKET)
            .upload(path, blob, { contentType: blob.type, upsert: false });
          if (error) fail(error, "Не вдалося завантажити скриншот.");
          uploaded.push(path);
          image.storagePath = path;
        }
      }
      // Resolve private asset URLs before committing the metadata transaction.
      const visible = await signRecords(working);
      const metadata = toMetadata(working, userId);
      const { data, error } = await client.rpc("save_atlas_vault", {
        expected_revision: revision,
        next_records: metadata,
      });
      if (error) {
        if (error.code === "40001" || error.message?.includes("VERSION_CONFLICT")) {
          throw new Error("Конфлікт версій: базу змінили з іншого пристрою. Скопіюй незбережені зміни з відкритої форми, потім онови хмару.");
        }
        fail(error, "Хмарне збереження не вдалося.");
      }
      committed = true;
      revision = Number(data);
      const nextPaths = imagePaths(metadata);
      const removed = [...imagePaths(previousRecords)].filter((path) => !nextPaths.has(path));
      previousRecords = metadata;
      if (removed.length) {
        const { error: removeError } = await client.storage.from(BUCKET).remove(removed);
        return {
          records: visible,
          warning: removeError ? "Запис збережено, але частину видалених файлів не вдалося прибрати зі сховища." : undefined,
        };
      }
      return { records: visible };
    } catch (error) {
      if (!committed && uploaded.length) {
        try { await client.storage.from(BUCKET).remove(uploaded); } catch { /* best-effort rollback */ }
      }
      throw error;
    }
  }

  async function hasRemoteChanges(): Promise<boolean> {
    const { data, error } = await client.from("atlas_vaults")
      .select("revision").eq("user_id", userId).maybeSingle();
    if (error) fail(error, "Не вдалося перевірити зміни в хмарі.");
    return Number(data?.revision ?? 0) !== revision;
  }

  async function refreshIfNeeded(records: AtlasRecord[]): Promise<AtlasRecord[]> {
    return Date.now() < signedUntil - 5 * 60_000 ? records : signRecords(records);
  }

  async function exportBackup(records: AtlasRecord[]): Promise<AtlasRecord[]> {
    const exported: AtlasRecord[] = [];
    for (const record of records) {
      const images: AtlasImage[] = [];
      for (const image of record.images || []) {
        if (!image.storagePath) {
          if (!image.dataUrl?.startsWith("data:image/")) throw new Error("Некоректний скриншот для експорту.");
          images.push({ ...image });
          continue;
        }
        assertOwnPath(image.storagePath, userId);
        const { data: blob, error } = await client.storage.from(BUCKET).download(image.storagePath);
        if (error || !blob) fail(error, "Не вдалося завантажити зображення для резервної копії.");
        const { storagePath: _discard, ...portable } = image;
        images.push({ ...portable, dataUrl: await blobAsDataUrl(blob) });
      }
      exported.push({ ...record, images });
    }
    return exported;
  }

  return { load, save, hasRemoteChanges, refreshIfNeeded, exportBackup };
}

export type CloudAdapter = ReturnType<typeof createCloudAdapter>;
