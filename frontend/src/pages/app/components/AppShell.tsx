import {Database, MessageSquare, Settings} from 'lucide-react';
import {cn} from '../../../shared/lib/utils';
import type {ReactNode} from 'react';

type AppShellProps = {
  activeTab: string;
  currentView: string;
  isDarkTheme: boolean;
  locale: {
    appTitle: string;
    tabDocs: string;
    tabQa: string;
    tabSettings: string;
  };
  onTabChange: (tab: string) => void;
  children: ReactNode;
};

export function AppShell({activeTab, currentView, isDarkTheme, locale, onTabChange, children}: AppShellProps) {
  return (
    <div className={`flex flex-col h-screen font-sans antialiased overflow-hidden ${isDarkTheme ? 'bg-slate-950 text-slate-100' : 'bg-gray-100 text-gray-800'}`}>
      {currentView === 'list' && (
        <div className={`h-14 border-b flex items-center justify-between px-6 shrink-0 ${isDarkTheme ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-sm">K</div>
            <span className={`font-semibold text-lg ${isDarkTheme ? 'text-slate-100' : 'text-gray-800'}`}>{locale.appTitle}</span>
          </div>
          <button
            type="button"
            onClick={() => onTabChange('settings')}
            className={`p-2 rounded-full transition-colors ${isDarkTheme ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-800' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`}
            aria-label={locale.tabSettings}
          >
            <Settings size={20} />
          </button>
        </div>
      )}

      {children}

      {currentView === 'list' && (
        <div className={`h-16 border-t flex justify-center items-center gap-12 shrink-0 ${isDarkTheme ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
          <button
            type="button"
            aria-label={locale.tabDocs}
            onClick={() => onTabChange('documents')}
            className={cn('relative flex flex-col items-center gap-1 w-20', activeTab === 'documents' ? 'text-blue-600' : (isDarkTheme ? 'text-slate-400 hover:text-slate-100' : 'text-gray-500 hover:text-gray-800'))}
          >
            <Database size={20} />
            <span className="text-xs font-medium border-b-2 border-transparent">{locale.tabDocs}</span>
            {activeTab === 'documents' && <div className="h-0.5 w-10 bg-blue-600 rounded-t-md absolute bottom-0"></div>}
          </button>
          <button
            type="button"
            aria-label={locale.tabQa}
            onClick={() => onTabChange('qa')}
            className={cn('flex flex-col items-center gap-1 w-20 relative', activeTab === 'qa' ? 'text-blue-600' : (isDarkTheme ? 'text-slate-400 hover:text-slate-100' : 'text-gray-500 hover:text-gray-800'))}
          >
            <MessageSquare size={20} />
            <span className="text-xs font-medium">{locale.tabQa}</span>
            {activeTab === 'qa' && <div className="h-0.5 w-10 bg-blue-600 rounded-t-md absolute bottom-0"></div>}
          </button>
          <button
            type="button"
            aria-label={locale.tabSettings}
            onClick={() => onTabChange('settings')}
            className={cn('flex flex-col items-center gap-1 w-20 relative', activeTab === 'settings' ? 'text-blue-600' : (isDarkTheme ? 'text-slate-400 hover:text-slate-100' : 'text-gray-500 hover:text-gray-800'))}
          >
            <Settings size={20} />
            <span className="text-xs font-medium">{locale.tabSettings}</span>
            {activeTab === 'settings' && <div className="h-0.5 w-10 bg-blue-600 rounded-t-md absolute bottom-0"></div>}
          </button>
        </div>
      )}
    </div>
  );
}
