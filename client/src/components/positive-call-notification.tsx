import { useState, useEffect } from "react";
import { Trophy, X, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface PositiveCallNotificationProps {
  agentName: string;
  positiveCount: number;
  onDismiss: () => void;
  isVisible: boolean;
  time?: string;
  dateRange?: string;
  projectName?: string;
}

export function PositiveCallNotification({ 
  agentName, 
  positiveCount, 
  onDismiss, 
  isVisible,
  time,
  dateRange,
  projectName
}: PositiveCallNotificationProps) {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setShouldShow(true);
      // Auto-dismiss after 7 seconds (longer than normal notification)
      const timer = setTimeout(() => {
        setShouldShow(false);
        setTimeout(onDismiss, 500); // Give time for fade animation
      }, 7000);
      
      return () => clearTimeout(timer);
    }
  }, [isVisible, onDismiss]);

  if (!isVisible || !shouldShow) return null;

  // Generate celebration emoji based on count
  const getCelebrationEmoji = () => {
    if (positiveCount >= 10) return "🏆";
    if (positiveCount >= 5) return "🎉";
    if (positiveCount >= 3) return "🌟";
    return "✨";
  };

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ 
            type: "spring", 
            stiffness: 200, 
            damping: 15 
          }}
          className={`
            fixed top-20 right-4 z-50 
            bg-gradient-to-r from-green-50 to-emerald-50 
            dark:from-green-950 dark:to-emerald-950
            border-2 border-green-300 dark:border-green-700 
            rounded-xl shadow-2xl p-5 max-w-md
            transform transition-all duration-300 ease-in-out
          `}
          data-testid={`positive-notification-${agentName}`}
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
              <div className="absolute inset-0 bg-green-400 dark:bg-green-600 rounded-full blur-lg opacity-50 animate-pulse" />
              <div className="relative bg-gradient-to-br from-green-500 to-emerald-600 dark:from-green-600 dark:to-emerald-700 rounded-full p-3">
                <Trophy className="h-6 w-6 text-white" />
              </div>
            </motion.div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">{getCelebrationEmoji()}</span>
                <div className="text-lg font-bold text-green-900 dark:text-green-100">
                  Herzlichen Glückwunsch!
                </div>
              </div>
              <div className="text-base text-green-800 dark:text-green-200 font-medium">
                {agentName} hat {dateRange || "heute"} den <span className="font-bold text-green-900 dark:text-green-100">{positiveCount}.</span> positiven Abschluss{time ? ` um ${time} Uhr` : ""}{projectName ? ` im Projekt "${projectName}"` : ""} erhalten!
              </div>
              
              {/* Achievement badges for milestones */}
              {positiveCount % 5 === 0 && positiveCount > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 flex items-center gap-2"
                >
                  <Star className="h-4 w-4 text-yellow-500" />
                  <span className="text-sm font-semibold text-green-700 dark:text-green-300">
                    Meilenstein erreicht!
                  </span>
                </motion.div>
              )}
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              className="flex-shrink-0 h-8 w-8 p-0 text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-200"
              onClick={() => {
                setShouldShow(false);
                setTimeout(onDismiss, 300);
              }}
              data-testid="positive-notification-close"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          
          {/* Progress bar animation */}
          <motion.div 
            className="absolute bottom-0 left-0 right-0 h-1 bg-green-400/30 dark:bg-green-600/30 rounded-b-xl overflow-hidden"
          >
            <motion.div
              className="h-full bg-gradient-to-r from-green-500 to-emerald-600"
              initial={{ width: "100%" }}
              animate={{ width: "0%" }}
              transition={{ duration: 7, ease: "linear" }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}