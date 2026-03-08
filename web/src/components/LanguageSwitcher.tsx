import { Button } from "@blueprintjs/core";
import { useTranslation } from "react-i18next";

export const LanguageSwitcher = ({ minimal = true, size = "small" }: { minimal?: boolean, size?: "small" | "regular" }) => {
  const { i18n } = useTranslation();
  return (
    <div className="flex items-center gap-1 bg-gray-100/50 dark:bg-gray-800/50 p-1 rounded-lg w-fit">
      <Button 
        variant={minimal ? "minimal" : undefined} 
        size={size as any} 
        active={i18n.language === "zh-CN"} 
        onClick={() => i18n.changeLanguage("zh-CN")}
        text="中"
      />
      <Button 
        variant={minimal ? "minimal" : undefined} 
        size={size as any} 
        active={i18n.language === "en-US"} 
        onClick={() => i18n.changeLanguage("en-US")}
        text="EN"
      />
    </div>
  );
};
