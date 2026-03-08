import React, { useState, useEffect, useMemo } from "react";
import {
  Button,
  Card,
  Elevation,
  InputGroup,
  Intent,
  HTMLTable,
  Tag,
  Callout,
  Menu,
  MenuItem,
  Popover,
  Position,
} from "@blueprintjs/core";
import { useTranslation } from "react-i18next";

interface FilteringViewProps {
  profileId: string;
}

export const FilteringView: React.FC<FilteringViewProps> = ({ profileId }) => {
  const [lists, setLists] = useState<any[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const { t } = useTranslation();

  const PRESET_LISTS = useMemo(() => [
    { label: t("filtering.presetOisdBig"), url: "https://big.oisd.nl" },
    { label: t("filtering.presetOisdNsfw"), url: "https://nsfw.oisd.nl" },
    {
      label: t("filtering.presetAdGuard"),
      url: "https://adguardteam.github.io/AdguardFilters/BaseFilter/sections/adservers.txt",
    },
    {
      label: t("filtering.presetStevenBlack"),
      url: "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
    },
  ], [t]);

  const fetchData = async () => {
    setLoading(true);
    const res = await fetch(`/api/profiles/${profileId}/filters`);
    const data = await res.json();
    setLists(data.lists);
    setLoading(false);
  };

  const addList = async (urlToAdd?: string) => {
    const url = urlToAdd || newUrl;
    if (!url) return;
    setSyncing(true);
    await fetch(`/api/profiles/${profileId}/lists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    setNewUrl("");
    fetchData();
    setSyncing(false);
  };

  const deleteList = async (id: number) => {
    await fetch(`/api/profiles/${profileId}/lists`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchData();
  };

  const syncLists = async () => {
    setSyncing(true);
    await fetch(`/api/profiles/${profileId}/lists/sync`, {
      method: "POST",
    });
    setTimeout(fetchData, 2000);
    setSyncing(false);
  };

  useEffect(() => {
    fetchData();
  }, [profileId]);

  const presetMenu = (
    <Menu className="min-w-96">
      {PRESET_LISTS.map((preset, i) => (
        <MenuItem
          key={i}
          text={preset.label}
          onClick={() => addList(preset.url)}
          disabled={lists.some((l) => l.url === preset.url)}
          labelElement={
            <div className="flex flex-col items-end text-right">
              <span className="text-[9px] opacity-85 max-w-xl truncate" title={preset.url}>
                {preset.url}
              </span>
            </div>
          }
        />
      ))}
    </Menu>
  );

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h2 className="bp6-heading">{t("filtering.title")}</h2>
          <p className="bp6-text-muted">
            {t("filtering.subtitle")}
          </p>
        </div>
        <Button
          icon="refresh"
          text={t("filtering.syncAll")}
          onClick={syncLists}
          loading={syncing}
          intent={Intent.NONE}
        />
      </div>

      <Card elevation={Elevation.ONE} className="mb-6">
        <div className="flex gap-2 flex-col sm:flex-row">
          <InputGroup
            fill
            size="large"
            placeholder={t("filtering.urlPlaceholder")}
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            leftIcon="globe"
            rightElement={
              <Popover
                content={presetMenu}
                position={Position.BOTTOM_LEFT}
                minimal={true}
                usePortal={true}
              >
                <Button variant="minimal" icon="chevron-down" />
              </Popover>
            }
          />
          <Button
            intent={Intent.PRIMARY}
            size="large"
            icon="plus"
            onClick={() => addList()}
            className="shrink-0"
            loading={syncing}
          >
            {t("filtering.addSubscription")}
          </Button>
        </div>
        <Callout
          intent={Intent.PRIMARY}
          icon="info-sign"
          className="mt-4 border-none bg-blue-50/50 dark:bg-blue-900/10"
        >
          <div className="text-xs space-y-2">
            <p className="font-bold">{t("filtering.supportedFormats")}</p>
            <ul className="list-disc list-inside space-y-1 opacity-80">
              <li>
                <strong>AdGuard / uBlock:</strong> {t("filtering.formatAdGuard")}
              </li>
              <li>
                <strong>Hosts 格式:</strong> {t("filtering.formatHosts")}
              </li>
            </ul>
          </div>
        </Callout>
      </Card>

      {lists.length === 0 && !loading ? (
        <Callout icon="warning-sign" title={t("filtering.noListsTitle")}>
          {t("filtering.noListsDesc")}
        </Callout>
      ) : (
        <HTMLTable interactive striped className="w-full">
          <thead>
            <tr>
              <th>{t("filtering.tableUrl")}</th>
              <th>{t("filtering.tableLastSync")}</th>
              <th>{t("filtering.tableStatus")}</th>
              <th className="text-right">{t("filtering.tableOps")}</th>
            </tr>
          </thead>
          <tbody>
            {lists.map((list) => (
              <tr key={list.id}>
                <td className="font-mono text-sm max-w-md truncate">
                  {list.url}
                </td>
                <td className="text-xs opacity-60">
                  {list.last_synced_at
                    ? new Date(list.last_synced_at * 1000).toLocaleString()
                    : t("filtering.neverSynced")}
                </td>
                <td>
                  <Tag
                    intent={list.enabled ? Intent.SUCCESS : Intent.NONE}
                    minimal
                  >
                    {list.enabled ? t("filtering.enabled") : t("filtering.disabled")}
                  </Tag>
                </td>
                <td className="text-right">
                  <Button
                    icon="trash"
                    variant="minimal"
                    intent={Intent.DANGER}
                    onClick={() => deleteList(list.id)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </HTMLTable>
      )}
    </div>
  );
};
