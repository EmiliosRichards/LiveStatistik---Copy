import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { type AgentStatistics, type Project, type CallOutcome } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

interface ExpandableDetailsProps {
  agentId: string;
  agentStats: AgentStatistics[];
  projects: Project[];
  filters: any;
}

export default function ExpandableDetails({ 
  agentId, 
  agentStats, 
  projects, 
  filters 
}: ExpandableDetailsProps) {
  const { t } = useTranslation();
  const [detailsOpen, setDetailsOpen] = useState(false);

  // REMOVED: Static callOutcomes query - using hardcoded demo data instead

  const getProjectName = (projectId: string) => {
    return projects.find(p => p.id === projectId)?.name || `${t('common.project')} ${projectId}`;
  };

  // Group stats by project and then by day
  const projectGroups = agentStats.reduce((acc, stat) => {
    const projectId = stat.projectId;
    if (!acc[projectId]) {
      acc[projectId] = [];
    }
    acc[projectId].push(stat);
    return acc;
  }, {} as Record<string, AgentStatistics[]>);

  // Sample outcome data for demonstration
  const outcomeCounts = {
    'KI Ansprechpartner': 0,
    'KI Gatekeeper': 0,
    'Partner vorhanden': 0,
    'falsche Zielgruppe': 0,
    'falsche Nummer': 0,
    'nicht mehr anrufen': 0,
    'Hotline': 0,
    'existiert nicht': 0,
    'Dublikat': 0,
    'Termin': 0,
    'Termin | Infomail': 0,
    'selbst gebucht': 0,
  };

  const negativeOutcomes = [
    'KI Ansprechpartner',
    'KI Gatekeeper', 
    'Partner vorhanden',
    'falsche Zielgruppe',
    'falsche Nummer',
    'nicht mehr anrufen',
    'Hotline',
    'existiert nicht',
    'Dublikat'
  ];

  const positiveOutcomes = [
    'Termin',
    'Termin | Infomail',
    'selbst gebucht'
  ];

  const offenOutcomes = [
    'offen',
    'Nachfassen automatisch',
    'Nachfassen persönlich',
    'zugewiesen'
  ];

  return (
    <div className="border-t border-border bg-muted/50">
      <div className="p-4 space-y-4">
        {/* Project Breakdown */}
        {Object.entries(projectGroups).map(([projectId, stats]) => {
          const projectName = getProjectName(projectId);
          
          return (
            <div key={projectId} className="space-y-2">
              {stats.map((stat) => {
                const statDate = new Date(stat.date);
                const locale = t('common.locale', 'de-DE');
                const dayName = statDate.toLocaleDateString(locale, { weekday: 'short' });
                const formattedDate = statDate.toLocaleDateString(locale, { 
                  day: '2-digit', 
                  month: '2-digit' 
                });

                return (
                  <div key={`${projectId}-${stat.date}`} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">{projectName}</span>
                      <span className="text-muted-foreground">{dayName} | {formattedDate}</span>
                    </div>
                    <div className="grid grid-cols-10 gap-4 text-xs text-center">
                      <span data-testid={`stat-anzahl-${projectId}`}>{stat.anzahl}</span>
                      <span data-testid={`stat-abgeschlossen-${projectId}`}>{stat.abgeschlossen}</span>
                      <span data-testid={`stat-erfolgreich-${projectId}`}>{stat.erfolgreich}</span>
                      <span data-testid={`stat-wartezeit-${projectId}`}>{Math.round(stat.wartezeit / 60)}</span>
                      <span data-testid={`stat-gespraechszeit-${projectId}`}>{Math.round(stat.gespraechszeit / 60)}</span>
                      <span data-testid={`stat-nachbearbeitung-${projectId}`}>{Math.round(stat.nachbearbeitungszeit / 60)}</span>
                      <span data-testid={`stat-vorbereitung-${projectId}`}>{Math.round(stat.vorbereitungszeit / 60)}</span>
                      <span data-testid={`stat-erfolg-${projectId}`}>{stat.erfolgProStunde}</span>
                      <span data-testid={`stat-arbeitszeit-${projectId}`}>{Math.round(stat.arbeitszeit / 60)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Daily Summary */}
        <div className="pt-2 border-t border-border">
          <div className="flex items-center justify-between text-sm font-medium">
            <span className="text-foreground">{t('emptyStates.weeklyTotal')}</span>
            <div className="grid grid-cols-9 gap-4 text-xs">
              {/* Calculate totals across all projects */}
              <span data-testid={`summary-anzahl-${agentId}`}>
                {agentStats.reduce((sum, stat) => sum + stat.anzahl, 0)}
              </span>
              <span data-testid={`summary-abgeschlossen-${agentId}`}>
                {agentStats.reduce((sum, stat) => sum + stat.abgeschlossen, 0)}
              </span>
              <span data-testid={`summary-erfolgreich-${agentId}`}>
                {agentStats.reduce((sum, stat) => sum + stat.erfolgreich, 0)}
              </span>
              <span data-testid={`summary-wartezeit-${agentId}`}>
                {Math.round(agentStats.reduce((sum, stat) => sum + stat.wartezeit, 0) / 60)}
              </span>
              <span data-testid={`summary-gespraechszeit-${agentId}`}>
                {Math.round(agentStats.reduce((sum, stat) => sum + stat.gespraechszeit, 0) / 60)}
              </span>
              <span data-testid={`summary-nachbearbeitung-${agentId}`}>
                {Math.round(agentStats.reduce((sum, stat) => sum + stat.nachbearbeitungszeit, 0) / 60)}
              </span>
              <span data-testid={`summary-vorbereitung-${agentId}`}>
                {Math.round(agentStats.reduce((sum, stat) => sum + stat.vorbereitungszeit, 0) / 60)}
              </span>
              <span data-testid={`summary-erfolg-${agentId}`}>
                {agentStats.reduce((sum, stat) => sum + stat.erfolgProStunde, 0)}
              </span>
              <span data-testid={`summary-arbeitszeit-${agentId}`}>
                {Math.round(agentStats.reduce((sum, stat) => sum + stat.arbeitszeit, 0) / 60)}
              </span>
            </div>
          </div>
        </div>

        {/* Detailed Breakdown Button */}
        <div className="pt-4 border-t border-border">
          <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
            <DialogTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                data-testid={`button-show-details-${agentId}`}
              >
{t('agentStatistics.showDetailedBreakdown')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between">
                  <span>{t('agentStatistics.agentDetails')} | {agents.find(a => a.id === agentId)?.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDetailsOpen(false)}
                    data-testid={`button-close-details-${agentId}`}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-6 p-4">
                {/* Negative Results */}
                <div className="space-y-4">
                  <h4 className="font-medium text-foreground flex items-center">
                    <span className="w-2 h-2 bg-destructive rounded-full mr-2"></span>
{t('agentStatistics.negativeCompleted')}
                  </h4>
                  <div className="space-y-3">
                    {negativeOutcomes.map((outcome) => (
                      <div key={outcome} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{outcome}</span>
                        <Badge variant="outline" data-testid={`outcome-${outcome.replace(/\s+/g, '-').toLowerCase()}-${agentId}`}>
                          {outcomeCounts[outcome as keyof typeof outcomeCounts]}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Positive Results */}
                <div className="space-y-4">
                  <h4 className="font-medium text-foreground flex items-center">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
{t('agentStatistics.positiveCompleted')}
                  </h4>
                  <div className="space-y-3">
                    {positiveOutcomes.map((outcome) => (
                      <div key={outcome} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{outcome}</span>
                        <Badge variant="outline" className="text-green-600" data-testid={`outcome-${outcome.replace(/\s+/g, '-').toLowerCase()}-${agentId}`}>
                          {outcomeCounts[outcome as keyof typeof outcomeCounts]}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
