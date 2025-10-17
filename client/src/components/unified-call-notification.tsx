import { motion } from "framer-motion";
import { X, Trophy, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { CallNotification as CallNotificationData, OutcomeCategory } from "@shared/schema";

interface UnifiedCallNotificationProps extends Omit<CallNotificationData, 'dateRange'> {
  isVisible: boolean;
  onDismiss: () => void;
  dateRange?: string;
}

const categoryConfig = {
  positive: {
    icon: Trophy,
    colors: "from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border-green-300 dark:border-green-700",
    iconBg: "from-green-500 to-emerald-600 dark:from-green-600 dark:to-emerald-700",
    textColor: "text-green-800 dark:text-green-200",
    boldColor: "text-green-900 dark:text-green-100",
    iconColor: "text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-200",
    message: "hat einen positiven Abschluss",
    emoji: "🎉"
  },
  negative: {
    icon: AlertTriangle,
    colors: "from-red-50 to-pink-50 dark:from-red-950 dark:to-pink-950 border-red-300 dark:border-red-700",
    iconBg: "from-red-500 to-pink-600 dark:from-red-600 dark:to-pink-700",
    textColor: "text-red-800 dark:text-red-200",
    boldColor: "text-red-900 dark:text-red-100",
    iconColor: "text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200",
    message: "hat einen negativen Abschluss",
    emoji: "❌"
  },
  offen: {
    icon: Clock,
    colors: "from-blue-50 to-cyan-50 dark:from-blue-950 dark:to-cyan-950 border-blue-300 dark:border-blue-700",
    iconBg: "from-blue-500 to-cyan-600 dark:from-blue-600 dark:to-cyan-700",
    textColor: "text-blue-800 dark:text-blue-200",
    boldColor: "text-blue-900 dark:text-blue-100",
    iconColor: "text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200",
    message: "hat einen offenen Eintrag",
    emoji: "⏳"
  }
};

export function UnifiedCallNotification({ 
  agentName, 
  projectName,
  outcome,
  category,
  count,
  delta,
  time,
  dateRange,
  isVisible,
  onDismiss
}: UnifiedCallNotificationProps) {
  const [shouldShow, setShouldShow] = useState(false);
  const config = categoryConfig[category] || categoryConfig['offen']; // Fallback to 'offen' if category not found
  
  // Only use special design for "Termin" outcomes
  const isTerminOutcome = outcome === "Termin";

  useEffect(() => {
    if (isVisible) {
      setShouldShow(true);
      // Auto-dismiss after 7 seconds for special design, 5 seconds for simple
      const timer = setTimeout(() => {
        setShouldShow(false);
        setTimeout(onDismiss, 300);
      }, isTerminOutcome ? 7000 : 5000);
      
      return () => clearTimeout(timer);
    }
  }, [isVisible, onDismiss, isTerminOutcome]);

  if (!isVisible || !shouldShow) return null;

  // Simple notification for non-Termin outcomes
  if (!isTerminOutcome) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 300 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 300 }}
        transition={{ duration: 0.3 }}
        className={`
          fixed top-20 right-4 z-50 
          bg-gradient-to-r ${config.colors}
          border-2 rounded-lg shadow-lg p-4 max-w-sm
        `}
        data-testid={`notification-${category}-${outcome}-${agentName}`}
      >
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 p-2 rounded-full bg-gradient-to-br ${config.iconBg}`}>
            <config.icon className="h-4 w-4 text-white" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-medium ${config.boldColor}`}>
              Neuer Eintrag von {agentName}
            </div>
            <div className={`text-xs ${config.textColor} mt-1`}>
              {outcome} im Projekt "{projectName}"{time ? ` um ${time} Uhr` : ""}
              {delta > 1 && ` (+${delta} neue)`}
            </div>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            className={`flex-shrink-0 h-6 w-6 p-0 ${config.iconColor}`}
            onClick={() => {
              setShouldShow(false);
              setTimeout(onDismiss, 300);
            }}
            data-testid={`button-dismiss-${category}-${agentName}`}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </motion.div>
    );
  }

  // Special design for "Termin" outcomes only
  return (
    <motion.div
      initial={{ opacity: 0, x: 400, scale: 0.9 }}
      animate={{ 
        opacity: 1, 
        x: 0, 
        scale: 1 
      }}
      exit={{ opacity: 0, x: 400, scale: 0.9 }}
      transition={{ 
        type: "spring", 
        stiffness: 120, 
        damping: 15 
      }}
      className={`
        fixed top-20 right-4 z-50 
        bg-gradient-to-r ${config.colors}
        border-2 rounded-xl shadow-2xl p-5 max-w-md
        transform transition-all duration-300 ease-in-out
      `}
      data-testid={`notification-${category}-${outcome}-${agentName}`}
    >
      <div className="flex items-start gap-4">
        {/* Animated Icon Container */}
        <motion.div 
          className="flex-shrink-0 relative"
          animate={{ 
            rotate: [0, -10, 10, -10, 0],
            scale: [1, 1.1, 1]
          }}
          transition={{ 
            duration: 0.5,
            delay: 0.2
          }}
        >
          <div className={`absolute inset-0 bg-gradient-to-br ${config.iconBg} rounded-full blur-lg opacity-50 animate-pulse`} />
          <div className={`relative bg-gradient-to-br ${config.iconBg} rounded-full p-3`}>
            <config.icon className="h-6 w-6 text-white" />
          </div>
        </motion.div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">{config.emoji}</span>
            <div className={`text-lg font-bold ${config.boldColor}`}>
              Herzlichen Glückwunsch!
            </div>
          </div>
          <div className={`text-base ${config.textColor} font-medium`}>
            <span className={`font-bold ${config.boldColor}`}>{agentName}</span> hat heute einen {count}. Terminabschluss{time ? ` um ${time} Uhr` : ""} im Projekt <span className={`font-semibold ${config.boldColor}`}>{projectName}</span>!
          </div>
          {delta > 1 && (
            <div className={`text-sm ${config.textColor} mt-1`}>
              <span className={`font-semibold ${config.boldColor}`}>+{delta} neue Termine</span>
            </div>
          )}
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          className={`flex-shrink-0 h-8 w-8 p-0 ${config.iconColor}`}
          onClick={() => {
            setShouldShow(false);
            setTimeout(onDismiss, 300);
          }}
          data-testid={`button-dismiss-${category}-${agentName}`}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  );
}