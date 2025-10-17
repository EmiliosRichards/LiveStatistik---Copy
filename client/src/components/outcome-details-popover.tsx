import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info, ChevronDown, Plus, Minus, Paperclip, AudioLines } from "lucide-react";
import { type CallOutcome, type CallDetails } from "@shared/schema";
import { useState } from "react";
import { useCallDetails } from "@/hooks/use-statistics";
import { format } from "date-fns";
import SimpleCallDetails from "./simple-call-details";
import { useCampaignCategories, useCampaignCategoriesMap } from "@/hooks/use-campaign-categories";
import { classifyOutcome } from "@/lib/classify";

interface OutcomeDetailsPopoverProps {
  outcomes: Record<string, number>;
  callOutcomes: CallOutcome[];
  totalAbgeschlossen: number;
  expandedCallDetail: string | null;
  setExpandedCallDetail: (outcome: string | null) => void;
  agentId: string;
  projectId: string;
  dateFrom?: string;
  dateTo?: string;
  timeFrom?: string;
  timeTo?: string;
  campaignId?: string;  // Add campaignId to load dynamic categories
}

export default function OutcomeDetailsPopover({ 
  outcomes, 
  callOutcomes, 
  totalAbgeschlossen,
  expandedCallDetail,
  setExpandedCallDetail,
  agentId,
  projectId,
  dateFrom,
  dateTo,
  timeFrom,
  timeTo,
  campaignId
}: OutcomeDetailsPopoverProps) {
  console.error('🚨🚨🚨 OUTCOME DETAILS POPOVER ACTIVE!!! - agentId:', agentId, 'projectId:', projectId);

  // Load dynamic categories from campaign_state_reference_date VIEW
  const { data: campaignCategories, isLoading: categoriesLoading } = useCampaignCategories(campaignId);

  // If we have dynamic categories, use them; otherwise fall back to static categories
  const dynamicCategories = campaignCategories?.categories;
  
  // 🎯 NEW: Use dynamic classification instead of static fallback  
  const { categoriesMap: categoriesMapData } = useCampaignCategoriesMap(['all']);
  
  // Build dynamic outcome lists using the new classification
  const negativeOutcomes: string[] = [];
  const positiveOutcomes: string[] = [];
  const offenOutcomes: string[] = [];
  
  // Classify each outcome dynamically
  Object.entries(outcomes).forEach(([outcomeName, count]) => {
    if (count > 0) {
      const category = classifyOutcome(outcomeName, categoriesMapData);
      console.log(`🔍 POPOVER CLASSIFYING: "${outcomeName}" -> ${category}`);
      
      if (category === 'negative') {
        negativeOutcomes.push(outcomeName);
      } else if (category === 'positive') {
        positiveOutcomes.push(outcomeName);
      } else {
        offenOutcomes.push(outcomeName);
      }
    }
  });

  // 🚨 CRITICAL DEBUG: Show what outcomes data we're receiving
  console.error("🔍 DEBUGGING: Raw outcomes received:", outcomes);
  console.error("🔍 DEBUGGING: Available call outcomes registry:", callOutcomes.map(o => `${o.name} (${o.category})`));
  
  // 🚨 ULTRA DEBUG: Check specifically for the missing outcomes
  const hasNieWiederAnrufen = callOutcomes.some(o => o.name === 'Nie_wieder_anrufen');
  const hasKontaktformular = callOutcomes.some(o => o.name === 'Kontaktformular');
  console.error("🚨 MISSING OUTCOMES CHECK:");
  console.error(`  - Nie_wieder_anrufen in registry: ${hasNieWiederAnrufen}`);
  console.error(`  - Kontaktformular in registry: ${hasKontaktformular}`);
  console.error(`  - Nie_wieder_anrufen in outcomes data: ${'Nie_wieder_anrufen' in outcomes}`);
  console.error(`  - Kontaktformular in outcomes data: ${'Kontaktformular' in outcomes}`);
  
  // Calculate totals using dynamic classification  
  let totalNegative = 0;
  let totalPositive = 0;
  let totalOffen = 0;
  
  Object.entries(outcomes).forEach(([outcomeName, count]) => {
    const category = classifyOutcome(outcomeName, categoriesMapData);
    console.log(`📊 POPOVER TOTAL CALC: "${outcomeName}" (${count}) -> ${category}`);
    
    if (category === 'negative') {
      totalNegative += count;
    } else if (category === 'positive') {
      totalPositive += count;
    } else {
      totalOffen += count;
    }
  });

  // Load real call details from API
  const { data: callDetails = [], isLoading, error } = useCallDetails(
    agentId, 
    projectId, 
    dateFrom, 
    dateTo,
    timeFrom,
    timeTo
  ) as { data: CallDetails[], isLoading: boolean, error: any };
  
  
  // Helper to format date and time from call details - USING WORKING IMPLEMENTATION
  const formatCallDateTime = (dateString: string) => {
    console.log('🕒 OUTCOME formatCallDateTime für dateString:', dateString);
    try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        const dayNames = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];
        const dayName = dayNames[date.getDay()];
        const formattedDate = format(date, 'dd.MM.yy');
        const formattedTime = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        console.log('🕒 OUTCOME Zeit formatiert:', formattedTime);
        return { 
          datum: `${dayName} ${formattedDate}`, 
          uhrzeit: formattedTime
        };
      }
    } catch (e) {
      console.log('🕒 OUTCOME Fehler bei Zeit-Formatierung:', e);
    }
    return { 
      datum: '-', 
      uhrzeit: '-'
    };
  };
  
  // Helper to format duration in MM:SS format
  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };
  
  // Filter call details by specific outcome
  const getCallDetailsForOutcome = (outcomeName: string) => {
    return callDetails
      .filter(call => call.outcome === outcomeName)
      .map((call, index) => {
        const { datum, uhrzeit } = formatCallDateTime(call.callStart.toString());
        return {
          anzahlAnrufe: String(index + 1).padStart(2, '0'),
          datum,
          uhrzeit,
          gespraechsdauer: formatDuration(call.duration || 0),
          id: call.id,
          telefonnummer: call.contactNumber || 'Keine Nummer',
          anhang: false, // Not available in external data
          audio: !!call.recordingUrl
        };
      });
  };

  const toggleOutcomeExpansion = (outcomeName: string) => {
    if (expandedCallDetail === outcomeName) {
      setExpandedCallDetail(null);
    } else {
      setExpandedCallDetail(outcomeName);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-auto p-0 ml-1 hover:bg-transparent"
          data-testid="button-outcome-details"
        >
          <Info className="h-3 w-3 text-muted-foreground hover:text-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[600px] p-0" align="start">
        <div className="bg-background border rounded-lg shadow-lg">
          {/* Header */}
          <div className="px-4 py-3 border-b bg-muted/50">
            <h3 className="text-sm font-medium">
              {totalAbgeschlossen} abgeschlossen | Details
            </h3>
          </div>

          {/* Content in two columns */}
          <div className="grid grid-cols-2 gap-4 p-4">
            {/* Negative Outcomes */}
            <div>
              <h4 className="text-sm font-medium mb-3 flex items-center">
                <span className="text-red-600 dark:text-red-400">
                  {totalNegative}: negativ abgeschlossen
                </span>
              </h4>
              <div className="space-y-3">
                {negativeOutcomes.map((outcomeName, index) => (
                  <div key={`negative-${outcomeName}-${index}`}>
                    <div className="flex items-center justify-between text-sm">
                      <label className="flex items-center gap-2">
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {outcomeName}
                        </span>
                      </label>
                      <div className="flex items-center gap-1">
                        <span className="font-medium tabular-nums">
                          {outcomes[outcomeName] || 0}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleOutcomeExpansion(outcomeName);
                          }}
                          className="ml-1 inline-flex items-center justify-center rounded-md p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                          title={`Details für ${outcomeName} ${expandedCallDetail === outcomeName ? 'ausblenden' : 'anzeigen'}`}
                        >
                          {expandedCallDetail === outcomeName ? (
                            <Minus className="h-3.5 w-3.5 text-gray-500" />
                          ) : (
                            <Plus className="h-3.5 w-3.5 text-gray-500" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Expanded call details for this outcome */}
                    {expandedCallDetail === outcomeName && (
                      <div className="mt-3 ml-4 border-l-2 border-gray-200 dark:border-gray-600 pl-3">
                        <SimpleCallDetails
                          agentId={agentId}
                          projectId={projectId}
                          dateFrom={dateFrom}
                          dateTo={dateTo}
                          outcomeName={outcomeName}
                        />
                      </div>
                    )}

                  </div>
                ))}
              </div>
            </div>

            {/* Positive Outcomes */}
            <div>
              <h4 className="text-sm font-medium mb-3 flex items-center">
                <span className="text-green-600 dark:text-green-400">
                  {totalPositive}: positiv abgeschlossen
                </span>
              </h4>
              <div className="space-y-3">
                {positiveOutcomes.map((outcomeName, index) => (
                  <div key={`positive-${outcomeName}-${index}`}>
                    <div className="flex items-center justify-between text-sm">
                      <label className="flex items-center gap-2">
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {outcomeName}
                        </span>
                      </label>
                      <div className="flex items-center gap-1">
                        <span className="font-medium tabular-nums">
                          {outcomes[outcomeName] || 0}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleOutcomeExpansion(outcomeName);
                          }}
                          className="ml-1 inline-flex items-center justify-center rounded-md p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                          title={`Details für ${outcomeName} ${expandedCallDetail === outcomeName ? 'ausblenden' : 'anzeigen'}`}
                        >
                          {expandedCallDetail === outcomeName ? (
                            <Minus className="h-3.5 w-3.5 text-gray-500" />
                          ) : (
                            <Plus className="h-3.5 w-3.5 text-gray-500" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Expanded call details for this outcome */}
                    {expandedCallDetail === outcomeName && (
                      <div className="mt-3 ml-4 border-l-2 border-gray-200 dark:border-gray-600 pl-3">
                        <SimpleCallDetails
                          agentId={agentId}
                          projectId={projectId}
                          dateFrom={dateFrom}
                          dateTo={dateTo}
                          outcomeName={outcomeName}
                        />
                      </div>
                    )}

                  </div>
                ))}
              </div>
              
              {/* Offen Outcomes */}
              {totalOffen > 0 && (
                <>
                  <h4 className="text-sm font-medium mb-3 mt-6 flex items-center">
                    <span className="text-blue-600 dark:text-blue-400">
                      {totalOffen}: offen
                    </span>
                  </h4>
                  <div className="space-y-3">
                    {offenOutcomes.map((outcomeName, index) => (
                      <div key={`offen-${outcomeName}-${index}`}>
                        <div className="flex items-center justify-between text-sm">
                          <label className="flex items-center gap-2">
                            <ChevronDown className="h-3 w-3 text-muted-foreground" />
                            <span className="text-muted-foreground">
                              {outcomeName}
                            </span>
                          </label>
                          <div className="flex items-center gap-1">
                            <span className="font-medium tabular-nums">
                              {outcomes[outcomeName] || 0}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleOutcomeExpansion(outcomeName);
                              }}
                              className="ml-1 inline-flex items-center justify-center rounded-md p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                              title={`Details für ${outcomeName} ${expandedCallDetail === outcomeName ? 'ausblenden' : 'anzeigen'}`}
                            >
                              {expandedCallDetail === outcomeName ? (
                                <Minus className="h-3.5 w-3.5 text-gray-500" />
                              ) : (
                                <Plus className="h-3.5 w-3.5 text-gray-500" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Expanded call details for this outcome */}
                        {expandedCallDetail === outcomeName && (
                          <div className="mt-3 ml-4 border-l-2 border-gray-200 dark:border-gray-600 pl-3">
                            <SimpleCallDetails
                              agentId={agentId}
                              projectId={projectId}
                              dateFrom={dateFrom}
                              dateTo={dateTo}
                              outcomeName={outcomeName}
                            />
                          </div>
                        )}

                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}