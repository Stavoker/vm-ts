"use client";

import { Activity, PauseCircle, RefreshCw, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { isPausedStatus } from "@/lib/traffic-creator/parse";
import type { TrafficBalance, TrafficCampaign } from "@/lib/traffic-creator/parse";
import { StatCard } from "@/components/ui/stat-card";
import { Pagination, usePagedList } from "@/components/ui/pagination";
import { Alert, Button, Card, CardHeader, EmptyState, Input, LoadingState } from "@/components/ui/primitives";

function formatNumber(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("ru-RU").format(value);
}

export function TrafficCreatorPanel() {
  const [balance, setBalance] = useState<TrafficBalance | null>(null);
  const [campaigns, setCampaigns] = useState<TrafficCampaign[]>([]);
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function load() {
    setError(null);
    const [balanceResponse, campaignsResponse] = await Promise.all([
      fetch("/api/traffic-creator/balance"),
      fetch("/api/traffic-creator/campaigns"),
    ]);
    const balanceData = await balanceResponse.json();
    const campaignsData = await campaignsResponse.json();
    if (!balanceResponse.ok) throw new Error(balanceData.error || "Не удалось загрузить баланс");
    if (!campaignsResponse.ok) throw new Error(campaignsData.error || "Не удалось загрузить кампании");
    setBalance(balanceData.balance as TrafficBalance);
    const next = (campaignsData.campaigns as TrafficCampaign[]) || [];
    setCampaigns(next);
    setLimits(Object.fromEntries(next.map((campaign) => [campaign.id, campaign.daily_limit != null ? String(campaign.daily_limit) : ""])));
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/traffic-creator/balance")
      .then(async (balanceResponse) => {
        const campaignsResponse = await fetch("/api/traffic-creator/campaigns");
        const balanceData = await balanceResponse.json();
        const campaignsData = await campaignsResponse.json();
        if (!balanceResponse.ok) throw new Error(balanceData.error || "Не удалось загрузить баланс");
        if (!campaignsResponse.ok) throw new Error(campaignsData.error || "Не удалось загрузить кампании");
        if (cancelled) return;
        setBalance(balanceData.balance as TrafficBalance);
        const next = (campaignsData.campaigns as TrafficCampaign[]) || [];
        setCampaigns(next);
        setLimits(
          Object.fromEntries(next.map((campaign) => [campaign.id, campaign.daily_limit != null ? String(campaign.daily_limit) : ""])),
        );
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Ошибка");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function runAction(id: string, action: () => Promise<void>) {
    setBusyId(id);
    setError(null);
    setInfo(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusyId(null);
    }
  }

  const pausedCount = useMemo(
    () => campaigns.filter((campaign) => isPausedStatus(campaign.status)).length,
    [campaigns],
  );
  const { page, setPage, totalPages, slice, total } = usePagedList(campaigns);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          Баланс кредитов Traffic Creator и управление кампаниями: пауза, продолжение и визиты в день.
        </p>
        <Button
          type="button"
          onClick={() => {
            setLoading(true);
            void load().catch((err) => setError(err instanceof Error ? err.message : "Ошибка")).finally(() => setLoading(false));
          }}
        >
          <RefreshCw size={14} />
          Обновить
        </Button>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {info ? <Alert tone="ok">{info}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard title="Кредиты на балансе" value={loading ? "…" : formatNumber(balance?.credits ?? null)} hint="Сколько трафика ещё осталось" icon={Wallet} tint="blue" />
        <StatCard title="Кампании" value={loading ? "…" : String(campaigns.length)} icon={Activity} tint="purple" />
        <StatCard title="На паузе" value={loading ? "…" : String(pausedCount)} icon={PauseCircle} tint="orange" />
      </div>

      {balance?.tiers.length ? (
        <Card>
          <CardHeader title="Кредиты по тарифам" />
          <div className="flex flex-wrap gap-3">
            {balance.tiers.map((tier) => (
              <div key={tier.tier} className="rounded-[14px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">{tier.tier}</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">{formatNumber(tier.credits)}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="ui-table-wrap">
        {loading ? (
          <LoadingState />
        ) : campaigns.length === 0 ? (
          <EmptyState title="Кампаний не найдено" hint="Проверьте API-ключ Traffic Creator." />
        ) : (
          <div className="overflow-x-auto">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Кампания</th>
                  <th>Статус</th>
                  <th>Доставлено</th>
                  <th>Осталось</th>
                  <th>Визитов в день</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((campaign) => {
                  const paused = isPausedStatus(campaign.status);
                  return (
                    <tr key={campaign.id} className="align-top">
                      <td>
                        <div className="font-medium text-[var(--text)]">{campaign.name}</div>
                        <div className="text-xs text-[var(--muted)]">{campaign.url || campaign.id}</div>
                        {campaign.traffic_tier ? (
                          <div className="mt-1 text-xs text-[var(--muted)]">{campaign.traffic_tier}</div>
                        ) : null}
                      </td>
                      <td>
                        <span className={`ui-chip capitalize ${paused ? "bg-[#fff4e0] text-[#9a6700]" : "bg-[#e8f8ee] text-[#248a3d]"}`}>
                          {campaign.status}
                        </span>
                      </td>
                      <td className="tabular-nums">
                        {formatNumber(campaign.delivered)}
                        {campaign.total_target != null ? (
                          <div className="text-xs text-[var(--muted)]">из {formatNumber(campaign.total_target)}</div>
                        ) : null}
                      </td>
                      <td className="tabular-nums">{formatNumber(campaign.remaining)}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-28">
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            value={limits[campaign.id] ?? ""}
                            onChange={(e) => setLimits((current) => ({ ...current, [campaign.id]: e.target.value }))}
                          />
                          </div>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={busyId === campaign.id}
                            onClick={() =>
                              void runAction(campaign.id, async () => {
                                const response = await fetch(`/api/traffic-creator/campaigns/${campaign.id}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ daily_limit: Number(limits[campaign.id]) }),
                                });
                                const data = await response.json();
                                if (!response.ok) throw new Error(data.error || "Не удалось сохранить лимит");
                                setInfo(`Дневной лимит «${campaign.name}» обновлён`);
                              })
                            }
                          >
                            Сохранить
                          </Button>
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          {paused ? (
                            <Button
                              type="button"
                              disabled={busyId === campaign.id}
                              onClick={() =>
                                void runAction(campaign.id, async () => {
                                  const response = await fetch(`/api/traffic-creator/campaigns/${campaign.id}/resume`, {
                                    method: "POST",
                                  });
                                  const data = await response.json();
                                  if (!response.ok) throw new Error(data.error || "Не удалось продолжить");
                                  setInfo(`Кампания «${campaign.name}» продолжена`);
                                })
                              }
                            >
                              Продолжить
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={busyId === campaign.id}
                              onClick={() =>
                                void runAction(campaign.id, async () => {
                                  const response = await fetch(`/api/traffic-creator/campaigns/${campaign.id}/pause`, {
                                    method: "POST",
                                  });
                                  const data = await response.json();
                                  if (!response.ok) throw new Error(data.error || "Не удалось остановить");
                                  setInfo(`Кампания «${campaign.name}» поставлена на паузу`);
                                })
                              }
                            >
                              Остановить
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} total={total} onPage={setPage} />
      </div>
    </div>
  );
}
