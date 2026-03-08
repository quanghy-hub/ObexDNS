import React, { useState, useEffect } from "react";
import {
  Button,
  Card,
  Elevation,
  HTMLTable,
  InputGroup,
  Intent,
  HTMLSelect,
  Tag,
  Callout,
  FormGroup,
} from "@blueprintjs/core";
import {
  Plus,
  Trash2,
  ShieldX,
  CheckCircle,
  ArrowRightLeft,
  Globe,
} from "lucide-react";
import { useTranslation } from "react-i18next";

interface Rule {
  id: number;
  type: "ALLOW" | "BLOCK" | "REDIRECT";
  pattern: string;
  v_a?: string;
  v_aaaa?: string;
  v_txt?: string;
  v_cname?: string;
}

interface RulesViewProps {
  profileId: string;
  prefill?: {
    domain: string;
    type: "ALLOW" | "BLOCK" | "REDIRECT";
    recordType?: string;
  } | null;
  onPrefillUsed?: () => void;
}

export const RulesView: React.FC<RulesViewProps> = ({
  profileId,
  prefill,
  onPrefillUsed,
}) => {
  const [rules, setRules] = useState<Rule[]>([]);
  const [, setLoading] = useState(true);
  const { t } = useTranslation();
  const [newRule, setNewRule] = useState<{
    type: string;
    pattern: string;
    v_a: string;
    v_aaaa: string;
    v_txt: string;
    v_cname: string;
  }>({
    type: "BLOCK",
    pattern: "",
    v_a: "",
    v_aaaa: "",
    v_txt: "",
    v_cname: "",
  });

  useEffect(() => {
    if (prefill) {
      setNewRule({
        type: prefill.type,
        pattern: prefill.domain,
        v_a: prefill.recordType === "A" ? "0.0.0.0" : "",
        v_aaaa: prefill.recordType === "AAAA" ? "::" : "",
        v_txt: prefill.recordType === "TXT" ? "Pre-filled" : "",
        v_cname: prefill.recordType === "CNAME" ? "target.com" : "",
      });
      onPrefillUsed?.();
    }
  }, [prefill, onPrefillUsed]);

  const fetchRules = async () => {
    setLoading(true);
    const res = await fetch(`/api/profiles/${profileId}/rules`);
    const data = await res.json();
    setRules(data);
    setLoading(false);
  };

  const addRule = async () => {
    if (!newRule.pattern) return;
    await fetch(`/api/profiles/${profileId}/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newRule),
    });
    setNewRule({
      type: "BLOCK",
      pattern: "",
      v_a: "",
      v_aaaa: "",
      v_txt: "",
      v_cname: "",
    });
    fetchRules();
  };

  const deleteRule = async (id: number) => {
    await fetch(`/api/profiles/${profileId}/rules`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchRules();
  };

  useEffect(() => {
    fetchRules();
  }, [profileId]);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h2 className="bp6-heading">{t("rules.title")}</h2>
        <p className="bp6-text-muted">
          {t("rules.subtitle")}
        </p>
      </div>

      <Card elevation={Elevation.ONE} className="mb-8 p-6">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col lg:flex-row justify-between gap-4 items-start lg:items-end">
            <div className="w-full lg:w-48">
              <FormGroup label={t("rules.action")} labelFor="rule-type">
                <HTMLSelect
                  id="rule-type"
                  fill
                  large
                  value={newRule.type}
                  onChange={(e) =>
                    setNewRule({ ...newRule, type: e.target.value })
                  }
                  options={[
                    { label: t("rules.typeBlock"), value: "BLOCK" },
                    { label: t("rules.typeAllow"), value: "ALLOW" },
                    { label: t("rules.typeRedirect"), value: "REDIRECT" },
                  ]}
                />
              </FormGroup>
            </div>
            <div className="flex-1 w-full lg:w-48">
              <FormGroup label={t("rules.pattern")} labelFor="rule-pattern">
                <InputGroup
                  id="rule-pattern"
                  size="large"
                  placeholder={t("rules.patternPlaceholder")}
                  value={newRule.pattern}
                  onChange={(e) =>
                    setNewRule({ ...newRule, pattern: e.target.value })
                  }
                />
              </FormGroup>
            </div>
            {newRule.type !== "REDIRECT" && (
              <FormGroup label="" labelFor="">
                <Button
                  intent={Intent.PRIMARY}
                  size="large"
                  icon={<Plus size={18} />}
                  onClick={addRule}
                >
                  {t("rules.addRule")}
                </Button>
              </FormGroup>
            )}
          </div>

          {newRule.type === "REDIRECT" && (
            <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 mb-4 text-blue-600 dark:text-blue-400">
                <Globe size={16} />
                <span className="text-xs font-bold uppercase tracking-wider">
                  {t("rules.redirectSettings")}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                <FormGroup label={t("rules.aRecord")} labelInfo={t("rules.optional")}>
                  <InputGroup
                    placeholder={t("rules.ipv4Placeholder")}
                    value={newRule.v_a}
                    onChange={(e) =>
                      setNewRule({ ...newRule, v_a: e.target.value })
                    }
                  />
                </FormGroup>

                <FormGroup label={t("rules.aaaaRecord")} labelInfo={t("rules.optional")}>
                  <InputGroup
                    placeholder={t("rules.ipv6Placeholder")}
                    value={newRule.v_aaaa}
                    onChange={(e) =>
                      setNewRule({ ...newRule, v_aaaa: e.target.value })
                    }
                  />
                </FormGroup>

                <FormGroup label={t("rules.cnameRecord")} labelInfo={t("rules.optional")}>
                  <InputGroup
                    placeholder={t("rules.cnamePlaceholder")}
                    value={newRule.v_cname}
                    onChange={(e) =>
                      setNewRule({ ...newRule, v_cname: e.target.value })
                    }
                  />
                </FormGroup>

                <FormGroup label={t("rules.txtRecord")} labelInfo={t("rules.optional")}>
                  <InputGroup
                    placeholder={t("rules.txtPlaceholder")}
                    value={newRule.v_txt}
                    onChange={(e) =>
                      setNewRule({ ...newRule, v_txt: e.target.value })
                    }
                  />
                </FormGroup>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                <Button
                  intent={Intent.PRIMARY}
                  large
                  icon={<Plus size={18} />}
                  onClick={addRule}
                  text={t("rules.saveRedirectRule")}
                />
              </div>
            </div>
          )}
        </div>
      </Card>

      {rules.length === 0 ? (
        <Callout title={t("rules.noRulesTitle")}>{t("rules.noRulesDesc")}</Callout>
      ) : (
        <HTMLTable interactive striped className="w-full">
          <thead>
            <tr>
              <th className="w-32">{t("rules.tableAction")}</th>
              <th className="w-1/4">{t("rules.tablePattern")}</th>
              <th>{t("rules.tableDetails")}</th>
              <th className="text-right w-20">{t("rules.tableOps")}</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td>
                  {rule.type === "BLOCK" && (
                    <Tag
                      intent={Intent.DANGER}
                      minimal
                      icon={<ShieldX size={12} className="mr-1" />}
                    >
                      {t("rules.labelBlock")}
                    </Tag>
                  )}
                  {rule.type === "ALLOW" && (
                    <Tag
                      intent={Intent.SUCCESS}
                      minimal
                      icon={<CheckCircle size={12} className="mr-1" />}
                    >
                      {t("rules.labelAllow")}
                    </Tag>
                  )}
                  {rule.type === "REDIRECT" && (
                    <Tag
                      intent={Intent.WARNING}
                      minimal
                      icon={<ArrowRightLeft size={12} className="mr-1" />}
                    >
                      {t("rules.labelRedirect")}
                    </Tag>
                  )}
                </td>
                <td className="font-mono font-bold">{rule.pattern}</td>
                <td className="py-2">
                  {rule.type === "REDIRECT" ? (
                    <div className="flex flex-wrap gap-2">
                      {rule.v_a && (
                        <Tag minimal className="font-mono text-[10px]">
                          A: {rule.v_a}
                        </Tag>
                      )}
                      {rule.v_aaaa && (
                        <Tag minimal className="font-mono text-[10px]">
                          AAAA: {rule.v_aaaa}
                        </Tag>
                      )}
                      {rule.v_cname && (
                        <Tag minimal className="font-mono text-[10px]">
                          CNAME: {rule.v_cname}
                        </Tag>
                      )}
                      {rule.v_txt && (
                        <Tag minimal className="font-mono text-[10px]">
                          TXT: {rule.v_txt}
                        </Tag>
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-400 text-xs italic">
                      {rule.type === "BLOCK"
                        ? t("rules.detailBlock")
                        : t("rules.detailAllow")}
                    </span>
                  )}
                </td>
                <td className="text-right">
                  <Button
                    icon={<Trash2 size={14} />}
                    minimal
                    intent={Intent.DANGER}
                    onClick={() => deleteRule(rule.id)}
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
