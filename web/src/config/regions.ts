import type { TFunction } from "i18next";

export interface RegionConfigItem {
  label: string;
  ips: { ip: string; area: string | null }[];
  countries: string[];
}

/**
 * 从环境变量获取地区配置
 * 显式定义以确保 Vite 静态替换机制能正确工作
 * 需在 vite.config.ts 中配置 envPrefix 包含 'IP_REGION_'
 * 
 * .env 文件格式示例:
 * IP_REGION_APAC='[{"ip":"198.41.222.102","area":"SG"},{"ip":"173.245.59.246","area":"SG"}]'
 * IP_REGION_NAE='[{"ip":"1.2.3.4","area":"US"}]'
 */
export const getPresetRegions = (t: TFunction): Record<string, RegionConfigItem> => {
  const regions: Record<string, RegionConfigItem> = {};

  // 定义已知地区的元数据 (Label 和关联国家)
  const regionMeta: Record<string, { label: string; countries: string[] }> = {
    APAC: {
      label: t("common.apac") + " (" + t("common.HongKong") + "/" + t("common.Singapore") + "/" + t("common.Tokyo") + ")",
      countries: ["HK", "SG", "JP", "CN", "TW", "KR", "MY", "TH"],
    },
    NAE: {
      label: t("common.nae") || "North America East",
      countries: ["US", "CA"],
    },
    NAW: {
      label: t("common.naw") || "North America West",
      countries: ["US", "CA"],
    },
    EU: {
      label: t("common.eu") || "Europe",
      countries: ["GB", "FR", "DE", "NL", "IT", "ES"],
    }
  };

  // 辅助函数：解析 JSON 环境字符串
  const parseEnvIps = (val: string | undefined) => {
    if (!val) return null;
    try {
      // 移除可能存在的包裹单引号
      const cleanVal = val.trim().replace(/^'|'$/g, "");
      const parsed = JSON.parse(cleanVal);
      return Array.isArray(parsed) ? parsed : null;
    } catch (e) {
      console.warn("Failed to parse region env value:", val, e);
      return null;
    }
  };

  // 显式获取地区环境变量
  // 注意：此处不再硬编码默认 IP，完全由 env 驱动
  const envConfigs: Record<string, string | undefined> = {
    APAC: import.meta.env.IP_REGION_APAC,
    NAE: import.meta.env.IP_REGION_NAE,
    NAW: import.meta.env.IP_REGION_NAW,
    EU: import.meta.env.IP_REGION_EU,
  };

  Object.entries(envConfigs).forEach(([key, envVal]) => {
    const ips = parseEnvIps(envVal);
    if (ips) {
      regions[key] = {
        label: regionMeta[key]?.label || key,
        countries: regionMeta[key]?.countries || [],
        ips: ips
      };
    }
  });

  // 动态兜底 (仅在支持 Object.keys 的环境下)
  try {
    const env = import.meta.env;
    Object.keys(env).forEach(key => {
      if (key.startsWith("IP_REGION_") && !envConfigs[key.replace("IP_REGION_", "")]) {
        const regionKey = key.replace("IP_REGION_", "");
        const ips = parseEnvIps(env[key]);
        if (ips) {
          regions[regionKey] = {
            label: regionMeta[regionKey]?.label || regionKey,
            countries: regionMeta[regionKey]?.countries || [],
            ips: ips
          };
        }
      }
    });
  } catch (e) {
    // 忽略
  }

  return regions;
};
