import { AlertTriangle, X, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface DatabaseWarningProps {
  show: boolean;
  onDismiss: () => void;
}

export function DatabaseWarning({ show, onDismiss }: DatabaseWarningProps) {
  if (!show) return null;

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <>
      {/* Backdrop overlay */}
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" />
      
      {/* Warning dialog */}
      <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg px-4">
        <Alert variant="destructive" className="border-red-500 bg-red-50 dark:bg-red-950/20 shadow-xl">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <strong>Datenbankverbindung unterbrochen!</strong>
              <br />
              <span className="text-sm">Echtzeitdaten sind möglicherweise nicht verfügbar.</span>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs bg-white hover:bg-gray-50 border-red-300"
                  onClick={handleRefresh}
                  data-testid="button-refresh-page"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Seite neu laden
                </Button>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="ml-2 h-6 w-6 p-0 hover:bg-red-100 dark:hover:bg-red-900/20"
              onClick={onDismiss}
              data-testid="button-dismiss-warning"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </AlertDescription>
      </Alert>
      </div>
    </>
  );
}