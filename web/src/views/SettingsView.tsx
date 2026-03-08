import React, { useState, useEffect, useMemo } from "react";
import {
  Card,
  Elevation,
  H5,
  FormGroup,
  InputGroup,
  Button,
  Switch,
  HTMLSelect,
  Intent,
  Spinner,
  Menu,
  MenuItem,
  Popover,
  Position,
  Tag,
  Divider,
  Callout,
  OverlayToaster,
} from "@blueprintjs/core";
import {
  Server,
  Shield,
  Clock,
  Globe,
  Zap,
  MapPin,
  Activity,
} from "lucide-react";
import { useTranslation } from "react-i18next";

interface ProfileSettings {
  upstream: string[]; // DoH URLs
  ecs: {
    enabled: boolean;
    use_client_ip: boolean;
    ipv4_cidr?: string;
    ipv6_cidr?: string;
  };
  log_retention_days: number;
  default_policy: "ALLOW" | "BLOCK";
}

interface Profile {
  id: string; // 6-char ID
  owner_id: string;
  name: string;
  settings: string; // JSON string of ProfileSettings
  created_at: number;
  updated_at: number;
}

interface SettingsViewProps {
  profileId: string;
  toasterRef?: React.RefObject<OverlayToaster | null>;
}

interface ResolutionResult {
  answer: any;
  ttl: number;
  action: "PASS" | "BLOCK" | "REDIRECT" | "FAIL";
  reason?: string;
  latency?: number;
  timings?: Record<string, number>;
  diagnostics?: {
    upstream_url: string;
    method: string;
    status: number;
    response_text?: string;
    sent_dns_param?: string;
  };
}

