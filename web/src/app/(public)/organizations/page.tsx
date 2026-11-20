"use client";
import { Icon } from "@/components/icons";
import { ButtonLink, Empty, Skeleton } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";

export default function Organizations() {
  const { t } = useI18n();
  const q = useApi(() => api.publicOrganizations());
  return (
    <div className="container" style={{ paddingTop: 40 }}>
      <div className="row between wrap g16" style={{ marginBottom: 24 }}>
        <div className="stack g8">
          <h1 className="t-h1">{t("orgs.title")}</h1>
          <p className="secondary">{t("orgs.sub")}</p>
        </div>
        <ButtonLink href="/register?type=organization" variant="ink" icon="building">{t("home.orgCta")}</ButtonLink>
      </div>
      {!q.data ? <Skeleton rows={3} height={120} /> : q.data.length === 0 ? <div className="card"><Empty icon="building" title={t("orgs.none")} /></div> : (
        <div className="grid auto-fill">
          {q.data.map((o) => (
            <article key={o.id} className="card pad stack g12">
              <div className="row g12">
                <span className="avatar" style={{ width: 44, height: 44, borderRadius: 12 }}><Icon name="building" /></span>
                <div className="stack">
                  <h2 className="t-h3">{o.name}</h2>
                  <span className="t-small muted">{o.organizationType} · {o.city}</span>
                </div>
              </div>
              <p className="t-small secondary">{o.description}</p>
              <div className="row g16 t-small" style={{ marginTop: "auto" }}>
                <span className="num">{t("orgs.missions", { n: o.totalMissions })}</span>
                <span className="num">{t("orgs.volunteers", { n: o.totalVolunteers })}</span>
                {o.website && <a className="link" href={o.website} target="_blank" rel="noreferrer">{t("orgs.site")}</a>}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
