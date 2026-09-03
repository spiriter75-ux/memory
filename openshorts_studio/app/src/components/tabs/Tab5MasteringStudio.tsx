import React, { useState } from 'react';
import { ProjectMaster } from '../../types';

interface Tab5Props {
  project: ProjectMaster;
}

export const Tab5MasteringStudio: React.FC<Tab5Props> = ({ project }) => {
  const [selectedCutIdx, setSelectedCutIdx] = useState<number>(0);
  const [fontSize, setFontSize] = useState<number>(36); // px
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isContinuousPlay, setIsContinuousPlay] = useState<boolean>(true); // ★ 전편 연속 시사회 모드 기본 활성화

  const currentCut = project.cuts[selectedCutIdx] || project.cuts[0];

  const resolveVideoUrl = (path: string | null | undefined): string | null => {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:') || path.startsWith('data:')) {
      return path;
    }
    if (path.startsWith('/')) {
      return `http://127.0.0.1:8288${path}`;
    }
    return `http://127.0.0.1:8288/view?filename=${encodeURIComponent(path)}`;
  };

  const currentVideoUrl = resolveVideoUrl(currentCut?.upscaledVideoPath || currentCut?.draftVideoPath);

  // 영상 재생 종료 시 다음 컷으로 자동 연속 재생
  const handleVideoEnded = () => {
    if (!isContinuousPlay || project.cuts.length <= 1) return;
    const nextIdx = (selectedCutIdx + 1) % project.cuts.length;
    setSelectedCutIdx(nextIdx);
  };

  const handleExportAllSRT = () => {
    let srtText = '';
    let currentTime = 0;

    project.cuts.forEach((cut, idx) => {
      const dur = cut.videoDurationSeconds || 5;
      const startTimeStr = formatSRTTime(currentTime);
      const endTimeStr = formatSRTTime(currentTime + dur);

      srtText += `${idx + 1}\n${startTimeStr} --> ${endTimeStr}\n${cut.dialogueText || cut.originalText}\n\n`;
      currentTime += dur;
    });

    const blob = new Blob([srtText], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title || 'openshorts'}_${project.chapter || 'ch1'}_subtitles.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAllVideos = async () => {
    const renderedCuts = project.cuts.filter((c) => c.upscaledVideoPath || c.draftVideoPath);
    if (renderedCuts.length === 0) {
      alert('렌더링 완료된 비디오가 없습니다. [4. H3 비디오] 탭에서 먼저 비디오를 렌더링하세요.');
      return;
    }

    setIsExporting(true);
    try {
      for (let i = 0; i < renderedCuts.length; i++) {
        const cut = renderedCuts[i];
        const videoSrc = resolveVideoUrl(cut.upscaledVideoPath || cut.draftVideoPath);
        if (!videoSrc) continue;

        const a = document.createElement('a');
        a.href = videoSrc;
        a.download = `${String(cut.cutNumber || i + 1).padStart(2, '0')}_cut_${cut.videoDurationSeconds || 5}s.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        await new Promise((r) => setTimeout(r, 600));
      }
      alert(`총 ${renderedCuts.length}개 컷의 비디오 (.mp4)가 편집기 직행용 번호로 다운로드되었습니다.`);
    } finally {
      setIsExporting(false);
    }
  };

  const formatSRTTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };

  const renderedCount = project.cuts.filter((c) => c.upscaledVideoPath || c.draftVideoPath).length;
  const totalDuration = project.cuts.reduce((acc, c) => acc + (c.videoDurationSeconds || 5), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex items-center justify-between flex-wrap gap-4 shadow-xl">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
              <span>🎞️ 컷 앨범 갤러리 &amp; 전편 연속 시사회</span>
            </h2>
            <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800">
              {renderedCount} / {project.cuts.length} 컷 렌더링됨 ({totalDuration}초 분량)
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            완성된 컷 영상들을 앨범식으로 연속 모니터링하고, 캡컷/프리미어 편집기로 가져갈 파일들을 순서대로 일괄 정리합니다.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          {/* 연속 재생 토글 */}
          <button
            type="button"
            onClick={() => setIsContinuousPlay(!isContinuousPlay)}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 border ${
              isContinuousPlay
                ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-900/40'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
          >
            <span>{isContinuousPlay ? '▶ 전편 연속 재생 ON' : '⏸ 단일 컷 반복'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportAllSRT}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition cursor-pointer"
          >
            📝 자막 (.srt)
          </button>
          <button
            type="button"
            disabled={isExporting}
            onClick={handleExportAllVideos}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-emerald-900/30 cursor-pointer disabled:bg-slate-800 flex items-center space-x-1.5"
          >
            <span>{isExporting ? '⏳ 다운로드 중...' : '📦 편집기용 MP4 일괄 내보내기'}</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Left Monitor (5 Cols) + Right Album Grid (7 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: 9:16 Mobile Smartphone Screening Theater (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="w-full glass-panel p-4 rounded-2xl border border-slate-800 flex flex-col items-center space-y-3 shadow-xl">
            <div className="w-full flex items-center justify-between text-xs font-mono border-b border-slate-800 pb-2">
              <span className="font-bold text-indigo-400">
                🎬 현재 상영: 컷 #{selectedCutIdx + 1} / {project.cuts.length} ({currentCut?.videoDurationSeconds || 5}초)
              </span>
              <span className="text-slate-400">{currentCut?.id}</span>
            </div>

            {/* Smartphone Frame */}
            <div className="w-[300px] h-[540px] bg-[#000000] rounded-[32px] border-[5px] border-slate-700 shadow-2xl relative overflow-hidden flex flex-col justify-between p-3.5">
              {/* Speaker Notch */}
              <div className="w-20 h-3 bg-slate-800 rounded-full mx-auto" />

              {/* Video Player */}
              <div className="flex-1 my-2 rounded-xl bg-[#090D14] flex items-center justify-center relative overflow-hidden text-center">
                {currentVideoUrl ? (
                  <video
                    key={currentVideoUrl}
                    src={currentVideoUrl}
                    autoPlay
                    loop={!isContinuousPlay}
                    muted={false}
                    playsInline
                    controls
                    onEnded={handleVideoEnded}
                    className="w-full h-full object-cover rounded-xl"
                  />
                ) : currentCut?.winnerImagePath ? (
                  <div className="w-full h-full relative">
                    <img
                      src={currentCut.winnerImagePath}
                      alt="2D Still"
                      className="w-full h-full object-cover rounded-xl opacity-60"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 p-3">
                      <span className="text-slate-300 text-[10px] font-mono bg-black/80 px-2.5 py-1 rounded border border-slate-700">
                        📸 2D 스틸 (비디오 미렌더링)
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-600 text-xs font-mono p-4">
                    <span>비디오 미렌더링</span>
                  </div>
                )}

                {/* Subtitle Overlay */}
                {currentCut && (
                  <div className="absolute bottom-6 left-2 right-2 bg-black/80 backdrop-blur-sm p-2 rounded-lg border border-white/10 text-center shadow-lg pointer-events-none">
                    <p
                      style={{ fontSize: `${fontSize * 0.38}px` }}
                      className="font-bold text-white leading-snug tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]"
                    >
                      {currentCut.dialogueText || currentCut.originalText}
                    </p>
                  </div>
                )}
              </div>

              {/* Bottom Bar */}
              <div className="w-24 h-1 bg-slate-600 rounded-full mx-auto" />
            </div>

            {/* Quick Action under player */}
            {currentVideoUrl && (
              <a
                href={currentVideoUrl}
                download={`${String(selectedCutIdx + 1).padStart(2, '0')}_cut_${currentCut.videoDurationSeconds || 5}s.mp4`}
                className="w-full py-2 bg-indigo-900/60 hover:bg-indigo-700 text-indigo-200 text-xs font-bold rounded-xl border border-indigo-700 text-center transition cursor-pointer"
              >
                ⬇️ 현재 상영 컷 단독 MP4 다운로드
              </a>
            )}
          </div>
        </div>

        {/* Right: Video Shot Album Grid (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-200 text-sm flex items-center space-x-2">
                <span>🎞️ 컷별 비디오 앨범 나열 (Shot Album)</span>
              </h3>
              <span className="text-[11px] text-slate-400 font-mono">클릭 시 즉시 해당 컷 재생</span>
            </div>

            {/* Album Grid */}
            {project.cuts.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[580px] overflow-y-auto pr-1">
                {project.cuts.map((cut, idx) => {
                  const videoSrc = resolveVideoUrl(cut.upscaledVideoPath || cut.draftVideoPath);
                  const isSelected = selectedCutIdx === idx;

                  return (
                    <div
                      key={cut.id || idx}
                      onClick={() => setSelectedCutIdx(idx)}
                      className={`p-2.5 rounded-xl border cursor-pointer transition flex flex-col justify-between space-y-2 relative group ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-950/50 ring-2 ring-indigo-400 shadow-lg'
                          : 'border-slate-800 bg-[#090D18] hover:border-slate-700 hover:bg-slate-900/60'
                      }`}
                    >
                      {/* Thumbnail Box */}
                      <div className="w-full h-32 rounded-lg bg-black/60 overflow-hidden relative border border-slate-800 flex items-center justify-center">
                        {videoSrc ? (
                          <video src={videoSrc} className="w-full h-full object-cover" muted />
                        ) : cut.winnerImagePath ? (
                          <img src={cut.winnerImagePath} alt="Still" className="w-full h-full object-cover opacity-60" />
                        ) : (
                          <span className="text-[10px] text-slate-600 font-mono">미생성</span>
                        )}

                        {/* Play badge */}
                        {videoSrc && (
                          <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                            <span className="text-xl">▶</span>
                          </div>
                        )}

                        <span className="absolute top-1.5 left-1.5 bg-black/80 text-white font-mono text-[9px] font-bold px-1.5 py-0.5 rounded">
                          #{idx + 1}
                        </span>
                        <span className="absolute bottom-1.5 right-1.5 bg-indigo-950/90 text-indigo-300 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded border border-indigo-800">
                          {cut.videoDurationSeconds || 5}초
                        </span>
                      </div>

                      {/* Cut Details */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className={`font-bold ${videoSrc ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {videoSrc ? '✅ 렌더링 완료' : '⏳ 미렌더링'}
                          </span>
                          <span className="text-slate-500">{cut.dialogueText ? '대사' : '지문'}</span>
                        </div>
                        <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed font-sans">
                          {cut.dialogueText || cut.originalText || '대사 내용 없음'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-12 text-center text-slate-500 font-mono text-xs border border-dashed border-slate-800 rounded-xl space-y-2">
                <span className="text-2xl block">🎞️</span>
                <span>등록된 컷이 없습니다.</span>
                <p className="text-[11px] text-slate-600">
                  [4. H3 비디오] 탭에서 비디오를 렌더링하거나 다른 탭에서 독립 테스트를 진행하세요.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
