import React, { lazy, Suspense } from "react";
import { Routes, Route, useParams } from "react-router-dom";
import { Spinner, NonIdealState, Button, Intent } from "@blueprintjs/core";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

const SetupView = lazy(() => import("./views/SetupView").then(m => ({ default: m.SetupView })));
const FilteringView = lazy(() => import("./views/FilteringView").then(m => ({ default: m.FilteringView })));
const RulesView = lazy(() => import("./views/RulesView").then(m => ({ default: m.RulesView })));
const SettingsView = lazy(() => import("./views/SettingsView").then(m => ({ default: m.SettingsView })));
const AnalyticsView = lazy(() => import("./views/AnalyticsView").then(m => ({ default: m.AnalyticsView })));
const LogsView = lazy(() => import("./views/LogsView").then(m => ({ default: m.LogsView })));

const NotFoundView = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <div className="h-full flex items-center justify-center">
      <NonIdealState
        icon="search"
        title={t("common.notFound")}
        description={t("common.notFoundDesc")}
        action={
          <Button intent={Intent.PRIMARY} onClick={() => navigate("/dash")}>
            {t("common.backToHome")}
          </Button>
        }
      />
    </div>
  );
};

const ProfileRoutes: React.FC<any> = ({
  selectedProfile,
  prefilledRule,
  setPrefilledRule,
  handleQuickAction,
  toasterRef,
}) => {
  const { profileId } = useParams();
  const id = profileId || selectedProfile?.id || "";
  
  return (
    <Suspense fallback={<div className="p-20 flex justify-center"><Spinner size={40} /></div>}>
      <Routes>
        <Route path="setup" element={<SetupView profileId={id} toasterRef={toasterRef} />} />
        <Route path="filter" element={<FilteringView profileId={id} />} />
        <Route
          path="rules"
          element={
            <RulesView
              profileId={id}
              prefill={prefilledRule}
              onPrefillUsed={() => setPrefilledRule(null)}
            />
          }
        />
        <Route path="settings" element={<SettingsView profileId={id} toasterRef={toasterRef} />} />
        <Route path="stats" element={<AnalyticsView profileId={id} />} />
        <Route path="logs" element={<LogsView profileId={id} onQuickAction={handleQuickAction} />} />
        <Route path="*" element={<NotFoundView />} />
      </Routes>
    </Suspense>
  );
};

export default ProfileRoutes;
