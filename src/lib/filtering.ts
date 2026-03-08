import { Rule } from "../types";

export class DNSFilter {
  /**
   * 检查域名是否匹配特定模式 (支持子域名匹配)
   * 模式 example.com 将匹配 example.com 和 *.example.com
   */
  static isMatch(domain: string, pattern: string): boolean {
    const d = domain.toLowerCase();
    const p = pattern.toLowerCase();
    return d === p || d.endsWith(`.${p}`);
  }

  /**
   * 在给定规则集中寻找匹配项
   * 返回匹配的规则，如果未找到则返回 null
   */
  static findMatch(domain: string, rules: Rule[]): Rule | null {
    // 规则已在数据库查询中按 priority 排序
    for (const rule of rules) {
      if (this.isMatch(domain, rule.pattern)) {
        return rule;
      }
    }
    return null;
  }
}
