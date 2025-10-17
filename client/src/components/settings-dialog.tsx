import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Settings, Eye, EyeOff } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import type { Project, ProjectTargets } from '@shared/schema';

// Login form schema - use min(1) to ensure required, custom messages handled in component
const loginSchema = z.object({
  username: z.string().min(1, { message: 'usernameRequired' }),
  password: z.string().min(1, { message: 'passwordRequired' }),
});

// Project targets form schema - validation message key handled in component
const projectTargetsSchema = z.object({
  targets: z.record(z.object({
    targetValue: z.number().min(0, { message: 'targetMinError' }),
  })),
});

type LoginForm = z.infer<typeof loginSchema>;
type ProjectTargetsForm = z.infer<typeof projectTargetsSchema>;

interface SettingsDialogProps {
  children?: React.ReactNode;
  projects?: Project[];
  projectsLoading?: boolean;
  projectTargets?: ProjectTargets[];
  targetsLoading?: boolean;
}

export function SettingsDialog({ children, projects = [], projectsLoading = false, projectTargets = [], targetsLoading = false }: SettingsDialogProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Login form
  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  // Projects data now comes from props to avoid duplicate API calls

  // Project targets now come from props to avoid duplicate API calls
  const targets = projectTargets;

  // Project targets form
  const targetsForm = useForm<ProjectTargetsForm>({
    resolver: zodResolver(projectTargetsSchema),
  });

  // Initialize form when data becomes available
  React.useEffect(() => {
    if (isAuthenticated && projects.length > 0 && !targetsLoading && targets) {
      const initialTargets: Record<string, { targetValue: number }> = {};
      
      projects.forEach(project => {
        const existingTarget = targets.find(t => t.projectId === project.id);
        initialTargets[project.id] = {
          targetValue: existingTarget?.targetValue || 0,
        };
      });
      
      targetsForm.reset({ targets: initialTargets });
    }
  }, [isAuthenticated, projects, targetsLoading, targets]);

  // Handle authentication
  const handleLogin = (data: LoginForm) => {
    if (data.username === 'root' && data.password === '123456') {
      setIsAuthenticated(true);
      toast({
        title: t('settings.loginSuccess'),
        description: t('settings.loginSuccessDescription'),
      });
    } else {
      toast({
        title: t('settings.loginFailed'),
        description: t('settings.invalidCredentials'),
        variant: 'destructive',
      });
    }
  };

  // Save targets mutation
  const saveTargetsMutation = useMutation({
    mutationFn: async (data: ProjectTargetsForm) => {
      const response = await fetch('/api/project-targets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data.targets),
      });
      if (!response.ok) {
        throw new Error('Failed to save project targets');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('settings.saveSuccess'),
        description: t('settings.saveSuccessDescription'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/project-targets'] });
    },
    onError: () => {
      toast({
        title: t('settings.saveError'),
        description: t('settings.saveErrorDescription'),
        variant: 'destructive',
      });
    },
  });

  const handleSaveTargets = (data: ProjectTargetsForm) => {
    saveTargetsMutation.mutate(data);
  };

  const resetDialog = () => {
    setIsAuthenticated(false);
    setShowPassword(false);
    loginForm.reset();
    targetsForm.reset();
  };

  const handleDialogClose = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      resetDialog();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogClose}>
      <DialogTrigger asChild>
        {children || (
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            data-testid="button-settings"
          >
            <Settings className="w-3 h-3" />
          </Button>
        )}
      </DialogTrigger>
      
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {!isAuthenticated ? t('settings.loginTitle') : t('settings.title')}
          </DialogTitle>
        </DialogHeader>

        {!isAuthenticated ? (
          // Login Form
          <Form {...loginForm}>
            <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
              <FormField
                control={loginForm.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('settings.username')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        autoFocus
                        data-testid="input-username"
                      />
                    </FormControl>
                    <FormMessage>
                      {loginForm.formState.errors.username?.message === 'usernameRequired' && t('settings.usernameRequired')}
                    </FormMessage>
                  </FormItem>
                )}
              />

              <FormField
                control={loginForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('settings.password')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          type={showPassword ? 'text' : 'password'}
                          data-testid="input-password"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowPassword(!showPassword)}
                          data-testid="button-toggle-password"
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage>
                      {loginForm.formState.errors.password?.message === 'passwordRequired' && t('settings.passwordRequired')}
                    </FormMessage>
                  </FormItem>
                )}
              />

              <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md border" data-testid="text-login-hint">
                <strong>{t('settings.passwordHint')}</strong> {t('settings.passwordHintText')}
              </div>

              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleDialogClose(false)}
                  data-testid="button-cancel-login"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  data-testid="button-login"
                >
                  {t('settings.loginButton')}
                </Button>
              </div>
            </form>
          </Form>
        ) : (
          // Settings Tabs
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="general" data-testid="tab-general">
                {t('settings.general')}
              </TabsTrigger>
              <TabsTrigger value="project-kpis" data-testid="tab-project-kpis">
                {t('settings.projectKPIs')}
              </TabsTrigger>
            </TabsList>
            
            <Form {...targetsForm}>
              <form onSubmit={targetsForm.handleSubmit(handleSaveTargets)} className="space-y-6">
                <TabsContent value="general" className="mt-6">
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">{t('settings.generalSettingsAvailable')}</p>
                  </div>
                </TabsContent>
                
                <TabsContent value="project-kpis" className="mt-6">
                  {projectsLoading || targetsLoading ? (
                    <div className="text-center py-8">{t('settings.loadingProjects')}</div>
                  ) : (
                    <div className="space-y-4">
                      {projects.map((project) => (
                        <div key={project.id} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between gap-4">
                            <h3 className="font-semibold" data-testid={`text-project-${project.id}`}>
                              {project.name}
                            </h3>
                            <FormField
                              control={targetsForm.control}
                              name={`targets.${project.id}.targetValue`}
                              render={({ field }) => (
                                <FormItem className="flex items-center gap-2">
                                  <FormLabel className="text-sm font-medium whitespace-nowrap">
                                    Soll-Zahlen:
                                  </FormLabel>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      type="number"
                                      min="0"
                                      className="w-24 border-2"
                                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                      data-testid={`input-target-value-${project.id}`}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <div className="flex justify-end space-x-2 mt-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleDialogClose(false)}
                    data-testid="button-cancel-settings"
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    disabled={saveTargetsMutation.isPending}
                    data-testid="button-save-targets"
                  >
                    {saveTargetsMutation.isPending ? 'Speichern...' : 'Speichern'}
                  </Button>
                </div>
              </form>
            </Form>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}