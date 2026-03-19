import React, { useState, useEffect } from "react";
import {
  Card,
  Elevation,
  H5,
  Spinner,
  Tag,
  Intent,
  HTMLTable,
  Section,
  ButtonGroup,
  Button,
  Popover,
  FormGroup,
  InputGroup,
} from "@blueprintjs/core";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Shield,
  ShieldAlert,
  Zap,
  Globe,
  MapPin,
  Calendar,
  RotateCcw,
} from "lucide-react";
import { useTranslation } from "react-i18next";

interface AnalyticsData {
  summary: { action: string; count: number }[];
  trend: { timestamp: number; action: string; count: number }[];
  top_allowed: { domain: string; count: number }[];
  top_blocked: { domain: string; count: number }[];
  clients: { client_ip: string; geo_country: string; count: number }[];
  destinations: { dest_geoip: string; count: number }[];
}

type TimeRange = "10m" | "1h" | "24h" | "7d" | "30d" | "custom";

export const AnalyticsView: React.FC<{ profileId: string }> = ({
  profileId,
}) => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();
  const [range, setRange] = useState<TimeRange>("24h");
  const [customRange, setCustomRange] = useState({ start: "", end: "" });

  const fetchData = async (
    selectedRange: TimeRange,
    customStart?: string,
    customEnd?: string,
  ) => {
    setLoading(true);
    try {
      let url = `/api/profiles/${profileId}/analytics?range=${selectedRange}`;
      if (selectedRange === "custom" && customStart && customEnd) {
        const startTs = Math.floor(new Date(customStart).getTime() / 1000);
        const endTs = Math.floor(new Date(customEnd).getTime() / 1000);
        url += `&start=${startTs}&end=${endTs}`;
      }
      const res = await fetch(url);
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error("Failed to fetch analytics", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (range !== "custom") {
      fetchData(range);
    }
  }, [profileId, range]);

  if (loading && !data)
    return (
      <div className="p-20 flex justify-center">
        <Spinner size={50} />
      </div>
    );

  // 处理趋势图数据
  const processTrendData = () => {
    if (!data) return [];

    const trendMap: Record<
      number,
      { timestamp: number; allowed: number; blocked: number; redirected: number }
    > = {};

    // 计算时间范围和步长
    let until = Math.floor(Date.now() / 1000);
    let since: number;
    let interval: number;

    switch (range) {
      case "10m":
        interval = 60;
        since = until - 10 * 60;
        break;
      case "1h":
        interval = 60;
        since = until - 60 * 60;
        break;
      case "24h":
        interval = 3600;
        since = until - 24 * 3600;
        break;
      case "7d":
        interval = 86400;
        since = until - 7 * 86400;
        break;
      case "30d":
        interval = 86400;
        since = until - 30 * 86400;
        break;
      case "custom":
        interval = 3600;
        if (customRange.start && customRange.end) {
          since = Math.floor(new Date(customRange.start).getTime() / 1000);
          until = Math.floor(new Date(customRange.end).getTime() / 1000);
        } else {
          const ts = data.trend.map((t) => t.timestamp);
          since = ts.length ? Math.min(...ts) : until - 86400;
          until = ts.length ? Math.max(...ts) : until;
        }
        break;
      default:
        interval = 3600;
        since = until - 24 * 3600;
    }

    since = Math.floor(since / interval) * interval;
    until = Math.floor(until / interval) * interval;

    // 预填充所有时间点
    for (let t = since; t <= until; t += interval) {
      trendMap[t] = {
        timestamp: t,
        allowed: 0,
        blocked: 0,
        redirected: 0,
      };
    }

    data.trend.forEach((t) => {
      // 找到最近的步长对齐点
      const ts = Math.floor(t.timestamp / interval) * interval;
      if (!trendMap[ts]) {
        trendMap[ts] = {
          timestamp: ts,
          allowed: 0,
          blocked: 0,
          redirected: 0,
        };
      }
      if (t.action === "PASS") trendMap[ts].allowed += t.count;
      else if (t.action === "BLOCK") trendMap[ts].blocked += t.count;
      else if (t.action === "REDIRECT") trendMap[ts].redirected += t.count;
    });

    return Object.keys(trendMap)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => trendMap[Number(k)]);
  };

  const chartData = processTrendData();
  const total = data?.summary.reduce((acc, s) => acc + s.count, 0) || 0;
  const blocked = data?.summary.find((s) => s.action === "BLOCK")?.count || 0;
  const redirected = data?.summary.find((s) => s.action === "REDIRECT")?.count || 0;
  const blockRate = total > 0 ? ((blocked / total) * 100).toFixed(1) : "0.0";
  const nowStr = new Date().toLocaleString("sv-SE").replace(" ", "T").slice(0, 16);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* 时间区间选择器 */}
      <div className="flex justify-between items-center bg-white dark:bg-gray-900 p-2 rounded-lg shadow-sm border border-gray-100 dark:border-gray-800">
        <ButtonGroup variant="minimal">
          {(["10m", "1h", "24h", "7d", "30d"] as TimeRange[]).map((r) => (
            <Button
              key={r}
              active={range === r}
              onClick={() => setRange(r)}
              text={r.toUpperCase()}
            />
          ))}
          <Popover
            content={
              <div className="p-4 space-y-4 w-64">
                <H5>{t("analytics.customRange")}</H5>
                <FormGroup label={t("analytics.startTime")}>
                  <InputGroup
                    type="datetime-local"
                    max={customRange.end || nowStr}
                    value={customRange.start}
                    onChange={(e) =>
                      setCustomRange({ ...customRange, start: e.target.value })
                    }
                  />
                </FormGroup>
                <FormGroup label={t("analytics.endTime")}>
                  <InputGroup
                    type="datetime-local"
                    min={customRange.start}
                    max={nowStr}
                    value={customRange.end}
                    onChange={(e) =>
                      setCustomRange({ ...customRange, end: e.target.value })
                    }
                  />
                </FormGroup>
                <Button
                  fill
                  intent={Intent.PRIMARY}
                  text={t("analytics.apply")}
                  onClick={() => {
                    setRange("custom");
                    fetchData("custom", customRange.start, customRange.end);
                  }}
                />
              </div>
            }
          >
            <Button
              active={range === "custom"}
              icon={<Calendar size={14} className="mr-1" />}
              text={t("analytics.custom")}
            />
          </Popover>
        </ButtonGroup>
        {loading && <Spinner size={16} />}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
        <MetricCard title={t("analytics.totalQueries")} value={total.toLocaleString()} icon={<Zap className="text-blue-500" size={20} />} />
        <MetricCard title={t("analytics.blocked")} value={blocked.toLocaleString()} icon={<ShieldAlert className="text-red-500" size={20} />} />
        <MetricCard title={t("analytics.redirected")} value={redirected.toLocaleString()} icon={<RotateCcw className="text-amber-500" size={20} />} />
        <MetricCard title={t("analytics.blockRate")} value={`${blockRate}%`} icon={<Shield className="text-green-500" size={20} />} />
        <MetricCard title={t("analytics.activeDevices")} value={data?.clients.length.toString() || "0"} icon={<Globe className="text-purple-500" size={20} />}  />
      </div>

      <Card elevation={Elevation.ONE} className="dark:bg-gray-900 dark:border-gray-800 relative">
        <H5 className="mb-4 font-bold flex items-center gap-2">
          {t("analytics.queryTrend")} <Tag minimal round>{range === "custom" ? t("analytics.custom") : range.toUpperCase()}</Tag>
        </H5>
        <div className="h-64 w-full">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={256} minHeight={0} minWidth={0} debounce={50}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorAllowed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorBlocked" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} /><stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorRedirected" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} /><stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#88888822" />
                <XAxis
                  dataKey="timestamp"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "#888" }}
                  tickFormatter={(ts) => {
                    const d = new Date(ts * 1000);
                    if (range === "10m" || range === "1h") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                    if (range === "24h") return d.getHours() + ":00";
                    return d.toLocaleDateString([], { month: "short", day: "numeric" });
                  }}
                  interval="preserveStartEnd"
                  minTickGap={30}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#888" }} allowDecimals={false} domain={[0, (dataMax: number) => Math.max(1, dataMax)]} />
                <RechartsTooltip
                  isAnimationActive={true}
                  shared={true}
                  labelFormatter={(ts) => {
                    const d = new Date(ts * 1000);
                    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                  }}
                  contentStyle={{
                    borderRadius: "16px", border: "1px solid rgba(255, 255, 255, 0.3)", boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1), inset 0 0 4px rgba(255, 255, 255, 0.4)",
                    color: "#d6d6d6", fontFamily: "monospace", backgroundColor: "#fefefe22", backdropFilter: "blur(10px) saturate(180%)",
                  }}
                />
                <Area type="monotone" dataKey="allowed" stroke="#10b981" fillOpacity={1} fill="url(#colorAllowed)" strokeWidth={2} />
                <Area type="monotone" dataKey="blocked" stroke="#ef4444" fillOpacity={1} fill="url(#colorBlocked)" strokeWidth={2} />
                <Area type="monotone" dataKey="redirected" stroke="#f59e0b" fillOpacity={1} fill="url(#colorRedirected)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center opacity-30 italic">{t("analytics.noRecords")}</div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RankTable title={t("analytics.topAllowed")} data={data?.top_allowed || []} intent={Intent.SUCCESS} />
        <RankTable title={t("analytics.topBlocked")} data={data?.top_blocked || []} intent={Intent.DANGER} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title={t("analytics.clientActivity")} icon={<Globe size={16} />}>
          <HTMLTable striped className="w-full mt-2">
            <thead>
              <tr>
                <th className="text-xs uppercase opacity-60">{t("analytics.ipAddress")}</th>
                <th className="text-xs uppercase opacity-60">{t("analytics.location")}</th>
                <th className="text-xs uppercase opacity-60 text-right">{t("analytics.queries")}</th>
              </tr>
            </thead>
            <tbody>
              {data?.clients.map((c, i) => (
                <tr key={i}>
                  <td className="font-mono text-xs">{c.client_ip}</td>
                  <td><Tag minimal>{getFlagEmoji(c.geo_country)}</Tag></td>
                  <td className="text-right font-bold">{c.count}</td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>
        </Section>

        <Section title={t("analytics.destinationDistribution")} icon={<MapPin size={16} />}>
          <div className="flex flex-wrap gap-4 mt-4 p-2">
            {data?.destinations.map((d, i) => {
              const geo = JSON.parse(d.dest_geoip);
              return (
                <div key={i} className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 p-2 rounded-lg border border-transparent hover:border-blue-500 transition-all cursor-default">
                  <span className="text-lg">{getFlagEmoji(geo.country_code)}</span>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold leading-none">{geo.country}</span>
                    <span className="text-[10px] opacity-60">{d.count} {t("analytics.requests")}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      </div>
    </div>
  );
};

const MetricCard = ({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) => (
  <Card elevation={Elevation.ZERO} className="flex items-center gap-4 p-4 dark:bg-gray-900 dark:border-gray-800 border border-gray-100 shadow-sm">
    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">{icon}</div>
    <div>
      <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">{title}</div>
      <div className="text-xl font-bold dark:text-white">{value}</div>
    </div>
  </Card>
);

const RankTable = ({ title, data, intent }: { title: string; data: { domain: string; count: number }[]; intent: Intent }) => {
  const { t } = useTranslation();
  return (
    <Card elevation={Elevation.ZERO} className="dark:bg-gray-900 dark:border-gray-800 border border-gray-100 shadow-sm">
      <H5 className="mb-4 font-bold">{title}</H5>
      <HTMLTable striped className="w-full">
        <tbody>
          {data.map((d, i) => (
            <tr key={i}>
              <td className="w-8 opacity-30 font-mono text-xs">{i + 1}</td>
              <td className="font-medium text-sm truncate max-w-50">{d.domain}</td>
              <td className="text-right"><Tag minimal intent={intent} className="font-bold">{d.count}</Tag></td>
            </tr>
          ))}
          {data.length === 0 && (
            <tr><td colSpan={3} className="text-center py-8 opacity-50">{t("analytics.noData")}</td></tr>
          )}
        </tbody>
      </HTMLTable>
    </Card>
  );
};

function getFlagEmoji(countryCode: string) {
  if (!countryCode) return "🌐";
  const codePoints = countryCode.toUpperCase().split("").map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}
