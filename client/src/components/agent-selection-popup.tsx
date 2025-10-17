import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { type Agent } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, X, Check, UserCheck, Users, Calendar } from "lucide-react";

interface AgentSelectionPopupProps {
  agents: Agent[];
  selectedAgents: string[];
  onAgentToggle: (agentId: string, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  isOpen: boolean;
  onClose: () => void;
  isLoading?: boolean;
  title?: string;
  // Date sync props
  dateFrom?: string;
  dateTo?: string;
  onDateFromChange?: (date: string) => void;
  onDateToChange?: (date: string) => void;
  // Search function
  onSearch?: () => void;
}

export default function AgentSelectionPopup({
  agents,
  selectedAgents,
  onAgentToggle,
  onSelectAll,
  isOpen,
  onClose,
  isLoading = false,
  title,
  dateFrom = '',
  dateTo = '',
  onDateFromChange,
  onDateToChange,
  onSearch
}: AgentSelectionPopupProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  


  // Reset search when popup opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
    }
  }, [isOpen]);

  // Helper function for canonical German text normalization
  const createSearchKeys = (text: string): { withSeparators: string; withoutSeparators: string } => {
    const trimmed = text.trim().toLowerCase();
    
    // One-way canonical transformations
    let normalized = trimmed
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      // Normalize all separators to spaces
      .replace(/[.\-_]/g, ' ')
      // Collapse multiple spaces to single space
      .replace(/\s+/g, ' ')
      .trim();
    
    // Create version without any separators for flexible matching
    const withoutSeparators = normalized.replace(/\s/g, '');
    
    return {
      withSeparators: normalized,
      withoutSeparators: withoutSeparators
    };
  };

  // Filter agents based on search query with intelligent German search
  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) return agents;
    
    const queryKeys = createSearchKeys(searchQuery);
    
    return agents.filter(agent => {
      const nameKeys = createSearchKeys(agent.name);
      
      // Bidirectional matching: check both with and without separators
      return nameKeys.withSeparators.includes(queryKeys.withSeparators) ||
             nameKeys.withoutSeparators.includes(queryKeys.withoutSeparators) ||
             queryKeys.withSeparators.includes(nameKeys.withSeparators) ||
             queryKeys.withoutSeparators.includes(nameKeys.withoutSeparators);
    });
  }, [agents, searchQuery]);

  // Check if all visible agents are selected
  const allVisibleSelected = filteredAgents.length > 0 && 
    filteredAgents.every(agent => selectedAgents.includes(agent.id));

  // Check if some visible agents are selected
  const someVisibleSelected = filteredAgents.some(agent => selectedAgents.includes(agent.id));

  const handleSelectAllVisible = (checked: boolean) => {
    // Batch the updates to prevent multiple re-renders
    const currentSelected = new Set(selectedAgents);
    
    if (checked) {
      // Add all visible agents to selection
      filteredAgents.forEach(agent => {
        if (!currentSelected.has(agent.id)) {
          onAgentToggle(agent.id, true);
        }
      });
    } else {
      // Remove all visible agents from selection
      filteredAgents.forEach(agent => {
        if (currentSelected.has(agent.id)) {
          onAgentToggle(agent.id, false);
        }
      });
    }
  };

  const handleSelectAllAgents = (checked: boolean) => {
    onSelectAll(checked);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col" data-testid="dialog-agent-selection">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            {title || t('filter.selectAgents')}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            </div>
          </div>
        ) : (
          <>
            {/* Search Bar */}
            <div className="flex-shrink-0 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t('filter.selectAgents')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-agent-search"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>

              {/* Selection Summary */}
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {t('filter.agentsSelectedCount', { count: selectedAgents.length, total: agents.length })}
                </span>
                <span>
                  {searchQuery ? `${filteredAgents.length} ${t('filter.found')}` : ''}
                </span>
              </div>

              {/* Select All Controls */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="select-all-agents"
                    checked={agents.length > 0 && selectedAgents.length === agents.length}
                    onCheckedChange={handleSelectAllAgents}
                    data-testid="checkbox-select-all-agents"
                  />
                  <Label 
                    htmlFor="select-all-agents" 
                    className="text-sm font-medium cursor-pointer"
                  >
                    {t('filter.selectAll')}
                  </Label>
                </div>

                {searchQuery && (
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="select-all-visible"
                      checked={allVisibleSelected}
                      onCheckedChange={handleSelectAllVisible}
                      data-testid="checkbox-select-all-visible"
                    />
                    <Label 
                      htmlFor="select-all-visible" 
                      className="text-sm font-medium cursor-pointer"
                    >
                      Sichtbare auswählen
                    </Label>
                  </div>
                )}
              </div>
            </div>

            {/* Agent List */}
            <ScrollArea className="h-80">
              <div className="space-y-1 pr-4">
                {filteredAgents.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      {searchQuery ? t('filter.noAgentsFound') : t('filter.noAgentsAvailable')}
                    </p>
                    {searchQuery && (
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => setSearchQuery("")}
                        className="mt-2"
                      >
                        Suche zurücksetzen
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-1">
                    {filteredAgents.map((agent) => {
                      const isSelected = selectedAgents.includes(agent.id);
                      return (
                        <div
                          key={agent.id}
                          className={`
                            flex items-center space-x-3 p-3 rounded-lg transition-all duration-200 hover:bg-accent cursor-pointer
                            ${isSelected ? 'bg-primary/10 border border-primary/20' : 'border border-transparent'}
                          `}
                          onClick={() => onAgentToggle(agent.id, !isSelected)}
                        >
                          <Checkbox
                            id={`agent-popup-${agent.id}`}
                            checked={isSelected}
                            onCheckedChange={(checked) => onAgentToggle(agent.id, checked as boolean)}
                            data-testid={`checkbox-popup-agent-${agent.id}`}
                          />
                          <div className="flex-1 min-w-0" onClick={(e) => {
                            e.stopPropagation();
                            onAgentToggle(agent.id, !isSelected);
                          }}>
                            <div className="flex items-center gap-2 cursor-pointer">
                              <UserCheck className={`w-4 h-4 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                              <span className={`
                                text-sm font-medium truncate
                                ${isSelected ? 'text-primary' : 'text-foreground'}
                              `}>
                                {agent.name}
                              </span>
                            </div>
                          </div>
                          {isSelected && (
                            <Check className="w-4 h-4 text-primary flex-shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Date Range Fields */}
            <div className="space-y-3 p-4 bg-accent/20 rounded-lg border mt-4">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm font-medium">{t('filter.selectTimeRange')}</Label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="popup-date-from" className="text-xs text-muted-foreground">{t('common.from')}</Label>
                  <input
                    id="popup-date-from"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => onDateFromChange?.(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid="input-popup-date-from"
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="popup-date-to" className="text-xs text-muted-foreground">{t('common.to')}</Label>
                  <input
                    id="popup-date-to"
                    type="date"
                    value={dateTo}
                    onChange={(e) => onDateToChange?.(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid="input-popup-date-to"
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>
            </div>

            {/* Info Text */}
            <div className="text-center text-xs text-muted-foreground px-4 py-2">
              {t('filter.projectsAutoDetectedInfo')}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 flex items-center justify-between pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                {selectedAgents.length > 0 && (
                  <span>
                    {t('filter.agentsSelected', { count: selectedAgents.length, plural: selectedAgents.length !== 1 ? (t('common.agents') === 'agents' ? 's' : 'en') : '' })}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={onClose}
                  data-testid="button-cancel-agent-selection"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={() => {
                    if (onSearch) {
                      onSearch();
                    }
                    onClose();
                  }}
                  data-testid="button-search-from-popup"
                  disabled={selectedAgents.length === 0 || (!dateFrom && !dateTo)}
                >
                  Statistiken suchen
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}