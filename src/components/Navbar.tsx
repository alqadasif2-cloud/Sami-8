import React from 'react';
import { Home, MessagesSquare, MessageCircle, FileText, Milestone, Sliders, ShieldCheck } from 'lucide-react';
import { ActiveTab, UserRole } from '../types';

interface NavbarProps {
  activeTab: ActiveTab;
  userRole?: UserRole;
  onTabChange?: (tab: ActiveTab) => void;
  onSelectTab?: (tab: ActiveTab) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  userRole = 'user',
  onTabChange,
  onSelectTab,
}) => {
  const handleSelect = (tab: ActiveTab) => {
    onSelectTab?.(tab);
    onTabChange?.(tab);
  };

  const getNavItems = () => {
    if (userRole === 'moderator') {
      return [
        { id: 'dashboard' as ActiveTab, label: 'الرئيسية', Icon: Home },
        { id: 'channels' as ActiveTab, label: 'القنوات', Icon: MessagesSquare },
        { id: 'private_chat' as ActiveTab, label: 'خاص Sami', Icon: MessageCircle },
        { id: 'settings' as ActiveTab, label: 'الإعدادات', Icon: Sliders },
      ];
    }
    if (userRole === 'owner') {
      return [
        { id: 'dashboard' as ActiveTab, label: 'الرئيسية', Icon: Home },
        { id: 'admin' as ActiveTab, label: 'الإدارة', Icon: ShieldCheck },
        { id: 'channels' as ActiveTab, label: 'القنوات', Icon: MessagesSquare },
        { id: 'history' as ActiveTab, label: 'سجل الصفقات', Icon: FileText },
        { id: 'roadmap' as ActiveTab, label: 'المحطات', Icon: Milestone },
        { id: 'settings' as ActiveTab, label: 'الإعدادات', Icon: Sliders },
      ];
    }
    return [
      { id: 'dashboard' as ActiveTab, label: 'الرئيسية', Icon: Home },
      { id: 'channels' as ActiveTab, label: 'القنوات', Icon: MessagesSquare },
      { id: 'history' as ActiveTab, label: 'سجل الصفقات', Icon: FileText },
      { id: 'roadmap' as ActiveTab, label: 'المحطات', Icon: Milestone },
      { id: 'settings' as ActiveTab, label: 'الإعدادات', Icon: Sliders },
    ];
  };

  const items = getNavItems();

  return (
    <nav className="sticky bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-[#050811] via-[#080d1a]/98 to-[#0b1222]/95 backdrop-blur-xl border-t border-amber-500/20 px-1.5 pt-2 pb-2.5 select-none shadow-[0_-10px_30px_rgba(0,0,0,0.75)]">
      <div className="flex items-center justify-around max-w-md mx-auto">
        {items.map((item) => {
          const isActive =
            activeTab === item.id ||
            (item.id === 'channels' && activeTab === 'private_chat' && userRole !== 'moderator');
          const Icon = item.Icon;

          return (
            <button
              key={item.id}
              onClick={() => handleSelect(item.id)}
              className={`relative flex flex-col items-center justify-center py-1 px-2 rounded-2xl transition-all duration-200 cursor-pointer active:scale-90 min-w-[54px] group ${
                isActive ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isActive && (
                <div className="absolute -top-1 w-10 h-10 bg-amber-400/15 rounded-full blur-md pointer-events-none" />
              )}
              <div
                className={`transition-transform duration-200 ${
                  isActive
                    ? 'scale-110 text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.65)]'
                    : 'text-slate-400 group-hover:text-slate-200'
                }`}
              >
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span
                className={`text-[10.5px] mt-1 tracking-tight transition-colors duration-200 whitespace-nowrap ${
                  isActive
                    ? 'font-black text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.4)]'
                    : 'font-semibold text-slate-400'
                }`}
              >
                {item.label}
              </span>
              <div
                className={`mt-1.5 h-[3px] rounded-full transition-all duration-300 ${
                  isActive
                    ? 'w-8 bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 shadow-[0_0_10px_rgba(251,191,36,0.9)] opacity-100'
                    : 'w-0 bg-transparent opacity-0'
                }`}
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
};