interface TestResponse extends ResolutionResult {
  client_ip: string;
  geo_country: string;
  answers: { type: string; data: string; ttl: number }[];
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  profileId,
  toasterRef,
}) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<ProfileSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { t } = useTranslation();

  const PRESET_UPSTREAMS = useMemo(() => [
    {
      label: t("settings.presetCloudflareSecurity"),
      url: "https://security.cloudflare-dns.com/dns-query",
    },
    {
      label: t("settings.presetCloudflareFamilies"),
      url: "https://family.cloudflare-dns.com/dns-query",
    },
    {
      label: t("settings.presetQuad9"),
      url: "https://dns.quad9.net/dns-query",
    },
    {
      label: t("settings.presetQuad9Ecs"),
      url: "https://dns11.quad9.net/dns-query",
    },
    {
      label: t("settings.presetControlDFree"),
      url: "https://freedns.controld.com/no-ads-malware-typo",
    },
    {
      label: t("settings.presetControlDUncensored"),
      url: "https://freedns.controld.com/uncensored",
    },
    {
      label: t("settings.presetAdGuard"),
      url: "https://dns.adguard-dns.com/dns-query",
    },
    {
      label: t("settings.presetAdGuardFamily"),
      url: "https://family.adguard-dns.com/dns-query",
    },
  ], [t]);

  const LOG_RETENTION_OPTIONS = useMemo(() => [
    { label: t("settings.retention10m"), value: 0.007 },
    { label: t("settings.retention1h"), value: 0.0416 },
    { label: t("settings.retention24h"), value: 1 },
    { label: t("settings.retention7d"), value: 7 },
    { label: t("settings.retention30d"), value: 30 },
    { label: t("settings.retention180d"), value: 180 },
    { label: t("settings.retention360d"), value: 360 },
    { label: t("settings.retention720d"), value: 720 },
  ], [t]);

  // DNS 测试相关状态
  const [testInput, setTestInput] = useState({
    domain: "o-o.myaddr.l.google.com",
    type: "TXT",
  });
  const [testResult, setTestResult] = useState<TestResponse | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch(`/api/profiles/${profileId}`);
        const data = await res.json();
        setProfile(data);
        setSettings(JSON.parse(data.settings));
        return profile;
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [profileId]);

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/profiles/${profileId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        toasterRef?.current?.show({
          message: t("settings.saveSuccess"),
          intent: Intent.SUCCESS,
          icon: "tick",
        });
      } else {
        throw new Error("Failed to save");
      }
    } catch (e) {
      console.error(e);
      toasterRef?.current?.show({
        message: t("settings.saveError"),
        intent: Intent.DANGER,
        icon: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDnsTest = async () => {
    if (!testInput.domain) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/profiles/${profileId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testInput),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (e) {
      console.error(e);
    } finally {
      setTesting(false);
    }
  };

  if (loading || !settings)
    return (
      <div className="p-20 flex justify-center">
        <Spinner />
      </div>
    );

  const upstreamMenu = (
    <Menu className="min-w-96">
      {PRESET_UPSTREAMS.map((preset, i) => (
        <MenuItem
          key={i}
          text={preset.label}
          onClick={() => setSettings({ ...settings, upstream: [preset.url] })}
          labelElement={
            <div className="flex flex-col items-end text-right">
              <span
                className="text-[9px] opacity-85 max-w-64 truncate"
                title={preset.url}
              >
                {preset.url}
              </span>
            </div>
          }
        />
      ))}
    </Menu>
  );

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 pb-20">
      <div className="mb-6 flex justify-between items-center">
        <div className="flex flex-col justify-start">
          <h2 className="bp6-heading">{t("settings.title")}</h2>
          <p className="bp6-text-muted">{t("settings.subtitle")}</p>
        </div>
        <Button
          size="large"
          intent={Intent.PRIMARY}
          icon="floppy-disk"
          text={t("settings.saveChanges")}
          onClick={saveSettings}
          loading={saving}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 上游服务器设置 */}
        <Card
          elevation={Elevation.ONE}
          className="dark:bg-gray-900 dark:border-gray-800"
        >
          <H5 className="flex items-center gap-2 mb-4 font-bold">
            <Server size={18} className="text-blue-500" /> {t("settings.upstreamTitle")}
          </H5>
          <FormGroup label={t("settings.dohUrl")} labelInfo={t("settings.httpsOnly")}>
            <InputGroup
              fill
              placeholder="https://dns.example.net/dns-query"
              value={settings.upstream?.[0] || ""}
              onChange={(e) =>
                setSettings({ ...settings, upstream: [e.target.value] })
              }
              onFocus={(e) => {
                e.target.select();
              }}
              rightElement={
                <Popover
                  content={upstreamMenu}
                  position={Position.BOTTOM_RIGHT}
                  minimal={true}
                >
                  <Button variant="minimal" icon="chevron-down" />
                </Popover>
              }
            />
          </FormGroup>
          <p className="text-xs opacity-60">
            {t("settings.upstreamDesc")}
          </p>
        </Card>

        {/* 默认策略 */}
        <Card
          elevation={Elevation.ONE}
          className="dark:bg-gray-900 dark:border-gray-800"
        >
          <H5 className="flex items-center gap-2 mb-4 font-bold">
            <Shield size={18} className="text-green-500" /> {t("settings.defaultPolicyTitle")}
          </H5>
          <FormGroup label={t("settings.onNoMatch")}>
            <HTMLSelect
              fill
              value={settings.default_policy}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  default_policy: e.target.value as any,
                })
              }
            >
              <option value="ALLOW">
                {t("settings.allowAll")}
              </option>
              <option value="BLOCK">
                {t("settings.blockAll")}
              </option>
            </HTMLSelect>
          </FormGroup>
        </Card>

        {/* 隐私与日志 */}
        <Card
          elevation={Elevation.ONE}
          className="dark:bg-gray-900 dark:border-gray-800"
        >
          <H5 className="flex items-center gap-2 mb-4 font-bold">
            <Clock size={18} className="text-purple-500" /> {t("settings.logRetentionTitle")}
          </H5>
          <FormGroup label={t("settings.retentionDuration")}>
            <HTMLSelect
              fill
              value={settings.log_retention_days}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  log_retention_days: parseFloat(e.target.value),
                })
              }
            >
              {LOG_RETENTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </HTMLSelect>
          </FormGroup>
          <p className="text-xs opacity-60">
            {t("settings.retentionDesc")}
          </p>
        </Card>

        {/* 高级设置 */}
        <Card
          elevation={Elevation.ONE}
          className="dark:bg-gray-900 dark:border-gray-800"
        >
          <H5 className="flex items-center gap-2 mb-4 font-bold">
            <Globe size={18} className="text-orange-500" /> {t("settings.ecsTitle")}
          </H5>
          <div className="space-y-4">
            <Switch
              label={t("settings.sendEcs")}
              checked={settings.ecs.enabled}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  ecs: { ...settings.ecs, enabled: e.currentTarget.checked },
                })
              }
            />
            <Switch
              label={t("settings.customSubnet")}
              disabled={!settings.ecs.enabled}
              checked={!settings.ecs.use_client_ip}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  ecs: {
                    ...settings.ecs,
                    use_client_ip: !e.currentTarget.checked,
                  },
                })
              }
            />

            <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
              <FormGroup
                label={t("settings.customIpv4")}
                labelInfo={t("settings.ipv4Hint")}
                disabled={
                  !(settings.ecs.enabled && !settings.ecs.use_client_ip)
                }
              >
                <InputGroup
                  placeholder="0.0.0.0/0"
                  value={settings.ecs.ipv4_cidr || ""}
                  disabled={
                    !(settings.ecs.enabled && !settings.ecs.use_client_ip)
                  }
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      ecs: { ...settings.ecs, ipv4_cidr: e.target.value },
                    })
                  }
                />
              </FormGroup>
              <FormGroup
                label={t("settings.customIpv6")}
                labelInfo={t("settings.ipv6Hint")}
                disabled={
                  !(settings.ecs.enabled && !settings.ecs.use_client_ip)
                }
              >
                <InputGroup
                  placeholder="::/0"
                  value={settings.ecs.ipv6_cidr || ""}
                  disabled={
                    !(settings.ecs.enabled && !settings.ecs.use_client_ip)
                  }
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      ecs: { ...settings.ecs, ipv6_cidr: e.target.value },
                    })
                  }
                />
              </FormGroup>
            </div>
          </div>
        </Card>
      </div>

      {/* DNS 实时测试模块 */}
      <Card
        elevation={Elevation.TWO}
        className="dark:bg-gray-900 border-t-2 border-blue-500"
      >
        <H5 className="flex items-center gap-2 mb-6 font-bold">
          <Zap size={20} className="text-yellow-500 fill-yellow-500" />{" "}
          {t("settings.testToolTitle")}
        </H5>

        <div className="flex flex-col space-y-6">
          <div className="flex gap-4">
            <FormGroup label={t("settings.testDomain")} className="flex-1 mb-0">
              <InputGroup
                fill
                large
                placeholder={t("settings.domainPlaceholder")}
                value={testInput.domain}
                onChange={(e) =>
                  setTestInput({ ...testInput, domain: e.target.value })
                }
                onKeyDown={(e) => e.key === "Enter" && handleDnsTest()}
              />
            </FormGroup>
            <FormGroup label={t("settings.recordType")} className="w-32 mb-0">
              <HTMLSelect
                fill
                large
                value={testInput.type}
                onChange={(e) =>
                  setTestInput({ ...testInput, type: e.target.value })
                }
              >
                <option value="A">A</option>
                <option value="AAAA">AAAA</option>
                <option value="CNAME">CNAME</option>
                <option value="TXT">TXT</option>
              </HTMLSelect>
            </FormGroup>
            <FormGroup label={"\u00A0"} className="mb-0">
              <Button
                size="large"
                intent={Intent.PRIMARY}
                icon="search"
                text={t("settings.runTest")}
                onClick={handleDnsTest}
                loading={testing}
              />
            </FormGroup>
          </div>

          {testResult && (
            <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-xl border border-gray-100 dark:border-gray-800 space-y-6 animate-in fade-in slide-in-from-top-4">
              <div className="flex flex-wrap gap-4 items-center">
                <Tag
                  large
                  round
                  intent={
                    testResult.action === "PASS"
                      ? Intent.SUCCESS
                      : testResult.action === "BLOCK"
                        ? Intent.DANGER
                        : Intent.WARNING
                  }
                  className="px-4 font-bold"
                >
                  {testResult.action}
                </Tag>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold opacity-40">
                    {t("settings.hitRule")}
                  </span>
                  <span className="text-sm font-bold">
                    {testResult.reason || t("settings.defaultAllow")}
                  </span>
                </div>
                <div className="flex flex-col border-l border-gray-200 dark:border-gray-700 pl-4">
                  <span className="text-[10px] uppercase font-bold opacity-40">
                    {t("settings.parseLatency")}
                  </span>
                  <span className="text-sm font-mono font-bold">
                    {testResult.latency ? `${testResult.latency}ms` : "-"}
                  </span>
                </div>
                {testResult.timings && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 border-l border-gray-200 dark:border-gray-700 pl-4 max-w-md">
                    {Object.entries(testResult.timings).map(([stage, ms]) => (
                      <div key={stage} className="flex gap-1 items-baseline">
                        <span className="text-[9px] opacity-40 uppercase font-mono">
                          {stage}:
                        </span>
                        <span className="text-[10px] font-mono font-bold">
                          {ms}ms
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <Divider />
                <div className="flex items-center gap-2 bg-white dark:bg-gray-900 px-3 py-1.5 rounded-lg shadow-sm border border-gray-100 dark:border-gray-800">
                  <MapPin size={14} className="text-red-500" />
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold opacity-40 leading-none">
                      {t("settings.sourceIp")}
                    </span>
                    <span className="text-xs font-mono">
                      {testResult.client_ip} ({testResult.geo_country})
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-[10px] uppercase font-bold opacity-40 flex items-center gap-1">
                  <Activity size={10} /> {t("settings.answerSection")}
                </div>
                <div className="font-mono text-sm leading-relaxed bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-800 shadow-inner">
                  {testResult.answers && testResult.answers.length > 0 ? (
                    testResult.answers.map((a: any, i: number) => (
                      <div
                        key={i}
                        className="flex gap-4 py-1 border-b border-gray-50 dark:border-gray-800 last:border-0 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors px-2"
                      >
                        <span className="w-16 font-bold text-blue-500">
                          {a.type}
                        </span>
                        <span className="flex-1 dark:text-gray-300">
                          {a.data}
                        </span>
                        <span className="text-[10px] opacity-30 italic">
                          TTL: {a.ttl}s
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 opacity-40 italic text-center">
                      {t("settings.noRecordsReturned")}
                    </div>
                  )}
                </div>
              </div>

              {testResult.diagnostics && (
                <Callout
                  minimal
                  intent={Intent.NONE}
                  className="text-xs font-mono opacity-80"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between">
                      <span className="font-bold">{t("settings.diagnostics")}</span>
                      <span>HTTP {testResult.diagnostics.status}</span>
                    </div>
                    <div className="break-all">
                      {testResult.diagnostics.upstream_url}
                    </div>
                  </div>
                </Callout>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
