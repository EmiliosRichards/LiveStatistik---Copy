import { useState, useEffect } from "react";
import { Bell, X, CheckCircle, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CallNotificationProps {
  message: string;
  category: string;
  count: number;
  onDismiss: () => void;
  isVisible: boolean;
  agentName?: string; // Optional agent name for more specific notifications
  status?: 'positive' | 'negative' | 'open'; // New status prop for color coding
}

export function CallNotification({ 
  message, 
  category, 
  count, 
  onDismiss, 
  isVisible,
  agentName,
  status = 'open' // Default to open (blue) for backward compatibility
}: CallNotificationProps) {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setShouldShow(true);
      // Auto-dismiss after 5 seconds
      const timer = setTimeout(() => {
        setShouldShow(false);
        setTimeout(onDismiss, 300); // Give time for fade animation
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [isVisible, onDismiss]);

  if (!isVisible || !shouldShow) return null;

  // Color schemes based on status
  const getColorScheme = () => {
    switch (status) {
      case 'positive':
        return {
          bg: 'bg-green-50 dark:bg-green-950',
          border: 'border-green-200 dark:border-green-800',
          icon: 'text-green-600 dark:text-green-400',
          titleText: 'text-green-900 dark:text-green-100',
          messageText: 'text-green-700 dark:text-green-300',
          buttonText: 'text-green-400 hover:text-green-600 dark:text-green-500 dark:hover:text-green-300',
          IconComponent: CheckCircle
        };
      case 'negative':
        return {
          bg: 'bg-red-50 dark:bg-red-950',
          border: 'border-red-200 dark:border-red-800',
          icon: 'text-red-600 dark:text-red-400',
          titleText: 'text-red-900 dark:text-red-100',
          messageText: 'text-red-700 dark:text-red-300',
          buttonText: 'text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-300',
          IconComponent: XCircle
        };
      case 'open':
      default:
        return {
          bg: 'bg-blue-50 dark:bg-blue-950',
          border: 'border-blue-200 dark:border-blue-800',
          icon: 'text-blue-600 dark:text-blue-400',
          titleText: 'text-blue-900 dark:text-blue-100',
          messageText: 'text-blue-700 dark:text-blue-300',
          buttonText: 'text-blue-400 hover:text-blue-600 dark:text-blue-500 dark:hover:text-blue-300',
          IconComponent: Clock
        };
    }
  };

  const colors = getColorScheme();
  const { IconComponent } = colors;

  return (
    <div 
      className={`
        fixed top-4 right-4 z-50 
        ${colors.bg}
        border ${colors.border}
        rounded-lg shadow-lg p-4 max-w-sm
        transform transition-all duration-300 ease-in-out
        ${shouldShow ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
      `}
      data-testid={`notification-${category}-${status}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <IconComponent className={`h-5 w-5 ${colors.icon}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium ${colors.titleText}`}>
            {agentName ? `Neue Anrufe für ${agentName}` : 'Neue Anrufe verfügbar'}
          </div>
          <div className={`text-sm ${colors.messageText} mt-1`}>
            {message}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className={`flex-shrink-0 h-6 w-6 p-0 ${colors.buttonText}`}
          onClick={() => {
            setShouldShow(false);
            setTimeout(onDismiss, 300);
          }}
          data-testid="notification-close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}