"use client";

import { Copy, Download, Factory, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, EmptyState, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { publicBrand, resolveBrand } from "@/lib/content-factory/brands";
import { normalizeHex, parsePalette, withCustomPalette } from "@/lib/content-factory/palette";
import { planBatch } from "@/lib/content-factory/post";
import type { BrandPalette, GeneratedImage, GeneratedPost } from "@/lib/content-factory/types";
import type { Site } from "@/lib/types";

type PublicBrand = {
  slug: string;
  displayName: string;
  siteId?: string;
  siteUrl: string;
  domain: string;
  known: boolean;
  industry: string;
  voice: string;
  palette: BrandPalette;
  disclaimer: string;
  cta: string;
  emojiGuide: string;
  hashtagSeeds: string[];
};

type ProjectResult = {
  brand: { slug: string; displayName: string; palette: BrandPalette; industry: string; siteId?: string; siteUrl?: string };
  packs?: Array<{ post: GeneratedPost; images: GeneratedImage[]; imageErrors: string[] }>;
  post: GeneratedPost;
  images: GeneratedImage[];
  imageErrors?: string[];
};

type GenerateResult = ProjectResult & {
  projects?: ProjectResult[];
};

type Props = {
  sites: Site[];
};

function brandFromSite(site: Site, palette?: BrandPalette): PublicBrand {
  const base = resolveBrand({ id: site.id, name: site.name, url: site.url });
  return publicBrand(palette ? withCustomPalette(base, palette) : base);
}

export function ContentFactoryPanel({ sites }: Props) {
  const [brands, setBrands] = useState<PublicBrand[]>([]);
  const [siteId, setSiteId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [topic, setTopic] = useState("");
  const [imageCount, setImageCount] = useState(2);
  const [postCount, setPostCount] = useState(3);
  const [platform, setPlatform] = useState("instagram");
  const [language, setLanguage] = useState("en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState<BrandPalette | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);

  useEffect(() => {
    setBrands((current) => {
      const palettes = new Map(current.map((item) => [item.siteId, item.palette] as const));
      return sites.map((site) => brandFromSite(site, palettes.get(site.id)));
    });
    setSiteId((current) => (sites.some((site) => site.id === current) ? current : sites[0]?.id || ""));
    setSelectedIds((current) => {
      const keep = current.filter((id) => sites.some((site) => site.id === id));
      if (keep.length) return keep;
      return sites[0]?.id ? [sites[0].id] : [];
    });
  }, [sites]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch("/api/content-factory/brands", { cache: "no-store" });
          const data = (await response.json()) as { brands?: PublicBrand[]; error?: string };
          if (!response.ok) throw new Error(data.error || "Не удалось загрузить бренды");
          const savedPalettes = new Map(
            (data.brands ?? [])
              .filter((item) => item.siteId)
              .map((item) => [item.siteId as string, item.palette] as const),
          );
          setBrands(sites.map((site) => brandFromSite(site, savedPalettes.get(site.id))));
        } catch {
          // Список проектов уже построен из сайтов панели.
        }
      })();
    }, 0);
    return () => clearTimeout(timer);
  }, [sites]);

  const selected = useMemo(
    () => brands.find((item) => item.siteId === siteId) || null,
    [brands, siteId],
  );

  useEffect(() => {
    if (selected) setDraft(selected.palette);
  }, [selected?.siteId]);

  function toggleSite(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) {
        if (current.length === 1) {
          setSiteId(id);
          return current;
        }
        const next = current.filter((item) => item !== id);
        setSiteId((focus) => (focus === id ? next[0] : focus));
        return next;
      }
      if (current.length >= 6) return current;
      setSiteId(id);
      return [...current, id];
    });
  }

  async function generate() {
    setBusy(true);
    setError(null);
    setCopied(null);
    try {
      const palettes: Record<string, BrandPalette> = {};
      for (const id of selectedIds) {
        const brand = brands.find((item) => item.siteId === id);
        const palette = id === siteId && draft ? draft : brand?.palette;
        if (palette) palettes[id] = palette;
      }
      const response = await fetch("/api/content-factory/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          siteIds: selectedIds,
          topic,
          imageCount,
          postCount,
          platform,
          language,
          palettes,
          palette: draft,
        }),
      });
      const data = (await response.json()) as GenerateResult & { error?: string };
      if (!response.ok) throw new Error(data.error || "Генерация не удалась");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка генерации");
    } finally {
      setBusy(false);
    }
  }

  async function savePalette() {
    if (!siteId || !draft) return;
    const palette = parsePalette(draft);
    if (!palette) {
      setError("Укажите 4 цвета в формате HEX");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch(`/api/sites/${siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_palette: palette }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(
          data.error?.includes("content_palette")
            ? "Нужна колонка content_palette. Выполните supabase/content_palette.sql"
            : data.error || "Не удалось сохранить палитру",
        );
      }
      setBrands((current) =>
        current.map((brand) => (brand.siteId === siteId ? { ...brand, palette } : brand)),
      );
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  function setColor(key: keyof Pick<BrandPalette, "primary" | "secondary" | "accent" | "background">, value: string) {
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current, [key]: value };
      setBrands((brandsState) =>
        brandsState.map((brand) => (brand.siteId === siteId ? { ...brand, palette: next } : brand)),
      );
      return next;
    });
  }

  async function copyPost(key: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    window.setTimeout(() => setCopied(null), 2000);
  }

  function downloadImage(image: GeneratedImage, projectSlug: string, packIndex: number) {
    const link = document.createElement("a");
    link.href = image.dataUrl;
    link.download = `${projectSlug}-p${packIndex + 1}-${image.index + 1}.png`;
    link.click();
  }

  const planned = planBatch({
    projectCount: selectedIds.length || 1,
    postCount,
    imageCount,
  });
  const projectResults =
    result?.projects && result.projects.length > 0
      ? result.projects
      : result
        ? [result]
        : [];

  if (sites.length === 0) {
    return (
      <EmptyState
        title="Нет проектов"
        hint="Добавьте сайты в мониторинг — контент-завод готовит посты отдельно под каждый."
        icon={<Factory size={22} />}
      />
    );
  }

  const generateLabel =
    selectedIds.length > 1
      ? `Сгенерировать для ${selectedIds.length} проектов`
      : postCount > 1
        ? `Сгенерировать ${postCount} поста`
        : "Сгенерировать пост";

  return (
    <div className="space-y-5">
      <Card>
        <div className="mb-4 flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-[12px] bg-[var(--accent-soft)] text-[var(--accent)]">
            <Sparkles size={16} />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight">Несколько проектов за один запуск</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
              Отметьте сайты — для каждого свой голос, палитра и ссылка. Тексты идут отдельными запросами OpenAI,
              картинки тоже на тот же ключ. Лимит — 12 картинок на весь запуск.
            </p>
          </div>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
          <span>Выбрано: {selectedIds.length}</span>
          <button
            type="button"
            className="font-medium text-[var(--accent)]"
            onClick={() => {
              const ids = brands.map((brand) => brand.siteId).filter((id): id is string => Boolean(id)).slice(0, 6);
              setSelectedIds(ids);
              if (ids[0]) setSiteId(ids[0]);
            }}
          >
            Все
          </button>
          <span>·</span>
          <button
            type="button"
            className="font-medium text-[var(--accent)]"
            onClick={() => {
              const first = brands[0]?.siteId;
              setSelectedIds(first ? [first] : []);
              if (first) setSiteId(first);
            }}
          >
            Один
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {brands.map((brand) => {
            const id = brand.siteId || "";
            const checked = selectedIds.includes(id);
            const focused = id === siteId;
            return (
              <button
                key={id || brand.slug}
                type="button"
                onClick={() => id && toggleSite(id)}
                className={`rounded-[14px] border p-3 text-left transition ${
                  checked ? "border-transparent shadow-[var(--shadow)]" : "border-[var(--border)] bg-white hover:bg-[#fbfbfd]"
                }`}
                style={
                  checked
                    ? { background: brand.palette.background, boxShadow: `inset 0 0 0 2px ${focused ? brand.palette.primary : brand.palette.secondary}` }
                    : undefined
                }
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex gap-1.5">
                    {(focused && draft
                      ? [draft.primary, draft.secondary, draft.accent, draft.background]
                      : [brand.palette.primary, brand.palette.secondary, brand.palette.accent, brand.palette.background]
                    ).map((color) => (
                      <span key={`${id}-${color}`} className="h-3 w-3 rounded-full border border-black/10" style={{ background: normalizeHex(color) || color }} />
                    ))}
                  </div>
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-[5px] border text-[10px] ${
                      checked ? "border-transparent text-white" : "border-[var(--border)] bg-white"
                    }`}
                    style={checked ? { background: brand.palette.primary } : undefined}
                    aria-hidden
                  >
                    {checked ? "✓" : ""}
                  </span>
                </div>
                <div className="text-[13.5px] font-semibold">{brand.displayName}</div>
                <div className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{brand.siteUrl}</div>
              </button>
            );
          })}
        </div>

        {draft ? (
          <div className="mt-4 rounded-[14px] border border-[var(--border)] bg-[#fbfbfd] p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-semibold">Палитра: {selected?.displayName || "проект"}</p>
              <Button type="button" variant="secondary" onClick={() => void savePalette()} disabled={saving || !siteId}>
                {saving ? "Сохраняю…" : saved ? "Сохранено" : "Сохранить палитру"}
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ColorField label="Основной" value={draft.primary} onChange={(value) => setColor("primary", value)} />
              <ColorField label="Второй" value={draft.secondary} onChange={(value) => setColor("secondary", value)} />
              <ColorField label="Акцент" value={draft.accent} onChange={(value) => setColor("accent", value)} />
              <ColorField label="Фон" value={draft.background} onChange={(value) => setColor("background", value)} />
            </div>
            <p className="mt-2 text-[11px] text-[var(--muted)]">
              Клик по карточке отмечает проект. Повторный клик снимает, если выбран не один. Палитра правится у последнего клика.
            </p>
          </div>
        ) : null}

        {selected ? (
          <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
            Голос: {selected.voice} Эмодзи: {selected.emojiGuide}
          </p>
        ) : null}

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Field label="Площадка" className="min-w-0">
            <Select value={platform} onChange={(event) => setPlatform(event.target.value)}>
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
              <option value="linkedin">LinkedIn</option>
              <option value="x">X</option>
            </Select>
          </Field>
          <Field label="Язык текста" className="min-w-0">
            <Select value={language} onChange={(event) => setLanguage(event.target.value)}>
              <option value="en">English</option>
              <option value="ru">Русский</option>
            </Select>
          </Field>
          <Field label="Постов на проект" className="min-w-0">
            <Select value={String(postCount)} onChange={(event) => setPostCount(Number(event.target.value))}>
              {[1, 2, 3, 4, 5].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Картинок на пост" className="min-w-0">
            <Select value={String(imageCount)} onChange={(event) => setImageCount(Number(event.target.value))}>
              {[1, 2, 3, 4, 5, 6].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-3">
          <Field label="Тема промпта" className="min-w-0">
            <Textarea
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              rows={4}
              placeholder="Например: утренний ритуал обучения, запуск летнего пакета, 3 причины вернуться в продукт…"
            />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => void generate()} disabled={busy || selectedIds.length === 0 || topic.trim().length < 3}>
            {busy ? "Генерирую…" : generateLabel}
          </Button>
          <span className="text-xs text-[var(--muted)]">
            {planned.textCalls} запрос{planned.textCalls === 1 ? "" : planned.textCalls < 5 ? "а" : "ов"} текста + {planned.totalImages} картинок
            (лимит 12).
            {planned.postCount !== postCount || planned.imageCount !== imageCount
              ? ` Урезано до ${planned.postCount} постов × ${planned.imageCount} картинок на проект.`
              : ""}
            {busy ? " Обычно 1–4 мин." : ""}
          </span>
        </div>
        {error ? <Alert className="mt-3">{error}</Alert> : null}
      </Card>

      {projectResults.map((project, projectIndex) => {
        const packs =
          project.packs && project.packs.length > 0
            ? project.packs
            : [{ post: project.post, images: project.images, imageErrors: project.imageErrors ?? [] }];
        return (
          <div key={project.brand.slug || projectIndex} className="space-y-3">
            {projectResults.length > 1 ? (
              <h2 className="text-[15px] font-semibold tracking-tight">{project.brand.displayName}</h2>
            ) : null}
            {packs.map((pack, packIndex) => {
              const copyKey = `${projectIndex}-${packIndex}`;
              return (
                <div key={copyKey} className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                  <Card>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-[15px] font-semibold tracking-tight">
                        Текст поста {packs.length > 1 ? packIndex + 1 : ""}
                      </h3>
                      <Button type="button" variant="secondary" onClick={() => void copyPost(copyKey, pack.post.fullPost)}>
                        <Copy size={14} />
                        {copied === copyKey ? "Скопировано" : "Копировать"}
                      </Button>
                    </div>
                    <pre className="whitespace-pre-wrap rounded-[12px] bg-[#f8f8fa] p-4 text-[13.5px] leading-relaxed text-[var(--text)]">
                      {pack.post.fullPost}
                    </pre>
                    <div className="mt-3 grid gap-2 text-xs text-[var(--muted)]">
                      <div>
                        <span className="font-semibold text-[var(--text)]">Дисклеймер: </span>
                        {pack.post.disclaimer}
                      </div>
                      <div>
                        <span className="font-semibold text-[var(--text)]">CTA: </span>
                        {pack.post.cta}
                      </div>
                    </div>
                  </Card>

                  <Card>
                    <h3 className="mb-3 text-[15px] font-semibold tracking-tight">
                      Картинки к посту {packs.length > 1 ? packIndex + 1 : ""}
                      {pack.images.length ? ` (${pack.images.length})` : ""}
                    </h3>
                    {(pack.imageErrors ?? []).length ? (
                      <Alert className="mb-3" tone="warn">
                        {(pack.imageErrors ?? []).join(" · ")}
                      </Alert>
                    ) : null}
                    {pack.images.length === 0 ? (
                      <EmptyState title="Нет изображений" hint="Текст готов. Повторите генерацию или уменьшите число картинок." />
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        {pack.images.map((image) => (
                          <figure key={`${copyKey}-${image.index}`} className="overflow-hidden rounded-[14px] border border-[var(--border)]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={image.dataUrl} alt={`Пост ${packIndex + 1}, кадр ${image.index + 1}`} className="aspect-square w-full object-cover" />
                            <figcaption className="flex items-center justify-between px-2 py-1.5 text-[11px] text-[var(--muted)]">
                              <span>#{image.index + 1}</span>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 font-medium text-[var(--accent)]"
                                onClick={() => downloadImage(image, project.brand.slug || "post", packIndex)}
                              >
                                <Download size={12} />
                                PNG
                              </button>
                            </figcaption>
                          </figure>
                        ))}
                      </div>
                    )}
                  </Card>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const picker = normalizeHex(value) || "#000000";
  return (
    <label className="min-w-0">
      <span className="ui-label">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={picker}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="h-9 w-9 cursor-pointer rounded-[10px] border border-[var(--border)] bg-white p-0.5"
          aria-label={label}
        />
        <Input value={value} onChange={(event) => onChange(event.target.value)} spellCheck={false} />
      </div>
    </label>
  );
}
