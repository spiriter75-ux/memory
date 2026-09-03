import React from 'react';

export type TabId = 'script' | 'bible' | 'storyboard' | 'video' | 'mastering';

interface TabNavProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  cutCount: number;
}

export const TabNav: React.FC<TabNavProps> = ({ activeTab, onSelectTab, cutCount }) => {
  const tabs: { id: TabId; number: string; title: string; subtitle: string; badge?: string }[] = [
    { id: 'script', number: '01', title: '대본 디렉터', subtitle: '소설 입력 및 컷 분할' },
    { id: 'bible', number: '02', title: '에셋 바이블', subtitle: '인물·의상·랜드마크' },
    { id: 'storyboard', number: '03', title: '스토리보드 Studio', subtitle: '2D 3대 실사 생성', badge: cutCount > 0 ? `${cutCount}컷` : undefined },
    { id: 'video', number: '04', title: 'H3 비디오 Studio', subtitle: '0.2MP 초안 -> 0.5MP' },
    { id: 'mastering', number: '05', title: '최종 마스터링', subtitle: '무손실 자막 & 내보내기' },
  ];

  return (
    <nav className="border-b border-slate-800 bg-[#0E1422] px-6">
      <div className="flex space-x-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`flex items-center space-x-3 px-5 py-3.5 border-b-2 font-medium text-sm transition text-left ${
                isActive
                  ? 'border-indigo-500 text-indigo-400 bg-indigo-950/20'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
              }`}
            >
              <span className={`text-xs font-mono font-bold ${isActive ? 'text-indigo-400' : 'text-slate-500'}`}>
                [{tab.number}]
              </span>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-slate-100">{tab.title}</span>
                  {tab.badge && (
                    <span className="px-1.5 py-0.2 text-[10px] font-mono bg-indigo-900/80 text-indigo-300 rounded border border-indigo-700/50">
                      {tab.badge}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 font-normal">{tab.subtitle}</div>
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
